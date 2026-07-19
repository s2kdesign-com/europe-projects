// Admin + internal API за nightly AI pipeline-а. Admin routes се викат СЛЕД admin
// authorization (както handleAdminAI). Internal routes искат HMAC (SCHEDULED_TASK_REPORTING_SECRET).

import {
  createPipelineRun, enqueueProcedureJobs, processJobsBatch, reclaimExpiredLocks,
  cancelPendingJobs, retryFailedJobs, nightlyAlreadyRan, isExcludedPurpose, isPipelinePurpose,
  recomputeAllAggregates, budgetDiagnostics, stopPipeline, stopPurpose, recoverStuckJobs,
  jobsSummary, stuckJobCount,
} from "./pipeline.js";

const NO_STORE = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: NO_STORE });
const ok = (e = {}) => j({ ok: true, ...e });
const err = (c, s = 400) => j({ ok: false, error: c }, s);
const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

async function audit(env, a) {
  try {
    await env.DB.prepare("INSERT INTO ai_audit_log (actor_user_id, action, provider_key, purpose, previous_safe_configuration, new_safe_configuration, result, request_id, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
      .bind(a.actor || null, a.action, null, a.purpose || null, null, a.next || null, a.result || "ok", null, nowISO()).run();
  } catch { /* no-op */ }
}

// ---------- ADMIN ----------
export async function handleAIPipeline(request, env, url, userId, method, readJson) {
  const p = url.pathname;

  if (p === "/api/admin/ai/pipelines" && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM ai_pipeline_runs ORDER BY created_at DESC LIMIT 30").all();
    const active = await env.DB.prepare("SELECT * FROM ai_pipeline_runs WHERE status='running' ORDER BY created_at DESC LIMIT 1").first();
    return ok({ pipelines: rows.results || [], active: active || null });
  }

  const one = /^\/api\/admin\/ai\/pipelines\/([\w-]+)$/.exec(p);
  if (one && method === "GET") {
    const run = await env.DB.prepare("SELECT * FROM ai_pipeline_runs WHERE id=?1").bind(one[1]).first();
    if (!run) return err("not_found", 404);
    const jobs = await env.DB.prepare("SELECT purpose, status, COUNT(*) n FROM ai_jobs WHERE run_id=?1 GROUP BY purpose, status").bind(one[1]).all();
    return ok({ run, jobBreakdown: jobs.results || [] });
  }

  if (p === "/api/admin/ai/pipelines/start" && method === "POST") {
    const body = (await readJson()) || {};
    // Дневният преглед тече ли? (Claude Scheduled Task) → блокирай nightly.
    const running = await env.DB.prepare("SELECT id FROM scheduled_sync_runs WHERE status='running' ORDER BY id DESC LIMIT 1").first();
    if (running && !body.force) return err("daily_review_running", 409);
    const testRun = !!body.testRun;
    const runId = await createPipelineRun(env, { triggerType: "admin_manual", userId, scope: body.scope || "new_and_changed", scopeValue: body.scopeValue || null, country: body.country || null, testRun });
    const res = await enqueueProcedureJobs(env, runId, { scope: body.scope || "new_and_changed", country: body.country || null, entityId: body.entityId || null, force: body.scope === "full_reanalysis", testLimit: testRun ? 3 : null });
    await audit(env, { actor: userId, action: "pipeline_start", next: JSON.stringify({ runId, scope: body.scope, country: body.country }) });
    // Обработи първия batch синхронно (малък), останалото — през continuation.
    await processJobsBatch(env, { runId, limit: 3 });
    return ok({ runId, ...res });
  }

  // Активен pipeline (за Start/Stop състоянието — backend е source of truth).
  if (p === "/api/admin/ai/pipelines/active" && method === "GET") {
    const active = await env.DB.prepare("SELECT * FROM ai_pipeline_runs WHERE status IN ('running','stopping') ORDER BY created_at DESC LIMIT 1").first();
    const stuck = await stuckJobCount(env);
    return ok({ active: active || null, stuck });
  }

  // Безопасно спиране на целия pipeline.
  const stop = /^\/api\/admin\/ai\/pipelines\/([\w-]+)\/stop$/.exec(p);
  if (stop && method === "POST") {
    const body = (await readJson()) || {};
    const res = await stopPipeline(env, stop[1], { userId, cancelPending: body.cancelPending !== false });
    await audit(env, { actor: userId, action: "pipeline_stop", next: JSON.stringify({ runId: stop[1], ...res }) });
    return ok(res);
  }
  // Спиране на отделен agent (purpose).
  const stopP = /^\/api\/admin\/ai\/pipelines\/([\w-]+)\/stop-purpose$/.exec(p);
  if (stopP && method === "POST") {
    const body = (await readJson()) || {};
    if (!isPipelinePurpose(body.purpose)) return err("unknown_purpose", 400);
    const res = await stopPurpose(env, stopP[1], body.purpose);
    await audit(env, { actor: userId, action: "pipeline_stop_purpose", purpose: body.purpose, next: JSON.stringify({ runId: stopP[1], ...res }) });
    return ok(res);
  }
  // Възстановяване на заседнали задачи.
  if (p === "/api/admin/ai/jobs/recover-stuck" && method === "POST") {
    const res = await recoverStuckJobs(env);
    await audit(env, { actor: userId, action: "recover_stuck", next: JSON.stringify(res) });
    return ok(res);
  }
  // Обобщение на задачите (по статус) за run или глобално.
  if (p === "/api/admin/ai/jobs/summary" && method === "GET") {
    return ok(await jobsSummary(env, url.searchParams.get("run") || null));
  }

  const retry = /^\/api\/admin\/ai\/pipelines\/([\w-]+)\/retry-failed$/.exec(p);
  if (retry && method === "POST") {
    const n = await retryFailedJobs(env, retry[1]);
    await audit(env, { actor: userId, action: "pipeline_retry_failed", next: JSON.stringify({ runId: retry[1], requeued: n }) });
    return ok({ requeued: n });
  }
  const cancel = /^\/api\/admin\/ai\/pipelines\/([\w-]+)\/cancel-pending$/.exec(p);
  if (cancel && method === "POST") {
    const n = await cancelPendingJobs(env, cancel[1]);
    await audit(env, { actor: userId, action: "pipeline_cancel_pending", next: JSON.stringify({ runId: cancel[1], cancelled: n }) });
    return ok({ cancelled: n });
  }

  // Стартиране на конкретен purpose (напр. само budget failed).
  const purposeStart = /^\/api\/admin\/ai\/purposes\/([\w]+)\/start$/.exec(p);
  if (purposeStart && method === "POST") {
    const purpose = purposeStart[1];
    if (isExcludedPurpose(purpose)) return err("purpose_not_runnable", 400); // future_chat/daily_review
    if (!isPipelinePurpose(purpose)) return err("unknown_purpose", 400);
    const cfg = await env.DB.prepare("SELECT active FROM ai_model_configurations WHERE purpose=?1 AND active=1 LIMIT 1").bind(purpose).first();
    if (!cfg) return err("no_active_config", 409);
    const body = (await readJson()) || {};
    const testRun = !!body.testRun;
    const runId = await createPipelineRun(env, { triggerType: "admin_manual", userId, scope: body.scope || "new_and_changed", country: body.country || null, testRun });
    // За procedure_analysis пускаме нормалния enqueue; за останалите — само този purpose
    // ще се създаде като зависимост, затова тук enqueue-ваме procedure jobs (те раждат надолу).
    const res = await enqueueProcedureJobs(env, runId, { scope: body.scope || "new_and_changed", country: body.country || null, force: body.scope === "full_reanalysis", testLimit: testRun ? 3 : null });
    await audit(env, { actor: userId, action: "purpose_start", purpose, next: JSON.stringify({ runId, purpose }) });
    await processJobsBatch(env, { runId, limit: 3 });
    return ok({ runId, purpose, ...res });
  }

  const estimate = /^\/api\/admin\/ai\/purposes\/([\w]+)\/estimate$/.exec(p);
  if (estimate && method === "GET") {
    const purpose = estimate[1];
    if (isExcludedPurpose(purpose)) return ok({ purpose, eligible: 0, runnable: false });
    const country = url.searchParams.get("country");
    const scope = url.searchParams.get("scope") || "new_and_changed";
    let where = "1=1"; const binds = [];
    if (country) { where += " AND country_code=?" + (binds.length + 1); binds.push(country); }
    if (scope === "new_and_changed") where += " AND (first_seen >= date('now') OR last_updated >= date('now'))";
    const c = await env.DB.prepare(`SELECT COUNT(*) n FROM projects WHERE ${where}`).bind(...binds).first();
    const cfg = await env.DB.prepare("SELECT provider_key, model_id, display_name FROM ai_model_configurations WHERE purpose=?1 AND active=1 LIMIT 1").bind(purpose).first();
    return ok({ purpose, eligible: c ? c.n : 0, runnable: !!cfg, model: cfg || null, deps: purpose === "recommendation" ? ["procedure_analysis", "document_analysis", "budget_analysis"] : purpose === "procedure_analysis" ? [] : ["procedure_analysis"] });
  }

  // Разписания (автоматично изпълнение).
  if (p === "/api/admin/ai/schedules" && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM ai_schedules ORDER BY purpose").all();
    return ok({ schedules: rows.results || [] });
  }
  const sched = /^\/api\/admin\/ai\/schedules\/([\w]+)$/.exec(p);
  if (sched && method === "PATCH") {
    const purpose = sched[1];
    const body = (await readJson()) || {};
    // Не позволявай автоматично изпълнение без валиден активен модел.
    if (body.automatic_enabled) {
      if (isExcludedPurpose(purpose)) return err("purpose_not_runnable", 400);
      const cfg = await env.DB.prepare("SELECT validation_status FROM ai_model_configurations WHERE purpose=?1 AND active=1 LIMIT 1").bind(purpose).first();
      if (!cfg) return err("no_active_config", 409);
    }
    const fields = ["automatic_enabled", "preferred_time", "fallback_time", "timezone", "max_jobs_per_run", "max_jobs_per_country", "concurrency", "max_attempts", "timeout_ms"];
    const sets = [], binds = [];
    for (const f of fields) if (f in body) { sets.push(`${f}=?${binds.length + 1}`); binds.push(body[f]); }
    if (!sets.length) return err("no_fields");
    binds.push(nowISO()); binds.push(purpose);
    await env.DB.prepare(`UPDATE ai_schedules SET ${sets.join(", ")}, updated_at=?${binds.length - 1} WHERE purpose=?${binds.length}`).bind(...binds).run();
    await audit(env, { actor: userId, action: "schedule_change", purpose, next: JSON.stringify(body) });
    return ok();
  }

  // Преизчисляване на агрегатите (БЕЗ AI разход) — от вече записаните валидни данни.
  if (p === "/api/admin/ai/recompute-aggregates" && method === "POST") {
    const n = await recomputeAllAggregates(env);
    await audit(env, { actor: userId, action: "recompute_aggregates", next: JSON.stringify({ countries: n }) });
    return ok({ recomputed: n });
  }
  // Диагностика на бюджетите по държави.
  if (p === "/api/admin/ai/budget-diagnostics" && method === "GET") {
    return ok({ diagnostics: await budgetDiagnostics(env) });
  }

  // Safe detail за един execution run (за разгъване в „AI логове").
  const runDetail = /^\/api\/admin\/ai\/runs\/([\w-]+)$/.exec(p);
  if (runDetail && method === "GET") {
    const r = await env.DB.prepare(
      "SELECT id, purpose, provider_key, model_id, model_display_name, execution_source, country_code, status, started_at, completed_at, duration_ms, input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, request_count, successful_request_count, failed_request_count, error_code, safe_error_summary, result_summary, result_details_json, result_entity_count, result_change_count, result_warning_count, result_requires_review_count, job_id, parent_run_id FROM ai_execution_runs WHERE id=?1"
    ).bind(runDetail[1]).first();
    if (!r) return err("not_found", 404);
    let details = null;
    if (r.result_details_json) { try { details = JSON.parse(r.result_details_json); } catch { details = null; } }
    // НЕ връщаме: prompt, raw response, ключове, reasoning — тези изобщо не се пазят тук.
    return ok({ run: { ...r, result_details_json: undefined }, details });
  }

  // Jobs listing.
  if (p === "/api/admin/ai/jobs" && method === "GET") {
    const lim = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const conds = [], binds = [];
    for (const [param, col] of [["run", "run_id"], ["purpose", "purpose"], ["status", "status"], ["country", "country_code"], ["entity", "entity_type"]]) {
      const v = url.searchParams.get(param);
      if (v) { conds.push(`${col}=?${binds.length + 1}`); binds.push(v); }
    }
    const where = conds.length ? " WHERE " + conds.join(" AND ") : "";
    const rows = await env.DB.prepare(`SELECT id, run_id, purpose, provider_key, model_id, entity_type, entity_id, country_code, status, priority, attempt_count, duration_ms, input_tokens, output_tokens, error_code, safe_error_summary, created_at, completed_at FROM ai_jobs${where} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${offset}`).bind(...binds).all();
    const total = await env.DB.prepare(`SELECT COUNT(*) n FROM ai_jobs${where}`).bind(...binds).first();
    return ok({ jobs: rows.results || [], total: total ? total.n : 0 });
  }
  const jobOne = /^\/api\/admin\/ai\/jobs\/([\w-]+)$/.exec(p);
  if (jobOne && method === "GET") {
    const job = await env.DB.prepare("SELECT id, run_id, purpose, provider_key, model_id, entity_type, entity_id, country_code, dependency_job_id, source_hash, status, priority, attempt_count, max_attempts, available_at, started_at, completed_at, duration_ms, input_tokens, output_tokens, error_code, safe_error_summary, result_version, created_at, updated_at FROM ai_jobs WHERE id=?1").bind(jobOne[1]).first();
    if (!job) return err("not_found", 404);
    return ok({ job }); // без idempotency_key/locked_by (вътрешни)
  }

  return null;
}

// ---------- INTERNAL (HMAC) ----------
async function verifyHmac(request, env, rawBody) {
  const secret = env.SCHEDULED_TASK_REPORTING_SECRET;
  if (!secret) return false;
  const sig = request.headers.get("x-signature") || "";
  const ts = request.headers.get("x-timestamp") || "";
  if (!sig || !ts) return false;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60000) return false; // ±5 мин
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", k, enc.encode(ts + "." + rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sig;
}

