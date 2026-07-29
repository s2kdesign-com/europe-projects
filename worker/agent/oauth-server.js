// OAuth 2.1 authorization server (само за ЧЕТЕНЕ) + OpenID Connect discovery.
//
// Досега euro-funds.eu беше само OAuth *клиент* на Google (сесия в бисквитка).
// Тук сайтът става и authorization server за собствените си API-та: агент може
// да получи достъп до личните данни на потребител (профил + запазени процедури),
// без да вижда паролата му и без да ползва сесийната бисквитка.
//
// Принципи (умишлено ограничени):
//   • Само authorization_code + PKCE S256 и refresh_token с ротация. Без implicit,
//     без password grant, без client_credentials.
//   • Издадените токени дават права САМО за четене. Всяко писане и целият /api/admin/
//     остават достъпни единствено през сесия в браузъра.
//   • Няма динамична регистрация на клиенти (RFC 7591) — клиентите се вписват ръчно
//     в D1 таблицата oauth_clients.
//   • Потребителят се автентикира през СЪЩЕСТВУВАЩИЯ Google поток; тук не се пипа
//     нищо по него.
//   • Частният ключ за подпис се пази криптиран (AES-256-GCM) в D1.
//
// Спецификации: RFC 6749/9700 (OAuth 2.1), RFC 7636 (PKCE), RFC 8414 (метаданни),
// RFC 9068 (JWT access token), RFC 9728 (метаданни на защитен ресурс),
// RFC 7009 (revocation), RFC 8707 (resource indicators), OpenID Connect Core/Discovery.

import { b64urlFromBytes, bytesFromB64url, hmacHex, isoPlusSeconds, nowISO, randomToken, sha256hex, timingSafeEqual, uuid } from "../util.js";
import { getSession } from "../session.js";
import { decryptSecret, encryptSecret, isCryptoConfigured } from "../ai/crypto.js";

const SITE = "https://euro-funds.eu";
const BRAND = "Euro-Funding";

export const ISSUER = SITE;
export const RESOURCE = `${SITE}/api`;

export const SUPPORTED_SCOPES = ["openid", "profile:read", "saved:read", "procedures:read"];
const SCOPE_LABEL = {
  openid: "Кой сте вие — идентификатор, име и имейл",
  "profile:read": "Профилът ви за финансиране (държава, регион, сектор, размер на фирмата)",
  "saved:read": "Списъкът с процедурите, които сте запазили",
  "procedures:read": "Публичните данни за процедурите (не са лични данни)",
};

// auth.md — агентска регистрация. Пътищата се публикуват в метаданните на
// authorization server-а (блок `agent_auth`) и се обслужват от agent-auth.js.
export const AGENT_AUTH_PATHS = {
  skill: `${SITE}/auth.md`,
  register: `${SITE}/agent/auth`,
  claim: `${SITE}/agent/auth/claim`,
  claimComplete: `${SITE}/agent/auth/claim/complete`,
  revoke: `${SITE}/agent/auth/revoke`,
  token: `${SITE}/agent/auth/token`,
};

export const ID_JAG_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id-jag";

/**
 * Блокът `agent_auth` в /.well-known/oauth-authorization-server (auth.md).
 * Чиста функция без зависимости — за да няма кръгов внос с agent-auth.js.
 */
export function agentAuthBlock() {
  return {
    skill: AGENT_AUTH_PATHS.skill,
    register_uri: AGENT_AUTH_PATHS.register,
    claim_uri: AGENT_AUTH_PATHS.claim,
    revocation_uri: AGENT_AUTH_PATHS.revoke,
    token_uri: AGENT_AUTH_PATHS.token,
    identity_types_supported: ["identity_assertion", "anonymous"],
    assertion_types_supported: [ID_JAG_TOKEN_TYPE, "verified_email"],
    credential_types_supported: ["access_token"],
    scopes_supported: SUPPORTED_SCOPES,
    events_supported: [
      "https://schemas.openid.net/secevent/caep/event-type/token-claims-change",
      "https://schemas.openid.net/secevent/caep/event-type/session-revoked",
    ],
    identity_assertion: {
      assertion_types_supported: [ID_JAG_TOKEN_TYPE, "verified_email"],
      credential_types_supported: ["access_token"],
      claim_uri: AGENT_AUTH_PATHS.claim,
      revocation_uri: AGENT_AUTH_PATHS.revoke,
      signing_alg_values_supported: ["RS256", "PS256", "ES256"],
      audience: RESOURCE,
      trusted_issuers_uri: `${SITE}/agent/auth`,
    },
    anonymous: {
      credential_types_supported: ["access_token"],
      claim_uri: AGENT_AUTH_PATHS.claim,
      revocation_uri: AGENT_AUTH_PATHS.revoke,
      scopes_supported: ["procedures:read"],
    },
    documentation: `${SITE}/docs/api`,
  };
}

