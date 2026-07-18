// Route handler-и за автентикация, лични данни, администрация и публични API-та.

import { err, isSecure, nowISO, ok, parseCookies, safeReturnTo, serializeCookie, uuid, isoPlusSeconds } from "./util.js";
import { buildAuthUrl, callbackUrl, createPkce, exchangeCode, verifyIdToken } from "./oauth.js";
import { createSession, destroySessionByToken, getSession, sessionClearCookie, sessionSetCookie } from "./session.js";
import { listChangelog, addFeedback, listFeedback } from "./changelog.js";
import * as data from "./db.js";
import { LOCALE_CODES } from "../app/lib/i18n/locales.js";
import { normalizeCountry } from "../app/lib/country/countries.js";
import { handleAdminAI } from "./ai/handlers.js";
import { getSupportedLanguages, translateBatch } from "./translation.js";
import { isTranslationConfigured } from "./gauth.js";
import { GLOSSARY_VERSION } from "../app/lib/i18n/glossary.js";

async function systemInfo(env) {
  const one = async (sql) => { try { const r = await env.DB.prepare(sql).first(); return r ? Object.values(r)[0] : 0; } catch { return null; } };
  const [cacheEntries, cacheLangs, users, changelog, saved, documents, projects, lastRun] = await Promise.all([
    one("SELECT COUNT(*) FROM translation_cache"),
    one("SELECT COUNT(DISTINCT target_language) FROM translation_cache"),
    one("SELECT COUNT(*) FROM users"),
    one("SELECT COUNT(*) FROM changelog_entries"),
    one("SELECT COUNT(*) FROM saved_procedures"),
    one("SELECT COUNT(*) FROM documents"),
    one("SELECT COUNT(*) FROM projects"),
    one("SELECT run_date FROM snapshots ORDER BY id DESC LIMIT 1"),
  ]);
  return {
    translation: {
      configured: isTranslationConfigured(env),
      provider: "Google Cloud Translation v3",
      location: env.GOOGLE_TRANSLATE_LOCATION || "global",
      glossaryEnabled: !!env.GOOGLE_TRANSLATE_GLOSSARY_ID,
      glossaryVersion: GLOSSARY_VERSION,
      languages: LOCALE_CODES.length,
      cacheEntries, cacheLanguages: cacheLangs,
    },
    counts: { users, changelog, saved, documents, projects },
    dailyTask: { lastRun: lastRun || null },
    appUrl: env.APP_URL || null,
  };
}

const OAUTH_COOKIE = "evp_oauth";

function sameOrigin(request, env, url) {
  const origin = request.headers.get("Origin");
  const appHost = env.APP_URL ? safeHost(env.APP_URL) : null;
  if (origin) { const oh = safeHost(origin); return oh != null && (oh === url.host || oh === appHost); }
  const ref = request.headers.get("Referer");
  if (ref) { const rh = safeHost(ref); return rh != null && (rh === url.host || rh === appHost); }
  return false;
}
function safeHost(u) { try { return new URL(u).host; } catch { return null; } }
function redirect(location, headers = {}) { return new Response(null, { status: 302, headers: { location, ...headers } }); }
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function refererPath(request) { try { return new URL(request.headers.get("Referer")).pathname; } catch { return "/"; } }

async function startGoogle(request, env, url) {
  if (!env.GOOGLE_CLIENT_ID) return err("oauth_not_configured", 500);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo") || refererPath(request), "/");
  const { verifier, challenge } = await createPkce();
  const state = uuid() + uuid();
  const nonce = uuid() + uuid();
  const id = uuid();
  await env.DB.prepare("INSERT INTO oauth_state (id,state,code_verifier,nonce,return_to,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7)")
    .bind(id, state, verifier, nonce, returnTo, nowISO(), isoPlusSeconds(600)).run();
  const authUrl = buildAuthUrl(env, { state, nonce, challenge, redirectUri: callbackUrl(url, env) });
  const cookie = serializeCookie(OAUTH_COOKIE, id, { httpOnly: true, secure: isSecure(url), sameSite: "Lax", maxAge: 600, path: "/" });
  return redirect(authUrl, { "set-cookie": cookie });
}

