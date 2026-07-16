// История на промените (cursor pagination) и обратна връзка (feedback).

import { nowISO } from "./util.js";

function encCursor(d, i) {
  return btoa(`${d}|${i}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decCursor(c) {
  try {
    const pad = c.length % 4 ? "=".repeat(4 - (c.length % 4)) : "";
    const s = atob(c.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const i = s.lastIndexOf("|");
    return { d: s.slice(0, i), i: Number(s.slice(i + 1)) };
  } catch {
    return null;
  }
}
function safeParse(v) {
  try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}

export async function listChangelog(env, { limit, cursor, category, q } = {}) {
  const n = Math.min(50, Math.max(1, Number(limit) || 15));
  const where = [];
  const binds = [];
  if (category) { where.push("category = ?"); binds.push(String(category)); }
  if (q) { const like = "%" + String(q).slice(0, 80) + "%"; where.push("(title LIKE ? OR summary LIKE ?)"); binds.push(like, like); }
  if (cursor) {
    const dec = decCursor(cursor);
    if (dec && Number.isFinite(dec.i)) { where.push("(published_at < ? OR (published_at = ? AND id < ?))"); binds.push(dec.d, dec.d, dec.i); }
  }
  const sql =
    "SELECT id, version, title, summary, content, category, published_at, affected_route, image_url FROM changelog_entries" +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY published_at DESC, id DESC LIMIT ?";
  binds.push(n + 1);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const rows = results || [];
  const hasMore = rows.length > n;
  const items = rows.slice(0, n).map((r) => ({ ...r, content: safeParse(r.content) }));
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encCursor(last.published_at, last.id) : null;
  return { items, nextCursor, hasMore };
}

const FEEDBACK_TYPES = ["bug", "data", "idea"];
export async function addFeedback(env, f = {}) {
  const type = FEEDBACK_TYPES.includes(f.type) ? f.type : "idea";
  const title = String(f.title || "").slice(0, 200);
  const description = String(f.description || "").slice(0, 4000);
  if (!description && !title) return { error: "empty_feedback" };
  await env.DB.prepare(
    "INSERT INTO feedback (created_at, type, title, description, url, app_version, email, user_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)"
  )
    .bind(nowISO(), type, title, description, String(f.url || "").slice(0, 300), String(f.app_version || "").slice(0, 20), String(f.email || "").slice(0, 200), f.userId || null)
    .run();
  return { ok: true };
}

// Списък със сигналите (за админ таб „Сигнали").
export async function listFeedback(env, limit = 100) {
  const n = Math.min(500, Math.max(1, Number(limit) || 100));
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, type, title, description, url, app_version, email, user_id FROM feedback ORDER BY id DESC LIMIT ?1"
  ).bind(n).all();
  return results || [];
}