const ACCESS_TOKEN_TTL = 3600;              // 1 час
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 дни
const CODE_TTL = 120;                        // 2 минути

const te = new TextEncoder();

// ---------------------------------------------------------------------------
// Отговори
// ---------------------------------------------------------------------------

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

function jsonNoStore(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE, ...extra },
  });
}
function metadataResponse(body) {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
function oauthError(error, description, status = 400) {
  return jsonNoStore({ error, error_description: description }, status);
}
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------
// Ключове за подпис (ES256, P-256) — частният е криптиран в D1
// ---------------------------------------------------------------------------

// Кешът е ПО env (WeakMap), а не глобален: така ключът никога не се смесва между
// различни binding-и/бази (в тестове и при няколко среди в един процес).
const keyCaches = new WeakMap();
const KEY_CACHE_TTL = 10 * 60 * 1000;

/** RFC 7638 JWK thumbprint → стабилен kid. */
async function thumbprint(jwk) {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const digest = await crypto.subtle.digest("SHA-256", te.encode(canonical));
  return b64urlFromBytes(digest);
}

async function generateSigningKey(env) {
  if (!isCryptoConfigured(env)) throw new Error("signing_key_storage_unavailable");
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = await thumbprint(publicJwk);
  const pub = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y, alg: "ES256", use: "sig", kid };
  const enc = await encryptSecret(env, JSON.stringify(privateJwk));
  await env.DB.prepare(
    "INSERT OR IGNORE INTO oauth_signing_keys (kid, algorithm, public_jwk, private_jwk_ciphertext, private_jwk_iv, status, created_at) VALUES (?1,'ES256',?2,?3,?4,'active',?5)"
  ).bind(kid, JSON.stringify(pub), enc.ciphertext, enc.iv, nowISO()).run();
  return kid;
}

/** Активният ключ (създава го при първо ползване). */
async function activeSigningKey(env) {
  const cached = keyCaches.get(env);
  if (cached && cached.privateKey && Date.now() - cached.loadedAt < KEY_CACHE_TTL) return cached;
  let row = await env.DB.prepare("SELECT * FROM oauth_signing_keys WHERE status='active' ORDER BY created_at LIMIT 1").first().catch(() => null);
  if (!row) {
    await generateSigningKey(env);
    row = await env.DB.prepare("SELECT * FROM oauth_signing_keys WHERE status='active' ORDER BY created_at LIMIT 1").first();
  }
  if (!row) throw new Error("signing_key_unavailable");
  const privateJwk = JSON.parse(await decryptSecret(env, row.private_jwk_ciphertext, row.private_jwk_iv));
  const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const entry = { kid: row.kid, privateKey, publicJwk: JSON.parse(row.public_jwk), loadedAt: Date.now() };
  keyCaches.set(env, entry);
  return entry;
}

/** Всички публични ключове (активни + в ротация) — за JWKS и за проверка. */
async function publicKeys(env) {
  const { results } = await env.DB.prepare("SELECT kid, public_jwk FROM oauth_signing_keys WHERE status IN ('active','retiring') ORDER BY created_at").all().catch(() => ({ results: [] }));
  return (results || []).map((r) => { try { return JSON.parse(r.public_jwk); } catch { return null; } }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// JWT (ES256)
// ---------------------------------------------------------------------------

function b64urlJson(obj) {
  return b64urlFromBytes(te.encode(JSON.stringify(obj)));
}

export async function signJwt(env, { claims, typ = "JWT" }) {
  const key = await activeSigningKey(env);
  const header = { alg: "ES256", typ, kid: key.kid };
  const payload = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, te.encode(payload));
  return `${payload}.${b64urlFromBytes(sig)}`;
}

/** Проверява подпис + базови claim-ове. Връща claims или хвърля. */
export async function verifyJwt(env, token, { audience } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("malformed");
  let header;
  try { header = JSON.parse(new TextDecoder().decode(bytesFromB64url(parts[0]))); } catch { throw new Error("malformed"); }
  if (header.alg !== "ES256") throw new Error("bad_alg");
  const jwks = await publicKeys(env);
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown_key");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, bytesFromB64url(parts[2]), te.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("bad_signature");
  let claims;
  try { claims = JSON.parse(new TextDecoder().decode(bytesFromB64url(parts[1]))); } catch { throw new Error("malformed"); }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER) throw new Error("bad_issuer");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) throw new Error("not_yet_valid");
  if (audience) {
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(audience)) throw new Error("bad_audience");
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Клиенти и redirect URI
// ---------------------------------------------------------------------------