async function googleCallback(request, env, url) {
  const clearOauth = serializeCookie(OAUTH_COOKIE, "", { httpOnly: true, secure: isSecure(url), sameSite: "Lax", maxAge: 0, path: "/" });
  const fail = (code) => redirect(`/login?error=${encodeURIComponent(code)}`, { "set-cookie": clearOauth });
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "cancelled" : "provider");
  const stateId = parseCookies(request)[OAUTH_COOKIE];
  const qState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateId || !qState || !code) return fail("state");
  const row = await env.DB.prepare("SELECT * FROM oauth_state WHERE id=?1").bind(stateId).first();
  if (row) await env.DB.prepare("DELETE FROM oauth_state WHERE id=?1").bind(stateId).run();
  if (!row || row.state !== qState) return fail("state");
  if (new Date(row.expires_at).getTime() < Date.now()) return fail("expired");
  try {
    const tokens = await exchangeCode(env, { code, verifier: row.code_verifier, redirectUri: callbackUrl(url, env) });
    const claims = await verifyIdToken(env, tokens.id_token, row.nonce);
    const userId = await data.upsertUserFromClaims(env, claims);
    const { token } = await createSession(env, userId, request.headers.get("User-Agent"));
    const headers = new Headers();
    headers.append("set-cookie", sessionSetCookie(token, isSecure(url)));
    headers.append("set-cookie", clearOauth);
    headers.set("location", safeReturnTo(row.return_to, "/"));
    return new Response(null, { status: 302, headers });
  } catch (e) {
    const known = ["email_not_verified", "idtoken_nonce", "idtoken_aud", "idtoken_signature", "token_exchange_failed"];
    return fail(known.includes(e.message) ? e.message : "auth_failed");
  }
}

async function me(request, env) {
  const s = await getSession(env, request);
  if (!s) return ok({ authenticated: false, user: null });
  const profile = await data.getProfile(env, s.user.id);
  return ok({
    authenticated: true,
    user: { id: s.user.id, email: s.user.email, display_name: s.user.display_name, avatar_url: s.user.avatar_url, locale: s.user.locale, role: s.user.role || "user" },
    profileCompletion: profile ? profile.profile_completion_percentage : 0,
  });
}

async function logout(request, env, url) {
  if (!sameOrigin(request, env, url)) return err("csrf", 403);
  await destroySessionByToken(env, request);
  return ok({}, { "set-cookie": sessionClearCookie(isSecure(url)) });
}

