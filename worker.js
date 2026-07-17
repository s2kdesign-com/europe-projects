// Cloudflare Worker: обслужва статичния Next.js export (./out), публичния API
// върху D1 и автентикацията/администрацията (./worker/*).

import { handleAuth } from "./worker/handlers.js";
import { logError } from "./worker/db.js";
import { handleProcedurePage, handleStatusLanding, handleProgramsIndex, handleProgramLanding, handleCandidateLanding, handleDeadlineLanding } from "./worker/procedure-page.js";
import { generateSitemap } from "./worker/sitemap.js";
import { handleLocalePage } from "./worker/i18n-pages.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const PROJECT_COLUMNS =
  "id, name, program, priority, category, status, deadline, deadline_date, " +
  "budget, eligible, link, notes, is_new, first_seen, last_updated, year";

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
  if (url.hostname === canonical.hostname) return null;
  if (!url.hostname.endsWith(".workers.dev")) return null;
  const dest = new URL(url.pathname + url.search, canonical.origin);
  return Response.redirect(dest.toString(), 301);
}

export default {
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

    // Езикови URL-и (/en, /de) → БГ статика с преведен <head> + hreflang.
    if (request.method === "GET" && /^\/(en|de)(\/|$)/.test(pathname)) {
      try {
        const loc = await handleLocalePage(request, env, url);
        if (loc) return loc;
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
      if (pathname === "/api/projects") {
        if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
        const projects = await env.DB.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY status, deadline_date`).all();
        const counts = await env.DB.prepare("SELECT project_id, COUNT(*) AS n FROM documents GROUP BY project_id").all();
        const countMap = new Map((counts.results || []).map((r) => [r.project_id, r.n]));
        const snapshot = await env.DB.prepare("SELECT id, run_date, summary, created_at FROM snapshots ORDER BY id DESC LIMIT 1").first();
        const rows = (projects.results || []).map((p) => ({ ...p, doc_count: countMap.get(p.id) || 0 }));
        return json({ projects: rows, snapshot: snapshot || null, ok: true });
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