async function getClient(env, clientId) {
  if (!clientId) return null;
  const row = await env.DB.prepare("SELECT * FROM oauth_clients WHERE client_id = ?1 AND enabled = 1").bind(String(clientId)).first().catch(() => null);
  if (!row) return null;
  let uris = [];
  try { uris = JSON.parse(row.redirect_uris || "[]"); } catch { uris = []; }
  return { ...row, redirect_uris: Array.isArray(uris) ? uris : [] };
}

/**
 * Проверка на redirect_uri: точно съвпадение със списъка на клиента. При
 * allow_loopback се приема и loopback адрес с произволен порт (RFC 8252 §7.3 —
 * native/CLI агенти не могат да резервират порт предварително). Само http към
 * 127.0.0.1 / [::1] / localhost.
 */
export function redirectUriAllowed(client, redirectUri) {
  if (!redirectUri || !client) return false;
  if (client.redirect_uris.includes(redirectUri)) return true;
  if (!client.allow_loopback) return false;
  let u;
  try { u = new URL(redirectUri); } catch { return false; }
  if (u.protocol !== "http:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function normalizeScope(requested, client) {
  const allowed = String(client.scopes || "").split(/\s+/).filter(Boolean);
  const req = String(requested || "").split(/\s+/).filter(Boolean);
  const list = (req.length ? req : allowed).filter((s) => SUPPORTED_SCOPES.includes(s) && allowed.includes(s));
  return [...new Set(list)];
}

// ---------------------------------------------------------------------------
// Страница за съгласие
// ---------------------------------------------------------------------------

function consentPage({ client, user, scopes, params, consentToken }) {
  const hidden = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  const items = scopes.map((s) => `<li><strong>${esc(s)}</strong><br><span class="muted">${esc(SCOPE_LABEL[s] || "")}</span></li>`).join("");
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Разрешение за достъп | ${BRAND}</title>
<style>
:root{--primary:#0b6ea3;--text:#0f2942;--muted:#64748b;--line:#e2e8f0}
body{margin:0;background:#f8fafc;color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;max-width:520px;width:100%;padding:28px}
h1{font-size:22px;margin:0 0 6px}
p.sub{color:var(--muted);margin:0 0 20px;font-size:15px}
ul{list-style:none;padding:0;margin:0 0 20px}
li{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:8px;font-size:14.5px}
.muted{color:var(--muted);font-size:13.5px}
.who{background:#f1f5f9;border-radius:10px;padding:10px 14px;font-size:14px;margin-bottom:18px}
.actions{display:flex;gap:10px}
button{flex:1;min-height:44px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--text)}
button.primary{background:var(--primary);border-color:var(--primary);color:#fff}
.note{margin-top:18px;font-size:13px;color:var(--muted)}
</style></head><body>
<form class="card" method="post" action="/oauth/authorize">
${hidden}
<h1>${esc(client.client_name)} иска достъп</h1>
<p class="sub">Приложението иска да чете част от данните ви в ${BRAND}.</p>
<div class="who">Влезли сте като <strong>${esc(user.email)}</strong></div>
<ul>${items}</ul>
<div class="actions">
  <button type="submit" name="action" value="deny">Откажи</button>
  <button type="submit" name="action" value="approve" class="primary">Разреши</button>
</div>
<p class="note">Достъпът е <strong>само за четене</strong> — приложението не може да променя или изтрива нищо. Може да го прекратите по всяко време от профила си. Пренасочване към: <code>${esc(params.redirect_uri)}</code></p>
</form></body></html>`;
}

function errorPage(title, detail) {
  return new Response(
    `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} | ${BRAND}</title></head>
<body style="font:16px/1.6 system-ui,sans-serif;color:#0f2942;max-width:560px;margin:80px auto;padding:0 20px">
<h1 style="font-size:22px">${esc(title)}</h1><p>${esc(detail)}</p>
<p><a href="${SITE}/" style="color:#0b6ea3">← Към ${BRAND}</a> · <a href="${SITE}/docs/api" style="color:#0b6ea3">API документация</a></p>
</body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } }
  );
}