export async function handleAuth(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/api/auth/google" && method === "GET") return startGoogle(request, env, url);
  if (pathname === "/api/auth/google/callback" && method === "GET") return googleCallback(request, env, url);
  if (pathname === "/api/auth/me" && method === "GET") return me(request, env);
  if (pathname === "/api/auth/logout" && method === "POST") return logout(request, env, url);

  if (pathname === "/api/changelog" && method === "GET") {
    const r = await listChangelog(env, {
      limit: url.searchParams.get("limit"),
      cursor: url.searchParams.get("cursor"),
      category: url.searchParams.get("category"),
      q: url.searchParams.get("q"),
    });
    return ok(r);
  }

  if (pathname === "/api/i18n/languages" && method === "GET") {
    return ok(getSupportedLanguages(url.searchParams.get("ui")), { "cache-control": "public, max-age=86400" });
  }

  if (pathname === "/api/i18n/translate-batch" && method === "POST") {
    if (!sameOrigin(request, env, url)) return err("csrf", 403);
    const body = (await readJson(request)) || {};
    const items = Array.isArray(body.items) ? body.items.slice(0, 128) : [];
    const r = await translateBatch(env, {
      sourceLanguage: body.sourceLanguage || "bg",
      targetLanguage: String(body.targetLanguage || ""),
      items: items.map((it) => ({ key: String(it.key || ""), text: String(it.text || "") })),
    });
    if (r.error) return err(r.error, 400);
    return ok(r);
  }

  if (pathname === "/api/errors" && method === "POST") {
    if (!sameOrigin(request, env, url)) return err("csrf", 403);
    const body = (await readJson(request)) || {};
    const s = await getSession(env, request).catch(() => null);
    await data.logError(env, { source: "client", method: String(body.method || ""), path: String(body.path || ""), status: body.status || null, message: String(body.message || ""), detail: String(body.detail || ""), userId: s && s.user ? s.user.id : null });
    return ok({});
  }

  if (pathname === "/api/feedback" && method === "POST") {
    if (!sameOrigin(request, env, url)) return err("csrf", 403);
    const body = (await readJson(request)) || {};
    const s = await getSession(env, request).catch(() => null);
    const r = await addFeedback(env, { ...body, userId: s && s.user ? s.user.id : null });
    if (r.error) return err(r.error, 400);
    return ok({});
  }

  const isPrivate =
    pathname === "/api/profile" || pathname === "/api/profile/language" || pathname === "/api/profile/country" || pathname === "/api/preferences" ||
    pathname === "/api/saved-procedures" || pathname.startsWith("/api/saved-procedures/") ||
    pathname === "/api/account" || pathname.startsWith("/api/admin/");
  if (!isPrivate) return null;

  const s = await getSession(env, request);
  if (!s) return err("unauthorized", 401);
  const userId = s.user.id;
  if (method !== "GET" && !sameOrigin(request, env, url)) return err("csrf", 403);

  if (pathname.startsWith("/api/admin/")) {
    if (s.user.role !== "admin") return err("forbidden", 403);
    // AI управление (доставчици/модели/логове) — отделен модул.
    if (pathname.startsWith("/api/admin/ai/")) {
      const aiResp = await handleAdminAI(request, env, url, userId, method, readJson);
      if (aiResp) return aiResp;
      return err("not_found", 404);
    }
    if (pathname === "/api/admin/users" && method === "GET") return ok({ users: await data.listUsers(env) });
    if (pathname.startsWith("/api/admin/users/") && method === "PATCH") {
      const id = decodeURIComponent(pathname.slice("/api/admin/users/".length));
      const body = (await readJson(request)) || {};
      const r = await data.setUserRole(env, id, String(body.role || ""));
      if (r.error) return err(r.error, r.status || 400);
      return ok({});
    }
    if (pathname === "/api/admin/system" && method === "GET") return ok({ system: await systemInfo(env) });

    // --- Източници (регистър funding_sources) ---
    if (pathname === "/api/admin/sources" && method === "GET") {
      const cc = url.searchParams.get("country");
      const where = cc ? " WHERE country_code = ?1" : "";
      const stmt = env.DB.prepare(`SELECT * FROM funding_sources${where} ORDER BY country_code, priority, id`);
      const { results } = await (cc ? stmt.bind(normalizeCountry(cc) || "") : stmt).all();
      const countries = await env.DB.prepare("SELECT code, name_bg, enabled, ingestion_status, source_count, active_source_count FROM countries ORDER BY priority").all();
      return ok({ sources: results || [], countries: countries.results || [] });
    }
    if (pathname === "/api/admin/sources" && method === "POST") {
      const b = (await readJson(request)) || {};
      const cc = normalizeCountry(b.country_code);
      if (!cc) return err("invalid_country", 400);
      if (!b.id || !b.name || !b.base_url) return err("missing_fields", 400);
      const now = nowISO();
      try {
        await env.DB.prepare(
          `INSERT INTO funding_sources (id, country_code, name, authority_name, authority_type, base_url, calls_url, programmes_url, source_type, source_level, official, primary_source, coverage_description, source_language, parser_type, adapter_key, priority, enabled, verified, requires_javascript, source_health, created_at, updated_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,?11,?12,?13,'pending',?14,?15,?16,?17,?18,'unknown',?19,?19)`
        ).bind(
          String(b.id).slice(0, 80), cc, String(b.name).slice(0, 200), b.authority_name ? String(b.authority_name).slice(0, 200) : null,
          b.authority_type ? String(b.authority_type).slice(0, 40) : null, String(b.base_url).slice(0, 500),
          b.calls_url ? String(b.calls_url).slice(0, 500) : null, b.programmes_url ? String(b.programmes_url).slice(0, 500) : null,
          b.source_type ? String(b.source_type).slice(0, 40) : "portal", b.source_level ? String(b.source_level).slice(0, 40) : "national",
          b.primary_source ? 1 : 0, b.coverage_description ? String(b.coverage_description).slice(0, 500) : null,
          b.source_language ? String(b.source_language).slice(0, 10) : null, cc.toLowerCase(),
          Number.isFinite(Number(b.priority)) ? Math.floor(Number(b.priority)) : 100,
          b.enabled ? 1 : 0, b.verified ? 1 : 0, b.requires_javascript ? 1 : 0, now
        ).run();
      } catch { return err("duplicate_or_invalid", 400); }
      await env.DB.prepare("INSERT INTO source_audit_log (source_id, country_code, checked_at, checked_by, status, result_summary, notes) VALUES (?1,?2,?3,?4,'admin_created','Добавен ръчно от администратор', NULL)").bind(b.id, cc, now, s.user.email || "admin").run();
      await env.DB.prepare("UPDATE countries SET source_count=(SELECT COUNT(*) FROM funding_sources WHERE country_code=?1), active_source_count=(SELECT COUNT(*) FROM funding_sources WHERE country_code=?1 AND enabled=1), updated_at=?2 WHERE code=?1").bind(cc, now).run();
      return ok({});
    }
    if (pathname.startsWith("/api/admin/sources/") && method === "PATCH") {
      const id = decodeURIComponent(pathname.slice("/api/admin/sources/".length));
      const existing = await env.DB.prepare("SELECT id, country_code FROM funding_sources WHERE id=?1").bind(id).first();
      if (!existing) return err("not_found", 404);
      const b = (await readJson(request)) || {};
      const now = nowISO();
      // Whitelist на редактируемите полета.
      const strs = ["name", "authority_name", "authority_type", "base_url", "calls_url", "programmes_url", "source_type", "source_level", "coverage_description", "source_language", "update_frequency"];
      const bools = ["enabled", "verified", "primary_source", "requires_javascript", "robots_checked", "terms_checked"];
      const sets = [], vals = [];
      for (const k of strs) if (k in b) { sets.push(`${k}=?${vals.length + 1}`); vals.push(b[k] == null ? null : String(b[k]).slice(0, 500)); }
      for (const k of bools) if (k in b) { sets.push(`${k}=?${vals.length + 1}`); vals.push(b[k] ? 1 : 0); }
      if ("priority" in b && Number.isFinite(Number(b.priority))) { sets.push(`priority=?${vals.length + 1}`); vals.push(Math.floor(Number(b.priority))); }
      if ("source_health" in b && ["unknown", "healthy", "degraded", "failing", "blocked"].includes(b.source_health)) { sets.push(`source_health=?${vals.length + 1}`); vals.push(b.source_health); }
      if (!sets.length) return err("no_changes", 400);
      sets.push(`updated_at=?${vals.length + 1}`); vals.push(now);
      vals.push(id);
      await env.DB.prepare(`UPDATE funding_sources SET ${sets.join(", ")} WHERE id=?${vals.length}`).bind(...vals).run();
      if ("enabled" in b || "verified" in b) {
        await env.DB.prepare("INSERT INTO source_audit_log (source_id, country_code, checked_at, checked_by, status, result_summary) VALUES (?1,?2,?3,?4,'admin_updated',?5)")
          .bind(id, existing.country_code, now, s.user.email || "admin", `Администратор: enabled=${b.enabled != null ? (b.enabled ? 1 : 0) : "—"}, verified=${b.verified != null ? (b.verified ? 1 : 0) : "—"}`).run();
      }
      await env.DB.prepare("UPDATE countries SET source_count=(SELECT COUNT(*) FROM funding_sources WHERE country_code=?1), active_source_count=(SELECT COUNT(*) FROM funding_sources WHERE country_code=?1 AND enabled=1), updated_at=?2 WHERE code=?1").bind(existing.country_code, now).run();
      return ok({});
    }
    if (pathname === "/api/admin/errors" && method === "GET") return ok({ errors: await data.listErrors(env, url.searchParams.get("limit")) });
    if (pathname === "/api/admin/errors" && method === "DELETE") return ok(await data.clearErrors(env));
    if (pathname === "/api/admin/feedback" && method === "GET") return ok({ feedback: await listFeedback(env, url.searchParams.get("limit")) });
    return err("not_found", 404);
  }

  if (pathname === "/api/profile") {
    if (method === "GET") return ok({ profile: await data.getProfile(env, userId) });
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body) return err("invalid_body", 400);
      const r = await data.putProfile(env, userId, body);
      if (r.error) return err(r.error, 400);
      return ok({ profile: await data.getProfile(env, userId) });
    }
  }
  if (pathname === "/api/profile/country") {
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT preferred_country, country_mode, country_detection_enabled FROM user_profiles WHERE user_id=?1").bind(userId).first();
      return ok({
        authenticated: true,
        country: (row && row.preferred_country) || null,
        mode: (row && row.country_mode) || "auto",
        detectionEnabled: row ? row.country_detection_enabled !== 0 : true,
      });
    }
    if (method === "PATCH") {
      const body = (await readJson(request)) || {};
      const mode = body.mode === "manual" ? "manual" : "auto";
      let country = null;
      if (mode === "manual") {
        country = normalizeCountry(body.country);
        if (!country) return err("invalid_country", 400);
      }
      const detectionEnabled = body.detectionEnabled === false ? 0 : 1;
      const now = nowISO();
      await env.DB.prepare(
        "UPDATE user_profiles SET preferred_country=?1, country_mode=?2, country_detection_enabled=?3, country_updated_at=?4, updated_at=?4 WHERE user_id=?5"
      ).bind(country, mode, detectionEnabled, now, userId).run();
      return ok({ country, mode, detectionEnabled: detectionEnabled === 1 });
    }
  }
  if (pathname === "/api/profile/language" && method === "PATCH") {
    const body = (await readJson(request)) || {};
    const mode = body.mode === "manual" ? "manual" : "auto";
    let language = null;
    if (mode === "manual") {
      const code = String(body.language || "").toLowerCase();
      if (!LOCALE_CODES.includes(code)) return err("invalid_language", 400);
      language = code;
    }
    const now = nowISO();
    await env.DB.prepare(
      "INSERT INTO user_preferences (user_id, language, language_mode, language_updated_at, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5) " +
      "ON CONFLICT(user_id) DO UPDATE SET language=excluded.language, language_mode=excluded.language_mode, language_updated_at=excluded.language_updated_at, updated_at=excluded.updated_at"
    ).bind(userId, language, mode, now, now).run();
    return ok({ preferredLanguage: language, languageMode: mode });
  }
  if (pathname === "/api/preferences") {
    if (method === "GET") return ok({ preferences: await data.getPreferences(env, userId) });
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body) return err("invalid_body", 400);
      await data.putPreferences(env, userId, body);
      return ok({ preferences: await data.getPreferences(env, userId) });
    }
  }
  if (pathname === "/api/saved-procedures") {
    if (method === "GET") return ok({ saved: await data.listSaved(env, userId) });
    if (method === "POST") {
      const body = await readJson(request);
      if (!body || !body.procedure_id) return err("invalid_body", 400);
      const r = await data.saveProcedure(env, userId, String(body.procedure_id), body);
      if (r.error) return err(r.error, r.status || 400);
      return ok({ duplicate: !!r.duplicate });
    }
  }
  if (pathname === "/api/saved-procedures/import-local" && method === "POST") {
    const body = await readJson(request);
    const r = await data.importLocal(env, userId, body && body.ids);
    if (r.error) return err(r.error, r.status || 400);
    return ok({ added: r.added, skipped: r.skipped });
  }
  if (pathname.startsWith("/api/saved-procedures/")) {
    const pid = decodeURIComponent(pathname.slice("/api/saved-procedures/".length));
    if (!pid) return err("invalid_id", 400);
    if (method === "PATCH") { const body = (await readJson(request)) || {}; const r = await data.patchSaved(env, userId, pid, body); if (r.error) return err(r.error, r.status || 400); return ok({}); }
    if (method === "DELETE") return ok(await data.deleteSaved(env, userId, pid));
  }
  if (pathname === "/api/account" && method === "DELETE") {
    await data.deleteAccount(env, userId);
    return ok({}, { "set-cookie": sessionClearCookie(isSecure(url)) });
  }

  return err("method_not_allowed", 405);
}