export async function handleAIInternal(request, env, url, method) {
  const p = url.pathname;
  const raw = await request.text();
  if (!(await verifyHmac(request, env, raw))) return err("unauthorized", 401);
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return err("bad_json"); }

  // Daily review приключи → стартирай nightly pipeline (при completed/partial).
  if (p === "/api/internal/ai/daily-review-completed" && method === "POST") {
    const date = body.date || today();
    if (body.status === "failed") return ok({ started: false, reason: "daily_review_failed" });
    if (await nightlyAlreadyRan(env, date)) return ok({ started: false, reason: "already_ran" });
    const runId = await createPipelineRun(env, { triggerType: "daily_review_completion", scheduledDate: date, scope: body.status === "partial" ? "new_and_changed" : "new_and_changed" });
    const res = await enqueueProcedureJobs(env, runId, { scope: "new_and_changed" });
    await processJobsBatch(env, { runId, limit: 3 });
    return ok({ started: true, runId, ...res });
  }

  // Continuation: обработи следващ batch jobs (вика се от cron/self).
  if (p === "/api/internal/ai/jobs/process" && method === "POST") {
    await reclaimExpiredLocks(env);
    const n = await processJobsBatch(env, { runId: body.runId || null, limit: body.limit || 5 });
    return ok({ processed: n });
  }

  // Fallback nightly (cron), ако completion report не е получен.
  if (p === "/api/internal/ai/nightly/start" && method === "POST") {
    const date = body.date || today();
    if (await nightlyAlreadyRan(env, date)) return ok({ started: false, reason: "already_ran" });
    const runId = await createPipelineRun(env, { triggerType: "fallback_cron", scheduledDate: date, scope: "new_and_changed" });
    const res = await enqueueProcedureJobs(env, runId, { scope: "new_and_changed" });
    await processJobsBatch(env, { runId, limit: 3 });
    return ok({ started: true, runId, ...res });
  }

  return err("not_found", 404);
}
