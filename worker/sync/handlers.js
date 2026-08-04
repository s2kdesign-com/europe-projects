// Администрация на дневната синхронизация (v2.52.0).
//
// Всичко под `/api/admin/sync/*` — само за админ сесия (рутерът в handlers.js
// вече е проверил ролята и е забранил Bearer токен за /api/admin/*).
// Плюс internal endpoint за отчет от Scheduled Task (HMAC), който записва
// разширените метрики в `scheduled_sync_runs`.
//
// Правило: НИКАКВИ времена от Worker-а — `datetime('now')` идва от D1.

const NO_STORE = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const j = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: NO_STORE });
const ok = (extra = {}) => j({ ok: true, ...extra });
const bad = (code, status = 400) => j({ ok: false, error: code }, status);

const MAX_LIMIT = 200;
const lim = (url, def = 50) => {
  const v = Number(url.searchParams.get("limit"));
  return Number.isFinite(v) && v > 0 ? Math.min(MAX_LIMIT, Math.floor(v)) : def;
};
const off = (url) => {
  const v = Number(url.searchParams.get("offset"));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};
const p = (url, name, max = 60) => {
  const v = url.searchParams.get(name);
  if (!v) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

const RUN_FIELDS = `id, task_key, started_at, completed_at, status, cycle_number,
  start_country_code, end_country_code, countries_attempted, countries_succeeded, countries_failed,
  sources_attempted, sources_succeeded, sources_failed, records_seen, records_inserted,
  records_updated, records_unchanged, records_invalid, documents_inserted, continuation_country_code,
  safe_summary, countries_touched, countries_fully_processed, sources_checked, new_sources_discovered,
  source_failures, procedures_discovered, procedures_created, procedures_updated, procedures_unchanged,
  procedures_completed, procedures_revisited, documents_discovered, documents_downloaded,
  document_versions_added, budgets_extracted, budgets_converted, eligibility_records_added,
  anomalies_detected, changes_recorded, average_quality_score, document_coverage_before,
  document_coverage_after, budget_coverage_before, budget_coverage_after,
  next_country, next_source, next_cursor, countries_json, sources_json,
  time_allocation_json, blocked_sources_json`;

export async function handleSyncAdmin(request, env, url, userId, method) {
  const { pathname } = url;
  if (!pathname.startsWith("/api/admin/sync")) return null;
  if (method !== "GET") return bad("method_not_allowed", 405);

  try {
    // ── Списък с изпълнения ────────────────────────────────────────────────
    if (pathname === "/api/admin/sync/runs") {
      const status = p(url, "status", 20);
      const taskKey = p(url, "task", 60);
      const country = p(url, "country", 4);
      const limit = lim(url, 25);
      const offset = off(url);
      const where = `WHERE (?1 IS NULL OR status = ?1)
                       AND (?2 IS NULL OR task_key = ?2)
                       AND (?3 IS NULL OR start_country_code = ?3 OR end_country_code = ?3
                            OR countries_json LIKE '%"' || ?3 || '"%')`;
      const [{ results }, total] = await Promise.all([
        env.DB.prepare(
          `SELECT ${RUN_FIELDS} FROM scheduled_sync_runs ${where} ORDER BY id DESC LIMIT ?4 OFFSET ?5`
        ).bind(status, taskKey, country, limit, offset).all(),
        env.DB.prepare(`SELECT COUNT(*) AS n FROM scheduled_sync_runs ${where}`).bind(status, taskKey, country).first(),
      ]);
      return ok({ runs: (results || []).map(expandRun), total: (total && total.n) || 0 });
    }

    // ── Детайли за едно изпълнение ─────────────────────────────────────────
    if (pathname.startsWith("/api/admin/sync/runs/")) {
      const id = Number(decodeURIComponent(pathname.slice("/api/admin/sync/runs/".length)));
      if (!Number.isFinite(id)) return bad("invalid_id", 400);
      const run = await env.DB.prepare(`SELECT ${RUN_FIELDS} FROM scheduled_sync_runs WHERE id = ?1`).bind(id).first();
      if (!run) return bad("not_found", 404);
      const [anomalies, changes, health] = await Promise.all([
        env.DB.prepare(
          `SELECT anomaly_type, severity, COUNT(*) AS n FROM project_anomalies WHERE run_id = ?1 GROUP BY anomaly_type, severity ORDER BY n DESC`
        ).bind(String(id)).all().catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT change_type, significance, COUNT(*) AS n FROM project_change_history WHERE run_id = ?1 GROUP BY change_type, significance ORDER BY n DESC`
        ).bind(String(id)).all().catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT source_id, country_code, health, http_status, response_time_ms, procedures_found, procedures_valid, error_summary, checked_at
             FROM source_health_history WHERE run_id = ?1 ORDER BY id DESC LIMIT 100`
        ).bind(String(id)).all().catch(() => ({ results: [] })),
      ]);
      return ok({
        run: expandRun(run),
        anomalies: anomalies.results || [],
        changes: changes.results || [],
        sourceHealth: health.results || [],
      });
    }

    // ── Текущ cursor и какво следва ────────────────────────────────────────
    if (pathname === "/api/admin/sync/cursor") {
      const [cursor, pages, lastRun] = await Promise.all([
        env.DB.prepare("SELECT * FROM scheduled_country_sync_state ORDER BY task_key LIMIT 5").all().catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT task_key, country_code, source_id, section, page, item_offset, last_procedure_id, pages_seen, exhausted, updated_at
             FROM source_pagination_cursors WHERE exhausted = 0 ORDER BY updated_at DESC LIMIT 50`
        ).all().catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT id, status, completed_at, next_country, next_source, next_cursor, continuation_country_code
             FROM scheduled_sync_runs ORDER BY id DESC LIMIT 1`
        ).first().catch(() => null),
      ]);
      return ok({ cursors: cursor.results || [], paginationCursors: pages.results || [], lastRun: lastRun || null });
    }

    // ── Аномалии ───────────────────────────────────────────────────────────
    if (pathname === "/api/admin/sync/anomalies") {
      const country = p(url, "country", 4);
      const type = p(url, "type", 40);
      const status = p(url, "status", 20) || "open";
      const runId = p(url, "run", 60);
      const limit = lim(url, 100);
      const { results } = await env.DB.prepare(
        `SELECT a.id, a.project_id, a.country_code, a.anomaly_type, a.severity, a.field_name,
                a.observed_value, a.expected_value, a.page_value, a.document_value, a.source_url,
                a.run_id, a.status, a.notes, a.detected_at, p.name AS project_name
           FROM project_anomalies a LEFT JOIN projects p ON p.id = a.project_id
          WHERE a.status = ?1
            AND (?2 IS NULL OR a.country_code = ?2)
            AND (?3 IS NULL OR a.anomaly_type = ?3)
            AND (?4 IS NULL OR a.run_id = ?4)
          ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.id DESC
          LIMIT ?5`
      ).bind(status, country, type, runId, limit).all();
      const byType = await env.DB.prepare(
        "SELECT anomaly_type, severity, COUNT(*) AS n FROM project_anomalies WHERE status='open' GROUP BY anomaly_type, severity ORDER BY n DESC"
      ).all().catch(() => ({ results: [] }));
      return ok({ anomalies: results || [], summary: byType.results || [] });
    }

    // ── История на промените ───────────────────────────────────────────────
    if (pathname === "/api/admin/sync/changes") {
      const country = p(url, "country", 4);
      const type = p(url, "type", 40);
      const project = p(url, "project", 200);
      const runId = p(url, "run", 60);
      const limit = lim(url, 100);
      const { results } = await env.DB.prepare(
        `SELECT h.id, h.project_id, h.country_code, h.field_name, h.old_value, h.new_value,
                h.change_type, h.significance, h.detected_from, h.source_url, h.run_id, h.changed_at,
                p.name AS project_name
           FROM project_change_history h LEFT JOIN projects p ON p.id = h.project_id
          WHERE (?1 IS NULL OR h.country_code = ?1)
            AND (?2 IS NULL OR h.change_type = ?2)
            AND (?3 IS NULL OR h.project_id = ?3)
            AND (?4 IS NULL OR h.run_id = ?4)
          ORDER BY h.id DESC LIMIT ?5`
      ).bind(country, type, project, runId, limit).all();
      return ok({ changes: results || [] });
    }

    // ── Backlog: какво остава да се допълни ────────────────────────────────
    if (pathname === "/api/admin/sync/backlog") {
      const country = p(url, "country", 4);
      const { results } = await env.DB.prepare(
        `SELECT c.code,
                (SELECT COUNT(*) FROM projects p WHERE p.country_code = c.code) AS total,
                (SELECT COUNT(*) FROM projects p LEFT JOIN documents d ON d.project_id = p.id
                  WHERE p.country_code = c.code AND d.id IS NULL) AS missing_documents,
                (SELECT COUNT(*) FROM projects p WHERE p.country_code = c.code AND p.budget_amount_eur IS NULL) AS missing_budget,
                (SELECT COUNT(*) FROM projects p LEFT JOIN project_details pd ON pd.project_id = p.id
                  WHERE p.country_code = c.code AND (pd.project_id IS NULL OR pd.completeness_score IS NULL)) AS missing_quality,
                (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code = c.code AND pd.has_primary_document = 1) AS with_primary_document,
                (SELECT COUNT(*) FROM project_anomalies a WHERE a.country_code = c.code AND a.status = 'open') AS open_anomalies,
                c.last_successful_sync_at
           FROM countries c
          WHERE c.eu_member = 1 AND (?1 IS NULL OR c.code = ?1)
          ORDER BY missing_documents DESC, missing_budget DESC, c.priority ASC`
      ).bind(country).all();
      return ok({ backlog: results || [] });
    }

    // ── Източници + здраве ─────────────────────────────────────────────────
    if (pathname === "/api/admin/sync/sources") {
      const country = p(url, "country", 4);
      const health = p(url, "health", 20);
      const { results } = await env.DB.prepare(
        `SELECT id, country_code, name, authority_name, authority_type, source_type, source_level,
                base_url, calls_url, archive_url, search_url, rss_url, api_url, sitemap_url,
                source_language, requires_javascript, requires_pagination, supports_api, supports_rss,
                supports_sitemap, access_method, enabled, verified, source_health, blocked_reason,
                last_checked_at, last_success_at, last_failure_at, last_http_status, avg_response_time_ms,
                last_procedures_found, last_procedures_valid, total_procedures_found, total_procedures_valid,
                consecutive_failures, discovery_method, discovered_at
           FROM funding_sources
          WHERE (?1 IS NULL OR country_code = ?1) AND (?2 IS NULL OR source_health = ?2)
          ORDER BY country_code, priority, id LIMIT ?3`
      ).bind(country, health, lim(url, 200)).all();
      return ok({ sources: results || [] });
    }

    // ── Кандидати за нови източници ────────────────────────────────────────
    if (pathname === "/api/admin/sync/candidates") {
      const country = p(url, "country", 4);
      const status = p(url, "status", 20);
      const { results } = await env.DB.prepare(
        `SELECT id, country_code, candidate_url, normalized_url, title, authority_name, authority_type,
                source_type, language, discovered_from, discovery_method, http_status, content_type,
                evidence_url, official_confidence, status, rejection_reason, promoted_source_id,
                run_id, first_seen_at, last_checked_at
           FROM source_discovery_candidates
          WHERE (?1 IS NULL OR country_code = ?1) AND (?2 IS NULL OR status = ?2)
          ORDER BY COALESCE(official_confidence, 0) DESC, id DESC LIMIT ?3`
      ).bind(country, status, lim(url, 100)).all();
      return ok({ candidates: results || [] });
    }

    // ── Качество: разпределение и конкретни процедури ──────────────────────
    if (pathname === "/api/admin/sync/quality") {
      const country = p(url, "country", 4);
      const status = p(url, "status", 20);
      const missing = p(url, "missing", 20); // documents|budget
      const [dist, rows] = await Promise.all([
        env.DB.prepare(
          `SELECT COALESCE(pd.quality_status,'unknown') AS quality_status, COUNT(*) AS n
             FROM projects p LEFT JOIN project_details pd ON pd.project_id = p.id
            WHERE (?1 IS NULL OR p.country_code = ?1)
            GROUP BY 1 ORDER BY n DESC`
        ).bind(country).all().catch(() => ({ results: [] })),
        env.DB.prepare(
          `SELECT p.id, p.name, p.country_code, p.status, p.deadline_date, p.budget_amount_eur,
                  pd.completeness_score, pd.quality_status, pd.has_primary_document,
                  (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS document_count
             FROM projects p LEFT JOIN project_details pd ON pd.project_id = p.id
            WHERE (?1 IS NULL OR p.country_code = ?1)
              AND (?2 IS NULL OR COALESCE(pd.quality_status,'unknown') = ?2)
              AND (?3 IS NULL
                   OR (?3 = 'documents' AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.project_id = p.id))
                   OR (?3 = 'budget' AND p.budget_amount_eur IS NULL))
            ORDER BY COALESCE(pd.completeness_score, -1) ASC, p.deadline_date ASC
            LIMIT ?4`
        ).bind(country, status, missing, lim(url, 100)).all(),
      ]);
      return ok({ distribution: dist.results || [], procedures: rows.results || [] });
    }

    return bad("not_found", 404);
  } catch (e) {
    return j({ ok: false, error: "sync_admin_failed", detail: String((e && e.message) || e).slice(0, 200) }, 500);
  }
}

