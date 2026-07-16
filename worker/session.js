// Сървърно управлявани сесии в D1. В базата се пази само ХЕШ на токена;
// суровият токен живее единствено в HttpOnly бисквитка.

import { hashSessionToken, isoPlusSeconds, nowISO, parseCookies, randomToken, serializeCookie, uuid } from "./util.js";

export const SESSION_COOKIE = "evp_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дни

export async function createSession(env, userId, userAgent) {
  const token = randomToken(32);
  const hash = await hashSessionToken(env.AUTH_SECRET, token);
  const id = uuid();
  const now = nowISO();
  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, session_token_hash, expires_at, created_at, last_used_at, user_agent) VALUES (?1,?2,?3,?4,?5,?5,?6)"
  )
    .bind(id, userId, hash, isoPlusSeconds(SESSION_TTL_SECONDS), now, (userAgent || "").slice(0, 200))
    .run();
  return { token, id };
}

export function sessionSetCookie(token, secure) {
  return serializeCookie(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "Lax", maxAge: SESSION_TTL_SECONDS, path: "/" });
}
export function sessionClearCookie(secure) {
  return serializeCookie(SESSION_COOKIE, "", { httpOnly: true, secure, sameSite: "Lax", maxAge: 0, path: "/" });
}

// Връща { user, session } или null. Изтрива изтекли сесии лениво.
export async function getSession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const hash = await hashSessionToken(env.AUTH_SECRET, token);
  const session = await env.DB.prepare("SELECT * FROM sessions WHERE session_token_hash = ?1").bind(hash).first();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?1").bind(session.id).run();
    return null;
  }
  const user = await env.DB.prepare("SELECT id, email, email_verified, display_name, avatar_url, locale, role, created_at, last_login_at FROM users WHERE id = ?1")
    .bind(session.user_id)
    .first();
  if (!user) return null;
  await env.DB.prepare("UPDATE sessions SET last_used_at = ?1 WHERE id = ?2").bind(nowISO(), session.id).run();
  return { user, session };
}

export async function destroySessionByToken(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  const hash = await hashSessionToken(env.AUTH_SECRET, token);
  await env.DB.prepare("DELETE FROM sessions WHERE session_token_hash = ?1").bind(hash).run();
}

export async function destroyAllUserSessions(env, userId) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId).run();
}
