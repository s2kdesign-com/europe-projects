// Cloudflare Worker: обслужва статичния Next.js export (./out), публичния API
// върху D1 и автентикацията/администрацията (./worker/*).

import { handleAuth } from "./worker/handlers.js";
import { logError } from "./worker/db.js";
import { handleProcedurePage, handleStatusLanding, handleProgramsIndex, handleProgramLanding, handleCandidateLanding, handleDeadlineLanding } from "./worker/procedure-page.js";
import { generateSitemap } from "./worker/sitemap.js";
import { handleLocalePage, handleRootSocial } from "./worker/i18n-pages.js";
import { handlePublicAIConfig, handleAIRunReport } from "./worker/ai/handlers.js";
import { handleAIInternal } from "./worker/ai/pipeline-handlers.js";
import { reclaimExpiredLocks, processJobsBatch, driveJobs, createPipelineRun, enqueueProcedureJobs, nightlyAlreadyRan } from "./worker/ai/pipeline.js";
import { handlePlatformStatistics } from "./worker/statistics.js";
import { COUNTRY_CODES, DEFAULT_COUNTRY, normalizeCountry } from "./app/lib/country/countries.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const PROJECT_COLUMNS =
  "id, name, program, priority, category, status, deadline, deadline_date, " +
  "budget, eligible, link, notes, is_new, first_seen, last_updated, year, " +
  "country_code, official_url, managing_authority, original_language, source_id";

// Валидиран country код от заявката (?country=). При липса → BG (съвместимост).
// Невалиден код → null (за 400).
function requestedCountry(url) {
  const raw = url.searchParams.get("country");
  if (raw == null || raw === "") return DEFAULT_COUNTRY;
  return normalizeCountry(raw); // null при невалиден
}

// Legacy навигация: старите ?tab= / ?page= адреси → чисти маршрути (301), като
// запазват само query параметрите, приложими за целевата страница.
const LEGACY_TAB = { overview: "/", procedures: "/procedures", calendar: "/calendar", saved: "/saved", changelog: "/changelog" };
const LEGACY_PAGE = { terms: "/terms", privacy: "/privacy", cookies: "/cookies", changelog: "/changelog" };
const TAB_KEEP = {
  overview: ["period", "activityPeriod", "candidateType", "program"],
  procedures: ["q", "status", "deadline", "program", "target", "sort", "view"],
  calendar: ["month", "year", "view"],
  saved: [],
  changelog: ["category", "version", "search"],
};
function legacyRedirect(url) {
  if (url.pathname !== "/") return null;
  const tab = url.searchParams.get("tab");
  const page = url.searchParams.get("page");
  let target = null, keep = [];
  if (page && LEGACY_PAGE[page]) { target = LEGACY_PAGE[page]; keep = []; }
  else if (tab && LEGACY_TAB[tab]) { target = LEGACY_TAB[tab]; keep = TAB_KEEP[tab] || []; }
  if (!target) return null;
  const kept = new URLSearchParams();
  for (const k of keep) { const v = url.searchParams.get(k); if (v) kept.set(k, v); }
  const qs = kept.toString();
  const dest = new URL(qs ? `${target}?${qs}` : target, url.origin).toString();
  return Response.redirect(dest, 301);
}

// Каноничен домейн (от APP_URL). Всяка заявка към стария workers.dev адрес се
// пренасочва тук — за да работи логинът/сайтът само на euro-funds.eu.
function canonicalRedirect(url, env) {
  if (!env.APP_URL) return null;
  let canonical;
  try {
    canonical = new URL(env.APP_URL);
  } catch {
    return null;
  }
  // http → https на каноничния домейн (SEO: един протокол, един host).
  if (url.hostname === canonical.hostname) {
    if (url.protocol === "http:") {
      const dest = new URL(url.pathname + url.search, canonical.origin);
      return Response.redirect(dest.toString(), 301);
    }
    return null;
  }
  // www.<canonical> и *.workers.dev → каноничния домейн.
  if (url.hostname !== "www." + canonical.hostname && !url.hostname.endsWith(".workers.dev")) return null;
  const dest = new URL(url.pathname + url.search, canonical.origin);
  return Response.redirect(dest.toString(), 301);
}

