// Cloudflare Worker: обслужва статичните файлове (Next export от ./out)
// и връща данните от D1 на адрес /api/projects.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/projects") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM projects ORDER BY program, status, deadline_date"
        ).all();
        const docs = await env.DB.prepare(
          "SELECT id, project_id, title, doc_type, content, source_url FROM documents ORDER BY id"
        ).all();
        const snapshot = await env.DB.prepare(
          "SELECT * FROM snapshots ORDER BY id DESC LIMIT 1"
        ).first();
        return Response.json({
          projects: results || [],
          documents: docs.results || [],
          snapshot: snapshot || null,
          ok: true,
        });
      } catch (e) {
        return Response.json(
          { projects: [], documents: [], snapshot: null, ok: false, er