function redirectWithError(redirectUri, { error, description, state }) {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { location: u.toString(), ...NO_STORE } });
}

// ---------------------------------------------------------------------------
// Authorization endpoint
// ---------------------------------------------------------------------------

function authorizeParams(source) {
  return {
    response_type: source.get("response_type") || "",
    client_id: source.get("client_id") || "",
    redirect_uri: source.get("redirect_uri") || "",
    scope: source.get("scope") || "",
    state: source.get("state") || "",
    code_challenge: source.get("code_challenge") || "",
    code_challenge_method: source.get("code_challenge_method") || "",
    resource: source.get("resource") || "",
    nonce: source.get("nonce") || "",
    prompt: source.get("prompt") || "",
  };
}

async function consentTokenFor(env, sessionId, p) {
  return hmacHex(env.AUTH_SECRET || "dev-insecure-secret", [sessionId, p.client_id, p.redirect_uri, p.scope].join("\n"));
}

async function issueCode(env, { client, userId, params, scopes }) {
  const code = randomToken(32);
  await env.DB.prepare(
    "INSERT INTO oauth_authorization_codes (code_hash, client_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, resource, nonce, expires_at, created_at) VALUES (?1,?2,?3,?4,?5,?6,'S256',?7,?8,?9,?10)"
  ).bind(
    await sha256hex(code), client.client_id, userId, params.redirect_uri, scopes.join(" "),
    params.code_challenge, params.resource || RESOURCE, params.nonce || null,
    isoPlusSeconds(CODE_TTL), nowISO()
  ).run();

  const now = nowISO();
  await env.DB.prepare(
    "INSERT INTO oauth_grants (id, user_id, client_id, scope, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?5) " +
    "ON CONFLICT(user_id, client_id) DO UPDATE SET scope=excluded.scope, updated_at=excluded.updated_at"
  ).bind(uuid(), userId, client.client_id, scopes.join(" "), now).run().catch(() => {});

  const u = new URL(params.redirect_uri);
  u.searchParams.set("code", code);
  if (params.state) u.searchParams.set("state", params.state);
  return new Response(null, { status: 302, headers: { location: u.toString(), ...NO_STORE } });
}