export default {
  // Cloudflare Cron Trigger (fallback nightly + job continuation). Ако completion
  // report от daily review не е получен — cron стартира nightly-я; иначе само
  // обработва чакащи jobs на малки batch-ове.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await reclaimExpiredLocks(env);
        // Настройваем от админа час на nightly старта (ai_schedules.preferred_time на
        // procedure_analysis, в неговата timezone — по подразбиране 23:30 Europe/Sofia).
        const cfg = await env.DB.prepare("SELECT preferred_time, timezone FROM ai_schedules WHERE purpose='procedure_analysis'").first().catch(() => null);
        const tz = (cfg && cfg.timezone) || "Europe/Sofia";
        const want = (cfg && cfg.preferred_time) || "23:30";
        // Текущо време в конфигурираната зона (HH:MM).
        let localHM = "00:00";
        try {
          const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
          localHM = parts;
        } catch { /* при невалидна зона → UTC */ localHM = new Date().toISOString().slice(11, 16); }
        // Cron-ът е на всеки 2 мин → съвпадение в прозорец [want, want+2min).
        const toMin = (hm) => { const [h, m] = String(hm).split(":").map(Number); return h * 60 + m; };
        const nowMin = toMin(localHM), wantMin = toMin(want);
        const inWindow = nowMin >= wantMin && nowMin < wantMin + 2;
        const date = new Date().toISOString().slice(0, 10);
        if (inWindow && !(await nightlyAlreadyRan(env, date))) {
          const running = await env.DB.prepare("SELECT id FROM scheduled_sync_runs WHERE status='running' ORDER BY id DESC LIMIT 1").first().catch(() => null);
          if (!running) {
            const runId = await createPipelineRun(env, { triggerType: "fallback_cron", scheduledDate: date, scope: "new_and_changed" });
            await enqueueProcedureJobs(env, runId, { scope: "new_and_changed" });
            await driveJobs(env, { runId, budgetMs: 22000, batch: 4 });
          }
        } else {
          // Continuation: обработи чакащи jobs от активния run.
          const active = await env.DB.prepare("SELECT id FROM ai_pipeline_runs WHERE status IN ('running','stopping') ORDER BY created_at DESC LIMIT 1").first().catch(() => null);
          if (active) await driveJobs(env, { runId: active.id, budgetMs: 22000, batch: 4 });
        }
      } catch { /* cron не бива да хвърля */ }
    })());
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Пренасочване на стария домейн към каноничния (euro-funds.eu).
    const redirect = canonicalRedirect(url, env);
    if (redirect) return redirect;

    // Legacy ?tab= / ?page= → чисти маршрути (301).
    const legacy = legacyRedirect(url);
    if (legacy) return legacy;

    // Динамичен sitemap от D1.
    if (request.method === "GET" && pathname === "/sitemap.xml") {
      try { return await generateSitemap(env); } catch { /* пада към статичния файл */ }
    }

    // Landing (програми/кандидати/срокове/статус) + procedure detail.
    if (request.method === "GET" && /^\/procedures\/[^/]+/.test(pathname)) {
      try {
        const landing =
          (await handleProgramsIndex(request, env, url)) ||
          (await handleProgramLanding(request, env, url)) ||
          (await handleCandidateLanding(request, env, url)) ||
          (await handleDeadlineLanding(request, env, url)) ||
          (await handleStatusLanding(request, env, url));
        if (landing) return landing;
        const resp = await handleProcedurePage(request, env, url);
        if (resp) return resp;
      } catch (e) {
        await logError(env, { source: "server", method: "GET", path: pathname, status: 500, message: String((e && e.message) || e), detail: String((e && e.stack) || "") }).catch(() => {});
      }
    }

    // Езикови URL-и (/bg, /en, /de) → БГ статика с локализиран <head> + пълни
    // социални OG тагове + hreflang.
    if (request.method === "GET" && /^\/(bg|en|de)(\/|$)/.test(pathname)) {
      try {
        const loc = await handleLocalePage(request, env, url);
        if (loc) return loc;
      } catch (e) {
        await logError(env, { source: "server", method: "GET", path: pathname, status: 500, message: String((e && e.message) || e), detail: "" }).catch(() => {});
      }
    }
    // Бара / (и app-shell пътищата без префикс) → английски социални OG тагове.
    if (request.method === "GET" && (pathname === "/" || /^\/(procedures|calendar|saved|changelog|about|how-ai-works|terms|privacy|cookies|sources)$/.test(pathname))) {
      try {
        const rootSoc = await handleRootSocial(request, env, url);
        if (rootSoc) return rootSoc;
      } catch (e) {
        await logError(env, { source: "server", method: "GET", path: pathname, status: 500, message: String((e && e.message) || e), detail: "" }).catch(() => {});
      }
    }

    // Информация за текущия deployment — винаги прясна (no-cache), за да могат
    // старите отворени клиенти да разберат, че има нов build. Кешираме статичните
    // asset-и нормално; само този endpoint е без кеш.
    if (pathname === "/version.json") {
      let body = '{"version":"0.0.0","buildId":"unknown"}';
      try {
        const res = await env.ASSETS.fetch(new URL("/version.json", url.origin));
        if (res.ok) body = await res.text();
      } catch { /* ако липсва asset, връщаме резервна стойност */ }
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store, no-cache, must-revalidate",
          "pragma": "no-cache",
          "expires": "0",
        },
      });
    }

    try {
      // Публична безопасна AI конфигурация (за footer-а) — само display данни.
      if (pathname === "/api/ai/public-configuration" && request.method === "GET") {
        return handlePublicAIConfig(env);
      }
      // Публична платформена статистика (за /about) — последният успешен snapshot.
      if (pathname === "/api/public/platform-statistics" && request.method === "GET") {
        return handlePlatformStatistics(request, env);
      }
      // Internal: отчет от Scheduled Task (HMAC + timestamp + idempotency).
      if (pathname === "/api/internal/ai-runs/report" && request.method === "POST") {
        return handleAIRunReport(request, env);
      }
      // Internal: nightly AI pipeline (HMAC): daily-review-completed / jobs/process / nightly/start.
      if (pathname.startsWith("/api/internal/ai/") && request.method === "POST") {
        return handleAIInternal(request, env, url, request.method);
      }

      // Приблизителна държава от Cloudflare (без raw IP). Само код на държавата.
      if (pathname === "/api/geo") {
        const cc = normalizeCountry(request.cf && request.cf.country);
        return new Response(JSON.stringify({ country: cc, ok: true }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        });
      }

      if (pathname === "/api/countries") {
        const rows = await env.DB.prepare(
          "SELECT code, slug, name_bg, native_name, english_name, default_language, currency_code, flag_asset, enabled, coverage_status, ingestion_status, priority, source_count, active_source_count, last_successful_sync_at FROM countries ORDER BY priority"
        ).all();
        return json({ countries: rows.results || [], ok: true });
      }

      // Country-aware профилни опции (batch): региони + програми + валута.
      // Профилът НЕ ползва hardcoded български области/програми/BGN.
      if (pathname === "/api/countries/profile-options") {
        const country = requestedCountry(url);
        if (!country) return json({ ok: false, error: "invalid_country" }, 400);
        const regions = await env.DB.prepare(
          "SELECT code, name, native_name FROM country_regions WHERE country_code=?1 AND enabled=1 AND level=1 ORDER BY sort_order"
        ).bind(country).all();
        const programmes = await env.DB.prepare(
          "SELECT program AS name, COUNT(*) AS active_count FROM projects WHERE country_code=?1 AND program IS NOT NULL AND program != '' GROUP BY program ORDER BY active_count DESC"
        ).bind(country).all();
        const meta = await env.DB.prepare("SELECT code, currency_code, enabled, coverage_status, ingestion_status FROM countries WHERE code=?1").bind(country).first();
        return json({
          ok: true,
          country,
          currency: meta ? meta.currency_code : "EUR",
          enabled: meta ? !!meta.enabled : false,
          coverageStatus: meta ? meta.coverage_status : "none",
          regions: regions.results || [],
          programmes: programmes.results || [],
        });
      }

      // Публичен списък на официалните източници за държава. Само безопасни полета —
      // без вътрешни parser грешки / инфраструктурни детайли.
      if (pathname === "/api/sources") {
        const country = requestedCountry(url);
        if (!country) return json({ ok: false, error: "invalid_country" }, 400);
        const rows = await env.DB.prepare(
          "SELECT id, name, authority_name, authority_type, base_url, calls_url, programmes_url, source_type, source_level, official, primary_source, coverage_description, source_language, update_frequency, verified, source_health, last_success_at, last_checked_at FROM funding_sources WHERE country_code = ?1 ORDER BY priority"
        ).bind(country).all();
        const meta = await env.DB.prepare(
          "SELECT code, name_bg, native_name, english_name, coverage_status, ingestion_status, enabled, last_successful_sync_at, last_source_audit_at FROM countries WHERE code = ?1"
        ).bind(country).first();
        return json({ country, meta: meta || null, sources: rows.results || [], ok: true });
      }

      if (pathname === "/api/projects") {
        if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
        const country = requestedCountry(url);
        if (!country) return json({ ok: false, error: "invalid_country" }, 400);
        // Задължителен country филтър (backend, не само frontend).
        const projects = await env.DB.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE country_code = ?1 ORDER BY status, deadline_date`).bind(country).all();
        const counts = await env.DB.prepare("SELECT d.project_id AS project_id, COUNT(*) AS n FROM documents d JOIN projects p ON p.id = d.project_id WHERE p.country_code = ?1 GROUP BY d.project_id").bind(country).all();
        const countMap = new Map((counts.results || []).map((r) => [r.project_id, r.n]));
        const snapshot = await env.DB.prepare("SELECT id, run_date, summary, created_at FROM snapshots ORDER BY id DESC LIMIT 1").first();
        const rows = (projects.results || []).map((p) => ({ ...p, doc_count: countMap.get(p.id) || 0 }));
        return json({ projects: rows, snapshot: snapshot || null, country, ok: true });
      }

      if (pathname === "/api/project") {
        const id = url.searchParams.get("id");
        if (!id) return json({ ok: false, error: "missing_id" }, 400);
        const project = await env.DB.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?1`).bind(id).first();
        if (!project) return json({ ok: false, error: "not_found" }, 404);
        const docs = await env.DB.prepare("SELECT id, project_id, title, doc_type, content, source_url FROM documents WHERE project_id = ?1 ORDER BY id").bind(id).all();
        return json({ project, documents: docs.results || [], ok: true });
      }

      if (pathname === "/api/documents") {
        const id = url.searchParams.get("project_id");
        if (!id) return json({ ok: false, error: "missing_project_id" }, 400);
        const docs = await env.DB.prepare("SELECT id, project_id, title, doc_type, content, source_url FROM documents WHERE project_id = ?1 ORDER BY id").bind(id).all();
        return json({ documents: docs.results || [], ok: true });
      }

      const authResp = await handleAuth(request, env, url);
      if (authResp) return authResp;

      if (pathname.startsWith("/api/")) return json({ ok: false, error: "not_found" }, 404);
    } catch (e) {
      // Журналираме сървърната грешка (за таб „Exceptions") — без да чупим отговора.
      await logError(env, {
        source: "server", method: request.method, path: pathname, status: 500,
        message: String((e && e.message) || e), detail: String((e && e.stack) || ""),
      }).catch(() => {});
      return json({ ok: false, error: "server_error" }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};