function safeParse(v) {
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

function expandRun(r) {
  if (!r) return r;
  return {
    ...r,
    countries: safeParse(r.countries_json),
    sources: safeParse(r.sources_json),
    timeAllocation: safeParse(r.time_allocation_json),
    blockedSources: safeParse(r.blocked_sources_json),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: отчет от Scheduled Task (HMAC + timestamp, като ai-runs/report).
// ─────────────────────────────────────────────────────────────────────────────
async function hmacValid(env, request, rawBody) {
  const secret = env.SCHEDULED_TASK_REPORTING_SECRET;
  if (!secret) return false;
  const sig = request.headers.get("x-report-signature") || "";
  const ts = request.headers.get("x-report-timestamp") || "";
  if (!sig || !ts) return false;
  const age = Math.abs(Date.now() - Date.parse(ts));
  if (!Number.isFinite(age) || age > 5 * 60000) return false;
  const te = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, te.encode(ts + "." + rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sig.toLowerCase();
}

const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0);
const real = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v, n = 200) => (v === null || v === undefined ? null : String(v).slice(0, n));
const jsonOrNull = (v, n = 20000) => {
  if (v === null || v === undefined) return null;
  try { return JSON.stringify(v).slice(0, n); } catch { return null; }
};

/**
 * POST /api/internal/sync-runs/report
 * Записва пълния отчет на едно изпълнение в `scheduled_sync_runs`.
 * Идемпотентно по `taskRunId` (пази се в next_cursor-независимо поле `safe_summary`
 * не е ключ — затова ключът е (task_key, started_at)).
 */
export async function handleSyncRunReport(request, env) {
  let raw;
  try { raw = await request.text(); } catch { return bad("invalid_body", 400); }
  if (!(await hmacValid(env, request, raw))) return bad("unauthorized", 401);
  let b;
  try { b = JSON.parse(raw); } catch { return bad("invalid_json", 400); }

  const taskKey = str(b.taskKey || "daily-eu-country-sync", 60);
  const startedAt = str(b.startedAt, 40);
  if (!startedAt) return bad("missing_started_at", 400);

  // Идемпотентност: същият task_key + started_at не се записва два пъти.
  const dup = await env.DB.prepare(
    "SELECT id FROM scheduled_sync_runs WHERE task_key = ?1 AND started_at = ?2"
  ).bind(taskKey, startedAt).first();
  if (dup) return ok({ duplicate: true, id: dup.id });

  const m = b.metrics || {};
  await env.DB.prepare(
    `INSERT INTO scheduled_sync_runs (
       task_key, started_at, completed_at, status, cycle_number,
       start_country_code, end_country_code,
       countries_attempted, countries_succeeded, countries_failed,
       sources_attempted, sources_succeeded, sources_failed,
       records_seen, records_inserted, records_updated, records_unchanged, records_invalid,
       documents_inserted, continuation_country_code, safe_summary, created_at,
       countries_touched, countries_fully_processed, sources_checked, new_sources_discovered,
       source_failures, procedures_discovered, procedures_created, procedures_updated,
       procedures_unchanged, procedures_completed, procedures_revisited,
       documents_discovered, documents_downloaded, document_versions_added,
       budgets_extracted, budgets_converted, eligibility_records_added,
       anomalies_detected, changes_recorded, average_quality_score,
       document_coverage_before, document_coverage_after,
       budget_coverage_before, budget_coverage_after,
       next_country, next_source, next_cursor,
       countries_json, sources_json, time_allocation_json, blocked_sources_json
     ) VALUES (
       ?1, ?2, datetime('now'), ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
       ?18, ?19, ?20, datetime('now'),
       ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39,
       ?40, ?41, ?42, ?43, ?44, ?45, ?46, ?47, ?48, ?49, ?50, ?51
     )`
  ).bind(
    taskKey, startedAt,
    ["completed", "success", "partial", "error", "timeout", "running"].includes(b.status) ? b.status : "completed",
    int(b.cycleNumber), str(b.startCountry, 4), str(b.endCountry, 4),
    int(m.countries_touched), int(b.countriesSucceeded), int(b.countriesFailed),
    int(m.sources_checked), int(m.sources_checked) - int(m.source_failures), int(m.source_failures),
    int(m.procedures_discovered), int(m.procedures_created), int(m.procedures_updated),
    int(m.procedures_unchanged), int(b.recordsInvalid),
    int(m.documents_downloaded), str(m.next_country, 4),
    str(b.safeSummary, 1000),
    int(m.countries_touched), int(m.countries_fully_processed), int(m.sources_checked),
    int(m.new_sources_discovered), int(m.source_failures), int(m.procedures_discovered),
    int(m.procedures_created), int(m.procedures_updated), int(m.procedures_unchanged),
    int(m.procedures_completed), int(m.procedures_revisited), int(m.documents_discovered),
    int(m.documents_downloaded), int(m.document_versions_added), int(m.budgets_extracted),
    int(m.budgets_converted), int(m.eligibility_records_added), int(m.anomalies_detected),
    int(m.changes_recorded), real(m.average_quality_score),
    real(m.document_coverage_before), real(m.document_coverage_after),
    real(m.budget_coverage_before), real(m.budget_coverage_after),
    str(m.next_country, 4), str(m.next_source, 120), str(m.next_cursor, 500),
    jsonOrNull(m.countries), jsonOrNull(m.sources), jsonOrNull(m.timeAllocation), jsonOrNull(m.blockedSources)
  ).run();

  const row = await env.DB.prepare(
    "SELECT id FROM scheduled_sync_runs WHERE task_key = ?1 AND started_at = ?2"
  ).bind(taskKey, startedAt).first();
  return ok({ id: (row && row.id) || null });
}

const syncHandlers = { handleSyncAdmin, handleSyncRunReport };
export default syncHandlers;