async function handleAuthorize(request, env, url) {
  const method = request.method;
  let source;
  let action = "";
  let postedConsent = "";
  if (method === "POST") {
    const form = await request.formData().catch(() => null);
    if (!form) return errorPage("Невалидна заявка", "Формата не може да бъде прочетена.");
    source = form;
    action = String(form.get("action") || "");
    postedConsent = String(form.get("consent_token") || "");
  } else {
    source = url.searchParams;
  }
  const p = authorizeParams(source);

  // 1) Клиент и redirect_uri — при грешка НЕ пренасочваме (може да е подправен).
  const client = await getClient(env, p.client_id);
  if (!client) return errorPage("Непознато приложение", "client_id не е регистриран или е деактивиран. Регистрацията на клиенти е ръчна — вижте /docs/api.");
  if (!redirectUriAllowed(client, p.redirect_uri)) {
    return errorPage("Невалиден адрес за връщане", "redirect_uri не съвпада с регистрираните адреси на това приложение.");
  }

  // 2) Останалите грешки се връщат на клиента по правилата на OAuth.
  if (p.response_type !== "code") return redirectWithError(p.redirect_uri, { error: "unsupported_response_type", description: "Поддържа се само response_type=code.", state: p.state });
  if (!p.code_challenge) return redirectWithError(p.redirect_uri, { error: "invalid_request", description: "PKCE е задължително (code_challenge).", state: p.state });
  if ((p.code_challenge_method || "").toUpperCase() !== "S256") return redirectWithError(p.redirect_uri, { error: "invalid_request", description: "Поддържа се само code_challenge_method=S256.", state: p.state });
  if (p.resource && p.resource !== RESOURCE) return redirectWithError(p.redirect_uri, { error: "invalid_target", description: `Единственият ресурс е ${RESOURCE}.`, state: p.state });
  const scopes = normalizeScope(p.scope, client);
  if (!scopes.length) return redirectWithError(p.redirect_uri, { error: "invalid_scope", description: `Поддържани обхвати: ${SUPPORTED_SCOPES.join(", ")}.`, state: p.state });

  // 3) Автентикация на потребителя — през съществуващия Google поток.
  const s = await getSession(env, request).catch(() => null);
  if (!s) {
    if (method === "POST") return errorPage("Сесията изтече", "Влезте отново и повторете разрешението.");
    if (p.prompt === "none") return redirectWithError(p.redirect_uri, { error: "login_required", description: "Няма активна сесия.", state: p.state });
    const back = `/oauth/authorize${url.search}`;
    return new Response(null, { status: 302, headers: { location: `/api/auth/google?returnTo=${encodeURIComponent(back)}`, ...NO_STORE } });
  }

  const consentToken = await consentTokenFor(env, s.session.id, p);

  if (method === "POST") {
    // CSRF: токенът е обвързан със сесията И с точните параметри на заявката.
    if (!timingSafeEqual(postedConsent, consentToken)) return errorPage("Невалидна заявка", "Проверката за автентичност на формата не мина. Опитайте отново.");
    if (action !== "approve") return redirectWithError(p.redirect_uri, { error: "access_denied", description: "Потребителят отказа достъпа.", state: p.state });
    return issueCode(env, { client, userId: s.user.id, params: p, scopes });
  }

  // Вече дадено съгласие за същите (или повече) права → без повторен въпрос.
  if (p.prompt !== "consent") {
    const grant = await env.DB.prepare("SELECT scope FROM oauth_grants WHERE user_id=?1 AND client_id=?2").bind(s.user.id, client.client_id).first().catch(() => null);
    if (grant) {
      const have = new Set(String(grant.scope || "").split(/\s+/).filter(Boolean));
      if (scopes.every((x) => have.has(x))) return issueCode(env, { client, userId: s.user.id, params: p, scopes });
    }
  }
  if (p.prompt === "none") return redirectWithError(p.redirect_uri, { error: "consent_required", description: "Нужно е съгласие от потребителя.", state: p.state });

  return new Response(consentPage({ client, user: s.user, scopes, params: { ...p, consent_token: consentToken }, consentToken }), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE },
  });
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

async function issueTokens(env, { clientId, userId, scopes, nonce, resource }) {
  const now = Math.floor(Date.now() / 1000);
  const scope = scopes.join(" ");
  const accessToken = await signJwt(env, {
    typ: "at+jwt",
    claims: {
      iss: ISSUER, sub: userId, aud: resource || RESOURCE, client_id: clientId,
      scope, jti: uuid(), iat: now, nbf: now, exp: now + ACCESS_TOKEN_TTL,
    },
  });

  const refreshToken = randomToken(32);
  await env.DB.prepare(
    "INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, scope, expires_at, created_at) VALUES (?1,?2,?3,?4,?5,?6)"
  ).bind(await sha256hex(refreshToken), clientId, userId, scope, isoPlusSeconds(REFRESH_TOKEN_TTL), nowISO()).run();

  const body = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    scope,
  };

  if (scopes.includes("openid")) {
    const user = await env.DB.prepare("SELECT id, email, email_verified, display_name, avatar_url, locale FROM users WHERE id=?1").bind(userId).first().catch(() => null);
    if (user) {
      body.id_token = await signJwt(env, {
        claims: {
          iss: ISSUER, sub: userId, aud: clientId, iat: now, exp: now + ACCESS_TOKEN_TTL,
          auth_time: now, nonce: nonce || undefined,
          email: user.email, email_verified: user.email_verified === 1 || user.email_verified === true,
          name: user.display_name || undefined, picture: user.avatar_url || undefined, locale: user.locale || undefined,
        },
      });
    }
  }
  return body;
}

async function revokeChain(env, clientId, userId) {
  await env.DB.prepare("UPDATE oauth_refresh_tokens SET revoked_at=?1 WHERE client_id=?2 AND user_id=?3 AND revoked_at IS NULL")
    .bind(nowISO(), clientId, userId).run().catch(() => {});
}

