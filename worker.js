// Cloudflare Worker: обслужва статичния Next.js export (./out), публичния API
// върху D1 и автентикацията/администрацията (./worker/*).

import { handleAuth } from "./worker/handlers.js";
import { logError } from "./worker/db.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" };
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const PROJECT_COLUMNS =
  "id, name, program, priority, category, status, deadline, deadline_date, " +
  "budget, eligible, link, notes, is_new, first_seen, last_updated, year";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

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