async function handleToken(request, env) {
  if (request.method !== "POST") return oauthError("invalid_request", "Ползвайте POST.", 405);
  const form = await request.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Очаква се application/x-www-form-urlencoded.");
  const grantType = String(form.get("grant_type") || "");
  const clientId = String(form.get("client_id") || "");
  const client = await getClient(env, clientId);
  if (!client) return oauthError("invalid_client", "Непознат client_id.", 401);

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const verifier = String(form.get("code_verifier") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    if (!code || !verifier || !redirectUri) return oauthError("invalid_request", "Липсва code, code_verifier или redirect_uri.");

    const hash = await sha256hex(code);
    const row = await env.DB.prepare("SELECT * FROM oauth_authorization_codes WHERE code_hash = ?1").bind(hash).first().catch(() => null);
    if (!row) return oauthError("invalid_grant", "Кодът е непознат.");
    if (row.consumed_at) {
      // Повторна употреба → компрометиран код: гасим цялата верига (OAuth 2.1).
      await revokeChain(env, row.client_id, row.user_id);
      return oauthError("invalid_grant", "Кодът вече е използван.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) return oauthError("invalid_grant", "Кодът е изтекъл.");
    if (row.client_id !== clientId) return oauthError("invalid_grant", "Кодът е издаден на друг клиент.");
    if (row.redirect_uri !== redirectUri) return oauthError("invalid_grant", "redirect_uri не съвпада.");

    const challenge = b64urlFromBytes(await crypto.subtle.digest("SHA-256", te.encode(verifier)));
    if (!timingSafeEqual(challenge, row.code_challenge)) return oauthError("invalid_grant", "PKCE проверката не мина.");

    await env.DB.prepare("UPDATE oauth_authorization_codes SET consumed_at=?1 WHERE code_hash=?2").bind(nowISO(), hash).run();
    const scopes = String(row.scope || "").split(/\s+/).filter(Boolean);
    const body = await issueTokens(env, { clientId, userId: row.user_id, scopes, nonce: row.nonce, resource: row.resource });
    return jsonNoStore(body);
  }

  if (grantType === "refresh_token") {
    const token = String(form.get("refresh_token") || "");
    if (!token) return oauthError("invalid_request", "Липсва refresh_token.");
    const hash = await sha256hex(token);
    const row = await env.DB.prepare("SELECT * FROM oauth_refresh_tokens WHERE token_hash = ?1").bind(hash).first().catch(() => null);
    if (!row) return oauthError("invalid_grant", "Непознат refresh_token.");
    if (row.revoked_at) {
      await revokeChain(env, row.client_id, row.user_id);
      return oauthError("invalid_grant", "Токенът е бил отменен или преизползван.");
    }
    if (new Date(row.expires_at).getTime() < Date.now()) return oauthError("invalid_grant", "Токенът е изтекъл.");
    if (row.client_id !== clientId) return oauthError("invalid_grant", "Токенът е издаден на друг клиент.");

    let scopes = String(row.scope || "").split(/\s+/).filter(Boolean);
    const requested = String(form.get("scope") || "").split(/\s+/).filter(Boolean);
    if (requested.length) {
      if (!requested.every((x) => scopes.includes(x))) return oauthError("invalid_scope", "Не може да се разширява обхватът при обновяване.");
      scopes = requested;
    }
    const body = await issueTokens(env, { clientId, userId: row.user_id, scopes });
    await env.DB.prepare("UPDATE oauth_refresh_tokens SET revoked_at=?1, rotated_to=?2, last_used_at=?1 WHERE token_hash=?3")
      .bind(nowISO(), await sha256hex(body.refresh_token), hash).run();
    return jsonNoStore(body);
  }

  return oauthError("unsupported_grant_type", "Поддържат се authorization_code и refresh_token.");
}

async function handleRevoke(request, env) {
  if (request.method !== "POST") return oauthError("invalid_request", "Ползвайте POST.", 405);
  const form = await request.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Очаква се application/x-www-form-urlencoded.");
  const token = String(form.get("token") || "");
  // RFC 7009: винаги 200, дори токенът да е непознат.
  if (token) {
    await env.DB.prepare("UPDATE oauth_refresh_tokens SET revoked_at=?1 WHERE token_hash=?2 AND revoked_at IS NULL")
      .bind(nowISO(), await sha256hex(token)).run().catch(() => {});
  }
  return new Response(null, { status: 200, headers: NO_STORE });
}

// ---------------------------------------------------------------------------
// Bearer проверка (за защитените read endpoint-и)
// ---------------------------------------------------------------------------

// HTTP заглавките приемат само ISO-8859-1 — кирилица в error_description би
// хвърлила TypeError и би превърнала 401 в 500. Затова се чисти до ASCII.
function headerSafe(value, max = 160) {
  return String(value == null ? "" : value)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function wwwAuthenticate(error, description) {
  const parts = [`Bearer realm="${BRAND}"`, `resource_metadata="${SITE}/.well-known/oauth-protected-resource"`];
  const e = headerSafe(error, 60);
  const d = headerSafe(description);
  if (e) parts.push(`error="${e}"`);
  if (d) parts.push(`error_description="${d}"`);
  return parts.join(", ");
}

const AGENT_SUB_PREFIX = "agent:";

/** Регистрация на агент по id (auth.md). Отменянето действа веднага, защото
 *  редът се чете при ВСЯКА заявка — JWT-то само носи идентификатора. */
export async function loadAgentRegistration(env, registrationId) {
  if (!registrationId) return null;
  return env.DB.prepare(
    "SELECT id, identity_type, assertion_type, agent_issuer, agent_subject, agent_name, email, user_id, scope, status, expires_at, revoked_at FROM agent_registrations WHERE id = ?1"
  ).bind(String(registrationId)).first().catch(() => null);
}

/**
 * Връща { user, agent, scopes, clientId } при валиден Bearer токен, { error }
 * при невалиден, или null ако изобщо няма Authorization: Bearer заглавка.
 *
 * Токен, издаден по auth.md, има `sub = "agent:<registration_id>"` — тогава се
 * връща и `agent` (регистрацията). `user` е null, докато креденшълът не бъде
 * свързан с акаунт (claim или ID-JAG съвпадение по имейл).
 */
export async function authenticateBearer(env, request) {
  const header = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  let claims;
  try {
    claims = await verifyJwt(env, m[1], { audience: RESOURCE });
  } catch (e) {
    // Описанието стига до WWW-Authenticate заглавка → само ASCII.
    return { error: "invalid_token", description: `token verification failed: ${e.message}` };
  }
  const scopes = String(claims.scope || "").split(/\s+/).filter(Boolean);
  const sub = String(claims.sub || "");

  if (sub.startsWith(AGENT_SUB_PREFIX)) {
    const agent = await loadAgentRegistration(env, sub.slice(AGENT_SUB_PREFIX.length));
    if (!agent) return { error: "invalid_token", description: "agent registration not found" };
    if (agent.status === "revoked" || agent.revoked_at) return { error: "invalid_token", description: "agent registration revoked" };
    if (agent.expires_at && new Date(agent.expires_at).getTime() < Date.now()) {
      return { error: "invalid_token", description: "agent registration expired" };
    }
    let user = null;
    if (agent.user_id) {
      user = await env.DB.prepare("SELECT id, email, email_verified, display_name, avatar_url, locale, role, created_at, last_login_at FROM users WHERE id = ?1")
        .bind(agent.user_id).first().catch(() => null);
      if (!user) return { error: "invalid_token", description: "user no longer exists" };
    }
    // Обхватът никога не надхвърля записания в регистрацията (тя е истината).
    const granted = String(agent.scope || "").split(/\s+/).filter(Boolean);
    return { user, agent, scopes: scopes.filter((s) => granted.includes(s)), clientId: claims.client_id || null };
  }

  const user = await env.DB.prepare("SELECT id, email, email_verified, display_name, avatar_url, locale, role, created_at, last_login_at FROM users WHERE id = ?1")
    .bind(sub).first().catch(() => null);
  if (!user) return { error: "invalid_token", description: "user no longer exists" };
  return { user, agent: null, scopes, clientId: claims.client_id || null };
}

/** Кой обхват е нужен за даден път (само GET). null → достъпът е забранен за токен. */
export function requiredScope(pathname) {
  if (pathname === "/api/auth/me" || pathname === "/oauth/userinfo") return "openid";
  if (pathname === "/api/profile" || pathname === "/api/profile/country" || pathname === "/api/preferences") return "profile:read";
  if (pathname === "/api/saved-procedures" || pathname.startsWith("/api/saved-procedures/")) return "saved:read";
  return null;
}

async function handleUserinfo(request, env) {
  const auth = await authenticateBearer(env, request);
  if (!auth) return jsonNoStore({ error: "invalid_request" }, 401, { "www-authenticate": wwwAuthenticate() });
  if (auth.error) return jsonNoStore({ error: auth.error, error_description: auth.description }, 401, { "www-authenticate": wwwAuthenticate(auth.error, auth.description) });
  if (!auth.scopes.includes("openid")) {
    return jsonNoStore({ error: "insufficient_scope", error_description: "Нужен е обхват openid." }, 403, { "www-authenticate": wwwAuthenticate("insufficient_scope", "scope=openid") });
  }
  const u = auth.user;
  return jsonNoStore({
    sub: u.id,
    email: u.email,
    email_verified: u.email_verified === 1 || u.email_verified === true,
    name: u.display_name || null,
    picture: u.avatar_url || null,
    locale: u.locale || null,
  });
}

// ---------------------------------------------------------------------------
// Discovery метаданни
// ---------------------------------------------------------------------------

function baseMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${SITE}/oauth/authorize`,
    token_endpoint: `${SITE}/oauth/token`,
    jwks_uri: `${SITE}/.well-known/jwks.json`,
    revocation_endpoint: `${SITE}/oauth/revoke`,
    userinfo_endpoint: `${SITE}/oauth/userinfo`,
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["ES256"],
    subject_types_supported: ["public"],
    resource_indicators_supported: true,
    authorization_response_iss_parameter_supported: false,
    service_documentation: `${SITE}/docs/api`,
    op_policy_uri: `${SITE}/privacy`,
    op_tos_uri: `${SITE}/terms`,
    ui_locales_supported: ["bg", "en", "de"],
  };
}

export function authorizationServerMetadata() {
  // `agent_auth` е разширението на auth.md: казва на агента КАК да се регистрира
  // сам, без човек пред браузъра. Не е част от RFC 8414 и затова стои само тук
  // (не и в /.well-known/openid-configuration, което остава чисто OIDC).
  return metadataResponse({ ...baseMetadata(), agent_auth: agentAuthBlock() });
}

export function openidConfiguration() {
  return metadataResponse({
    ...baseMetadata(),
    claims_supported: ["sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "email", "email_verified", "name", "picture", "locale"],
    claim_types_supported: ["normal"],
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    claims_parameter_supported: false,
  });
}

export function protectedResourceMetadata() {
  return metadataResponse({
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    jwks_uri: `${SITE}/.well-known/jwks.json`,
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_signing_alg_values_supported: ["ES256"],
    resource_documentation: `${SITE}/docs/api`,
    resource_policy_uri: `${SITE}/privacy`,
    tls_client_certificate_bound_access_tokens: false,
    // Пряк указател към агентската регистрация — стъпка 1 от auth.md е точно
    // този документ, а без указателя агентът трябва да гадае къде е /auth.md.
    agent_auth_skill: AGENT_AUTH_PATHS.skill,
  });
}

async function handleJwks(env) {
  let keys = await publicKeys(env);
  if (!keys.length) {
    // Първо обръщение: създаваме ключа, за да не публикуваме празен JWKS.
    try { await activeSigningKey(env); keys = await publicKeys(env); } catch { keys = []; }
  }
  return new Response(JSON.stringify({ keys }, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/jwk-set+json; charset=utf-8",
      "cache-control": "public, max-age=600",
      "access-control-allow-origin": "*",
    },
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Връща Response за OAuth пътищата или null. */
export async function handleOAuthServer(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/.well-known/oauth-authorization-server" && method === "GET") return authorizationServerMetadata();
  if (pathname === "/.well-known/openid-configuration" && method === "GET") return openidConfiguration();
  if (pathname === "/.well-known/oauth-protected-resource" && method === "GET") return protectedResourceMetadata();
  if (pathname === "/.well-known/jwks.json" && method === "GET") return handleJwks(env);

  if (pathname === "/oauth/authorize" && (method === "GET" || method === "POST")) return handleAuthorize(request, env, url);
  if (pathname === "/oauth/token") return handleToken(request, env);
  if (pathname === "/oauth/revoke") return handleRevoke(request, env);
  if (pathname === "/oauth/userinfo" && (method === "GET" || method === "POST")) return handleUserinfo(request, env);

  return null;
}
