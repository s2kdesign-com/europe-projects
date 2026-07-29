// auth.md — агентска регистрация (https://workos.com/auth-md, github.com/workos/auth.md).
//
// Досега единственият начин агент да получи достъп до личните данни на
// потребител беше OAuth 2.1 authorization_code — с човек пред браузъра. Тук се
// добавят трите потока на auth.md, при които агентът се регистрира САМ:
//
//   1. identity_assertion + ID-JAG      — доверен доставчик на агентска
//      самоличност подписва твърдение за потребителя. Проверява се подпис
//      срещу JWKS на издателя, aud, срок и еднократност (jti). Ако имейлът от
//      твърдението съвпадне с потвърден акаунт → креденшълът е свързан веднага.
//   2. identity_assertion + verified_email — агентът заявява имейл; изпраща се
//      6-цифрен код; потребителят го дава на агента (церемония по потвърждаване).
//   3. anonymous                        — креденшъл веднага, само за публичните
//      данни; може да бъде свързан с акаунт по-късно със същата церемония.
//
// Издаваният креденшъл е JWT access токен, подписан със СЪЩИЯ ES256 ключ като
// останалите токени (`oauth_signing_keys`), но с `sub = "agent:<id>"`. При всяка
// заявка `authenticateBearer` чете реда в `agent_registrations` → отменянето
// действа незабавно, без да чакаме токенът да изтече.
//
// СИГУРНОСТ (нарочни ограничения):
//   • Токените дават права САМО за четене; /api/admin/* никога не е достъпен.
//   • Анонимен/непотвърден креденшъл НЕ вижда лични данни — само `procedures:read`.
//   • ID-JAG се приема само от издател, вписан в `agent_trusted_issuers`.
//   • Не се създават потребителски акаунти. Свързването става само със
//     СЪЩЕСТВУВАЩ акаунт и потвърден имейл.
//   • Описанията на грешките са на английски (стигат до HTTP заглавки — ISO-8859-1).

import { bytesFromB64url, isoPlusSeconds, nowISO, randomToken, sha256hex, timingSafeEqual, uuid } from "../util.js";
import {
  AGENT_AUTH_PATHS, ID_JAG_TOKEN_TYPE, ISSUER, RESOURCE, SUPPORTED_SCOPES,
  agentAuthBlock, loadAgentRegistration, signJwt, verifyJwt,
} from "./oauth-server.js";

const SITE = "https://euro-funds.eu";
const BRAND = "Euro-Funding";

// ---------------------------------------------------------------------------
// Обхвати и срокове
// ---------------------------------------------------------------------------

/** Публични данни — това получава всеки регистриран агент. */
export const PUBLIC_AGENT_SCOPES = ["procedures:read"];
/** Пълният обхват след свързване с акаунт (пак само за четене). */
export const LINKED_AGENT_SCOPES = ["procedures:read", "openid", "profile:read", "saved:read"];

const ACCESS_TOKEN_TTL = 3600;                     // 1 час
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30;       // 30 дни (свързан креденшъл)
const UNCLAIMED_REFRESH_TTL = 60 * 60 * 24 * 7;    // 7 дни (непотвърден)
const UNCLAIMED_REGISTRATION_TTL = 60 * 60 * 24 * 30;
const CLAIM_TTL = 900;                             // 15 минути
const CLAIM_MAX_ATTEMPTS = 5;
const ASSERTION_MAX_AGE = 300;                     // ID-JAG: не по-старо от 5 мин
const JWKS_CACHE_MS = 6 * 60 * 60 * 1000;          // 6 часа
const ANON_LIMIT_PER_HOUR = 20;                    // регистрации от един източник
const MAX_BODY_BYTES = 16 * 1024;

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

/** Грешка по конвенцията на OAuth 2.0 (RFC 6749 §5.2) + указател към skill-а. */
function agentError(error, description, status = 400, extra = {}) {
  return jsonNoStore({
    error,
    error_description: description,
    skill: AGENT_AUTH_PATHS.skill,
    ...extra,
  }, status);
}

async function readJsonBody(request) {
  const ct = String(request.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) return { error: "invalid_request", description: "Content-Type must be application/json." };
  const text = await request.text().catch(() => null);
  if (text == null) return { error: "invalid_request", description: "Request body could not be read." };
  if (te.encode(text).length > MAX_BODY_BYTES) return { error: "invalid_request", description: "Request body is too large." };
  if (!text.trim()) return { body: {} };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { error: "invalid_request", description: "Request body must be a JSON object." };
    }
    return { body };
  } catch {
    return { error: "invalid_request", description: "Request body is not valid JSON." };
  }
}

// ---------------------------------------------------------------------------
// Дребни помощни
// ---------------------------------------------------------------------------

const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : null) || null;

/** Груба, но достатъчна проверка за имейл + нормализация към малки букви. */
function normalizeEmail(value) {
  const s = str(value, 254);
  if (!s) return null;
  const email = s.toLowerCase();
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return null;
  return email;
}

/** 6-цифрен код с равномерно разпределение (без modulo bias). */
function otpCode() {
  const buf = new Uint32Array(1);
  let n;
  do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= 4294000000);
  return String(n % 1000000).padStart(6, "0");
}

async function logEvent(env, { registrationId = null, event, identityType = null, detail = null }) {
  await env.DB.prepare(
    "INSERT INTO agent_auth_events (registration_id, event, identity_type, detail, created_at) VALUES (?1,?2,?3,?4,?5)"
  ).bind(registrationId, event, identityType, detail ? String(detail).slice(0, 500) : null, nowISO()).run().catch(() => {});
}

/** Псевдонимен идентификатор на източника — за ограничаване на анонимните
 *  регистрации. Пази се само HMAC-подобен хеш, никога суров IP адрес. */
async function sourceKey(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  return (await sha256hex(`${env.AUTH_SECRET || "dev"}|agent-source|${ip}`)).slice(0, 32);
}

async function tooManyAnonymous(env, key) {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM agent_auth_events WHERE event='registered' AND detail = ?1 AND created_at > ?2"
  ).bind(key, since).first().catch(() => null);
  return !!row && Number(row.n || 0) >= ANON_LIMIT_PER_HOUR;
}

// ---------------------------------------------------------------------------
// Имейл (Resend HTTP API — без SDK, работи в Workers)
// ---------------------------------------------------------------------------

export function isEmailConfigured(env) {
  return typeof env.RESEND_API_KEY === "string" && env.RESEND_API_KEY.length > 10;
}

/**
 * Изпраща кода за потвърждаване. При липсваща конфигурация НЕ хвърля — връща
 * { delivered: false }, а извикващият казва честно, че кодът не е доставен.
 */
async function sendClaimEmail(env, { to, code, agentName }) {
  if (!isEmailConfigured(env)) return { delivered: false, reason: "email_not_configured" };
  const from = env.AGENT_CLAIM_FROM || `${BRAND} <noreply@euro-funds.eu>`;
  const agent = agentName || "AI агент";
  const text = [
    `Код за потвърждаване: ${code}`,
    "",
    `„${agent}“ иска достъп за ЧЕТЕНЕ до вашия профил и запазени процедури в ${BRAND}.`,
    "Ако вие сте поискали това, продиктувайте кода на агента. Кодът важи 15 минути.",
    "",
    "Ако не разпознавате тази заявка — не правете нищо. Без кода агентът не получава достъп",
    "до нищо лично; той вижда само публичните данни за процедурите.",
    "",
    `${SITE}/privacy`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.6;color:#111">
<p>Код за потвърждаване:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p>
<p>„${agent}“ иска достъп за <strong>четене</strong> до вашия профил и запазени процедури в ${BRAND}.
Ако вие сте поискали това, продиктувайте кода на агента. Кодът важи 15 минути.</p>
<p>Ако не разпознавате тази заявка — не правете нищо. Без кода агентът вижда само публичните данни за процедурите.</p>
<p><a href="${SITE}/privacy">${SITE}/privacy</a></p></div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Код за потвърждаване на агент — ${BRAND}`, text, html }),
    });
    if (!res.ok) return { delivered: false, reason: `email_provider_status_${res.status}` };
    return { delivered: true };
  } catch {
    return { delivered: false, reason: "email_provider_unreachable" };
  }
}

// ---------------------------------------------------------------------------
// ID-JAG: доверени издатели, JWKS и проверка на твърдението
// ---------------------------------------------------------------------------

async function trustedIssuer(env, iss) {
  if (!iss) return null;
  return env.DB.prepare("SELECT * FROM agent_trusted_issuers WHERE issuer = ?1 AND enabled = 1").bind(String(iss)).first().catch(() => null);
}

export async function listTrustedIssuers(env) {
  const { results } = await env.DB.prepare(
    "SELECT issuer, name FROM agent_trusted_issuers WHERE enabled = 1 ORDER BY issuer"
  ).all().catch(() => ({ results: [] }));
  return results || [];
}

/** Публичният ключ на издателя по kid. Кешира се в D1; при непознат kid се
 *  презарежда JWKS (ротация на ключове от страна на издателя). */
async function issuerKey(env, issuerRow, kid) {
  if (!kid) return null;
  const cached = await env.DB.prepare("SELECT public_jwk, fetched_at FROM agent_issuer_keys WHERE issuer=?1 AND kid=?2")
    .bind(issuerRow.issuer, kid).first().catch(() => null);
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < JWKS_CACHE_MS) {
    try { return JSON.parse(cached.public_jwk); } catch { /* презареждаме */ }
  }
  let doc = null;
  try {
    const res = await fetch(issuerRow.jwks_uri, { headers: { accept: "application/jwk-set+json, application/json" } });
    if (!res.ok) return cached ? JSON.parse(cached.public_jwk) : null;
    doc = await res.json();
  } catch {
    return cached ? JSON.parse(cached.public_jwk) : null;
  }
  const keys = (doc && Array.isArray(doc.keys) ? doc.keys : []).filter((k) => k && k.kid);
  const now = nowISO();
  for (const k of keys) {
    await env.DB.prepare(
      "INSERT INTO agent_issuer_keys (issuer, kid, public_jwk, fetched_at) VALUES (?1,?2,?3,?4) " +
      "ON CONFLICT(issuer, kid) DO UPDATE SET public_jwk=excluded.public_jwk, fetched_at=excluded.fetched_at"
    ).bind(issuerRow.issuer, k.kid, JSON.stringify(k), now).run().catch(() => {});
  }
  return keys.find((k) => k.kid === kid) || null;
}

const ALG_PARAMS = {
  RS256: { importAlg: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verifyAlg: { name: "RSASSA-PKCS1-v1_5" } },
  PS256: { importAlg: { name: "RSA-PSS", hash: "SHA-256" }, verifyAlg: { name: "RSA-PSS", saltLength: 32 } },
  ES256: { importAlg: { name: "ECDSA", namedCurve: "P-256" }, verifyAlg: { name: "ECDSA", hash: "SHA-256" } },
};

/**
 * Проверява ID-JAG твърдение. Връща { claims, issuerRow } или хвърля Error с
 * машинно четим код в `message` (използва се като error_description).
 */
async function verifyIdJag(env, assertion) {
  const parts = String(assertion || "").split(".");
  if (parts.length !== 3) throw new Error("assertion is not a compact JWS");

  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(bytesFromB64url(parts[0]))); } catch { throw new Error("assertion header is malformed"); }
  try { claims = JSON.parse(new TextDecoder().decode(bytesFromB64url(parts[1]))); } catch { throw new Error("assertion payload is malformed"); }

  const params = ALG_PARAMS[header.alg];
  if (!params) throw new Error("unsupported assertion signing algorithm");
  // `alg: none` и симетричните алгоритми са изключени по конструкция (виж ALG_PARAMS).

  const issuerRow = await trustedIssuer(env, claims.iss);
  if (!issuerRow) throw new Error("assertion issuer is not trusted");

  const jwk = await issuerKey(env, issuerRow, header.kid);
  if (!jwk) throw new Error("assertion signing key was not found in the issuer JWKS");

  let key;
  try {
    key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["verify"], ext: true }, params.importAlg, false, ["verify"]);
  } catch {
    throw new Error("assertion signing key could not be imported");
  }
  const valid = await crypto.subtle.verify(params.verifyAlg, key, bytesFromB64url(parts[2]), te.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("assertion signature is invalid");

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("assertion is expired");
  if (typeof claims.iat === "number" && claims.iat > now + 60) throw new Error("assertion is not yet valid");
  if (typeof claims.iat === "number" && now - claims.iat > ASSERTION_MAX_AGE) throw new Error("assertion is too old");
  if (claims.exp - now > ASSERTION_MAX_AGE + 60) throw new Error("assertion lifetime is too long");

  const expectedAud = issuerRow.audience || RESOURCE;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expectedAud) && !aud.includes(ISSUER)) throw new Error("assertion audience does not match this resource");

  // Еднократност: същият jti от същия издател не се приема втори път.
  const jti = str(claims.jti, 200);
  if (!jti) throw new Error("assertion is missing jti");
  const jtiHash = await sha256hex(`${claims.iss}|${jti}`);
  const seen = await env.DB.prepare("SELECT jti_hash FROM agent_assertion_jti WHERE jti_hash = ?1").bind(jtiHash).first().catch(() => null);
  if (seen) throw new Error("assertion has already been used");
  await env.DB.prepare("INSERT OR IGNORE INTO agent_assertion_jti (jti_hash, issuer, expires_at, created_at) VALUES (?1,?2,?3,?4)")
    .bind(jtiHash, String(claims.iss), new Date(claims.exp * 1000).toISOString(), nowISO()).run().catch(() => {});

  return { claims, issuerRow };
}

// ---------------------------------------------------------------------------
// Издаване на креденшъл
// ---------------------------------------------------------------------------

async function findVerifiedUserByEmail(env, email) {
  if (!email) return null;
  return env.DB.prepare("SELECT id, email, email_verified FROM users WHERE lower(email) = ?1").bind(email).first().catch(() => null);
}

/** Издава access + refresh токен за дадена регистрация. */
async function issueCredential(env, registration) {
  const now = Math.floor(Date.now() / 1000);
  const scopes = String(registration.scope || "").split(/\s+/).filter(Boolean);
  const linked = !!registration.user_id;
  const accessToken = await signJwt(env, {
    typ: "at+jwt",
    claims: {
      iss: ISSUER,
      sub: `agent:${registration.id}`,
      aud: RESOURCE,
      client_id: registration.agent_issuer || "auth.md",
      scope: scopes.join(" "),
      agent_id: registration.id,
      identity_type: registration.identity_type,
      claimed: linked,
      jti: uuid(),
      iat: now, nbf: now, exp: now + ACCESS_TOKEN_TTL,
    },
  });

  const refreshTtl = linked ? REFRESH_TOKEN_TTL : UNCLAIMED_REFRESH_TTL;
  const refreshToken = randomToken(32);
  await env.DB.prepare(
    "INSERT INTO agent_refresh_tokens (token_hash, registration_id, scope, expires_at, created_at) VALUES (?1,?2,?3,?4,?5)"
  ).bind(await sha256hex(refreshToken), registration.id, scopes.join(" "), isoPlusSeconds(refreshTtl), nowISO()).run();

  return {
    credential: accessToken,
    credential_type: "access_token",
    token_type: "Bearer",
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    refresh_expires_in: refreshTtl,
    scope: scopes.join(" "),
  };
}

async function createRegistration(env, fields) {
  const id = uuid();
  const row = {
    id,
    identity_type: fields.identityType,
    assertion_type: fields.assertionType || null,
    agent_issuer: fields.agentIssuer || null,
    agent_subject: fields.agentSubject || null,
    agent_name: fields.agentName || null,
    agent_instance: fields.agentInstance || null,
    agent_contact: fields.agentContact || null,
    email: fields.email || null,
    user_id: fields.userId || null,
    scope: (fields.scopes || PUBLIC_AGENT_SCOPES).join(" "),
    status: fields.userId ? "active" : "unclaimed",
    claimed_at: fields.userId ? nowISO() : null,
    expires_at: fields.userId ? null : isoPlusSeconds(UNCLAIMED_REGISTRATION_TTL),
    created_at: nowISO(),
  };
  await env.DB.prepare(
    "INSERT INTO agent_registrations (id, identity_type, assertion_type, agent_issuer, agent_subject, agent_name, agent_instance, agent_contact, email, user_id, scope, status, claimed_at, expires_at, created_at) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)"
  ).bind(
    row.id, row.identity_type, row.assertion_type, row.agent_issuer, row.agent_subject, row.agent_name,
    row.agent_instance, row.agent_contact, row.email, row.user_id, row.scope, row.status,
    row.claimed_at, row.expires_at, row.created_at
  ).run();
  return row;
}

/** Изисканите обхвати, ограничени до позволените за състоянието на регистрацията. */
function grantedScopes(requested, allowed) {
  const req = String(requested || "").split(/\s+/).filter(Boolean);
  const list = (req.length ? req : allowed).filter((s) => allowed.includes(s) && SUPPORTED_SCOPES.includes(s));
  // Публичният обхват върви винаги — иначе креденшълът не върши нищо.
  return [...new Set([...PUBLIC_AGENT_SCOPES, ...list])];
}

// ---------------------------------------------------------------------------
// Церемония по потвърждаване (claim)
// ---------------------------------------------------------------------------

async function startClaim(env, { registration, email, agentName }) {
  const claimToken = randomToken(32);
  const code = otpCode();
  // Хешът на кода е привързан към claim токена — открадната база не дава код.
  const otpHash = await sha256hex(`${claimToken}|${code}`);
  const delivery = await sendClaimEmail(env, { to: email, code, agentName });
  await env.DB.prepare(
    "INSERT INTO agent_claims (claim_token_hash, registration_id, email, otp_hash, delivered, expires_at, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(await sha256hex(claimToken), registration.id, email, otpHash, delivery.delivered ? 1 : 0, isoPlusSeconds(CLAIM_TTL), nowISO()).run();
  await logEvent(env, { registrationId: registration.id, event: "claim_started", identityType: registration.identity_type, detail: delivery.delivered ? "email_sent" : delivery.reason });
  return { claimToken, delivery };
}

function claimResponse({ claimToken, delivery, email }) {
  return {
    claim_uri: AGENT_AUTH_PATHS.claimComplete,
    claim_token: claimToken,
    claim_method: "email_otp",
    code_length: 6,
    expires_in: CLAIM_TTL,
    max_attempts: CLAIM_MAX_ATTEMPTS,
    delivered: !!delivery.delivered,
    // Имейлът се връща маскиран — агентът вече го знае, но лог/грешка не бива
    // да го разнася в пълен вид.
    email_hint: email.replace(/^(.).*(@.*)$/, "$1***$2"),
    ...(delivery.delivered ? {} : { delivery_error: delivery.reason }),
    instructions: "Ask the user for the 6-digit code that was emailed to them, then POST { claim_token, code } to claim_uri.",
  };
}

// ---------------------------------------------------------------------------
// POST /agent/auth — регистрация
// ---------------------------------------------------------------------------

async function handleRegister(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return agentError(parsed.error, parsed.description, 400);
  const body = parsed.body;

  const identityType = str(body.identity_type, 40) || "anonymous";
  const assertionType = str(body.assertion_type, 120);
  const agentInfo = (body.agent && typeof body.agent === "object") ? body.agent : {};
  const meta = {
    agentName: str(agentInfo.name, 120),
    agentInstance: str(agentInfo.instance_id, 120),
    agentContact: str(agentInfo.contact, 200),
  };
  const credentialType = str(body.credential_type, 40) || "access_token";
  if (credentialType !== "access_token") {
    return agentError("unsupported_credential_type", "Only credential_type=access_token is issued. See the agent_auth metadata.", 400,
      { credential_types_supported: ["access_token"] });
  }

  // --- Поток 1/2: identity_assertion ---------------------------------------
  if (identityType === "identity_assertion") {
    if (assertionType === ID_JAG_TOKEN_TYPE) {
      const assertion = str(body.assertion, 8000);
      if (!assertion) return agentError("invalid_request", "Field 'assertion' is required for ID-JAG registration.", 400);
      let verified;
      try {
        verified = await verifyIdJag(env, assertion);
      } catch (e) {
        await logEvent(env, { event: "denied", identityType, detail: String(e.message || e) });
        return agentError("invalid_assertion", String(e.message || "assertion could not be verified"), 401,
          { trusted_issuers: (await listTrustedIssuers(env)).map((r) => r.issuer) });
      }
      const { claims, issuerRow } = verified;
      const email = normalizeEmail(claims.email || claims.sub_id || claims.preferred_username);
      const emailVerified = claims.email_verified === true || claims.email_verified === "true";
      const issuerScopes = String(issuerRow.scopes || LINKED_AGENT_SCOPES.join(" ")).split(/\s+/).filter(Boolean);

      let user = null;
      if (email && emailVerified) user = await findVerifiedUserByEmail(env, email);
      const linked = user && (user.email_verified === 1 || user.email_verified === true);

      const registration = await createRegistration(env, {
        identityType, assertionType, ...meta,
        agentIssuer: String(claims.iss),
        agentSubject: str(claims.sub, 200),
        email: email || null,
        userId: linked ? user.id : null,
        scopes: grantedScopes(body.scope, linked ? issuerScopes : PUBLIC_AGENT_SCOPES),
      });
      const credential = await issueCredential(env, registration);
      await logEvent(env, { registrationId: registration.id, event: "registered", identityType, detail: linked ? "id_jag_linked" : "id_jag_unlinked" });

      const payload = {
        ...credential,
        registration_id: registration.id,
        status: registration.status,
        identity_type: identityType,
        assertion_type: assertionType,
        subject: { issuer: registration.agent_issuer, subject: registration.agent_subject, email: email || null },
      };
      // Твърдението е валидно, но за този имейл няма акаунт тук → предлагаме
      // церемония, вместо да мълчим за по-малкия обхват.
      if (!linked) {
        payload.claim = {
          claim_uri: AGENT_AUTH_PATHS.claim,
          reason: email ? "no_verified_account_for_this_email" : "assertion_has_no_verified_email",
          instructions: "POST { registration_id, email } to claim_uri to start the email confirmation ceremony.",
        };
      }
      return jsonNoStore(payload, 201);
    }

    if (assertionType === "verified_email") {
      const email = normalizeEmail(body.email);
      if (!email) return agentError("invalid_request", "Field 'email' must be a valid address for verified_email registration.", 400);
      const registration = await createRegistration(env, {
        identityType, assertionType, ...meta,
        email,
        userId: null,
        scopes: PUBLIC_AGENT_SCOPES,
      });
      const credential = await issueCredential(env, registration);
      const { claimToken, delivery } = await startClaim(env, { registration, email, agentName: meta.agentName });
      await logEvent(env, { registrationId: registration.id, event: "registered", identityType, detail: "verified_email" });
      return jsonNoStore({
        ...credential,
        registration_id: registration.id,
        status: registration.status,
        identity_type: identityType,
        assertion_type: assertionType,
        claim: claimResponse({ claimToken, delivery, email }),
      }, 201);
    }

    return agentError("unsupported_assertion_type", "Supported assertion types are listed in the agent_auth metadata.", 400,
      { assertion_types_supported: [ID_JAG_TOKEN_TYPE, "verified_email"] });
  }

  // --- Поток 3: anonymous ---------------------------------------------------
  if (identityType === "anonymous") {
    const key = await sourceKey(env, request);
    if (await tooManyAnonymous(env, key)) {
      return agentError("rate_limited", "Too many anonymous registrations from this source. Try again later.", 429);
    }
    const registration = await createRegistration(env, {
      identityType, assertionType: null, ...meta,
      email: null, userId: null, scopes: PUBLIC_AGENT_SCOPES,
    });
    const credential = await issueCredential(env, registration);
    await logEvent(env, { registrationId: registration.id, event: "registered", identityType, detail: key });
    return jsonNoStore({
      ...credential,
      registration_id: registration.id,
      status: registration.status,
      identity_type: identityType,
      claim: {
        claim_uri: AGENT_AUTH_PATHS.claim,
        optional: true,
        instructions: "Optional. POST { registration_id, email } to claim_uri to link this credential to an existing account and unlock profile:read and saved:read.",
      },
    }, 201);
  }

  return agentError("unsupported_identity_type", "Supported identity types are listed in the agent_auth metadata.", 400,
    { identity_types_supported: ["identity_assertion", "anonymous"] });
}

// ---------------------------------------------------------------------------
// POST /agent/auth/claim — стартиране на церемонията
// ---------------------------------------------------------------------------

async function handleClaimStart(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return agentError(parsed.error, parsed.description, 400);
  const registrationId = str(parsed.body.registration_id, 60);
  const email = normalizeEmail(parsed.body.email);
  if (!registrationId || !email) return agentError("invalid_request", "Fields 'registration_id' and 'email' are required.", 400);

  const registration = await loadAgentRegistration(env, registrationId);
  if (!registration || registration.status === "revoked") {
    return agentError("invalid_registration", "Unknown or revoked registration.", 404);
  }
  if (registration.user_id) return agentError("already_claimed", "This registration is already linked to an account.", 409);
  // Заявеният при регистрацията имейл не може да бъде подменян в церемонията.
  if (registration.email && registration.email !== email) {
    return agentError("email_mismatch", "The email does not match the one used at registration.", 400);
  }

  const { claimToken, delivery } = await startClaim(env, { registration, email, agentName: registration.agent_name });
  return jsonNoStore(claimResponse({ claimToken, delivery, email }), 202);
}

// ---------------------------------------------------------------------------
// POST /agent/auth/claim/complete — завършване на церемонията
// ---------------------------------------------------------------------------

async function handleClaimComplete(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return agentError(parsed.error, parsed.description, 400);
  const claimToken = str(parsed.body.claim_token, 200);
  const code = str(parsed.body.code, 12);
  if (!claimToken || !code) return agentError("invalid_request", "Fields 'claim_token' and 'code' are required.", 400);

  const hash = await sha256hex(claimToken);
  const claim = await env.DB.prepare("SELECT * FROM agent_claims WHERE claim_token_hash = ?1").bind(hash).first().catch(() => null);
  if (!claim) return agentError("invalid_claim", "Unknown claim token.", 404);
  if (claim.completed_at) return agentError("invalid_claim", "This claim has already been completed.", 409);
  if (new Date(claim.expires_at).getTime() < Date.now()) return agentError("expired_claim", "The claim has expired. Start a new one.", 410);
  if (claim.attempts >= CLAIM_MAX_ATTEMPTS) return agentError("too_many_attempts", "Too many incorrect codes. Start a new claim.", 429);

  const expected = await sha256hex(`${claimToken}|${code}`);
  if (!timingSafeEqual(expected, claim.otp_hash)) {
    await env.DB.prepare("UPDATE agent_claims SET attempts = attempts + 1 WHERE claim_token_hash = ?1").bind(hash).run().catch(() => {});
    return agentError("invalid_code", "The confirmation code is not correct.", 400,
      { attempts_remaining: Math.max(0, CLAIM_MAX_ATTEMPTS - (claim.attempts + 1)) });
  }

  const registration = await loadAgentRegistration(env, claim.registration_id);
  if (!registration || registration.status === "revoked") return agentError("invalid_registration", "Unknown or revoked registration.", 404);

  const user = await findVerifiedUserByEmail(env, claim.email);
  const verified = user && (user.email_verified === 1 || user.email_verified === true);
  await env.DB.prepare("UPDATE agent_claims SET completed_at = ?1 WHERE claim_token_hash = ?2").bind(nowISO(), hash).run().catch(() => {});

  if (!verified) {
    // Кодът е верен, но такъв акаунт няма. НЕ създаваме акаунт — казваме го ясно.
    await logEvent(env, { registrationId: registration.id, event: "denied", identityType: registration.identity_type, detail: "no_account_for_claimed_email" });
    return agentError("no_account", `The code was correct, but no verified ${BRAND} account exists for that address. The user must sign in at ${SITE} once, then repeat the claim.`, 409,
      { sign_in_uri: `${SITE}/` });
  }

  const scopes = LINKED_AGENT_SCOPES;
  await env.DB.prepare(
    "UPDATE agent_registrations SET user_id=?1, email=?2, scope=?3, status='active', claimed_at=?4, expires_at=NULL WHERE id=?5"
  ).bind(user.id, claim.email, scopes.join(" "), nowISO(), registration.id).run();
  // Старите токени с по-малък обхват отпадат — новият креденшъл ги замества.
  await env.DB.prepare("UPDATE agent_refresh_tokens SET revoked_at=?1 WHERE registration_id=?2 AND revoked_at IS NULL")
    .bind(nowISO(), registration.id).run().catch(() => {});

  const updated = await loadAgentRegistration(env, registration.id);
  const credential = await issueCredential(env, updated);
  await logEvent(env, { registrationId: registration.id, event: "claimed", identityType: registration.identity_type, detail: "email_otp" });

  return jsonNoStore({
    ...credential,
    registration_id: registration.id,
    status: "active",
    claimed: true,
    subject: { sub: user.id, email: claim.email },
  }, 200);
}

// ---------------------------------------------------------------------------
// POST /agent/auth/token — подновяване на креденшъла
// ---------------------------------------------------------------------------

async function handleRefresh(request, env) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return agentError(parsed.error, parsed.description, 400);
  const token = str(parsed.body.refresh_token, 200);
  if (!token) return agentError("invalid_request", "Field 'refresh_token' is required.", 400);

  const hash = await sha256hex(token);
  const row = await env.DB.prepare("SELECT * FROM agent_refresh_tokens WHERE token_hash = ?1").bind(hash).first().catch(() => null);
  if (!row) return agentError("invalid_grant", "Unknown refresh token.", 400);
  if (row.revoked_at) {
    // Преизползван токен → регистрацията се гаси изцяло (OAuth 2.1 §4.14.2).
    await revokeRegistration(env, row.registration_id, "refresh_token_reuse");
    return agentError("invalid_grant", "The refresh token was already used or revoked. The registration has been revoked.", 400);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) return agentError("invalid_grant", "The refresh token has expired. Register again.", 400);

  const registration = await loadAgentRegistration(env, row.registration_id);
  if (!registration || registration.status === "revoked") return agentError("invalid_grant", "The registration is no longer active.", 400);

  const credential = await issueCredential(env, registration);
  await env.DB.prepare("UPDATE agent_refresh_tokens SET revoked_at=?1, rotated_to=?2, last_used_at=?1 WHERE token_hash=?3")
    .bind(nowISO(), await sha256hex(credential.refresh_token), hash).run().catch(() => {});
  await env.DB.prepare("UPDATE agent_registrations SET last_used_at=?1, use_count=use_count+1 WHERE id=?2")
    .bind(nowISO(), registration.id).run().catch(() => {});

  return jsonNoStore({ ...credential, registration_id: registration.id, status: registration.status }, 200);
}

// ---------------------------------------------------------------------------
// POST /agent/auth/revoke — отменяне
// ---------------------------------------------------------------------------

async function revokeRegistration(env, registrationId, reason) {
  await env.DB.prepare("UPDATE agent_registrations SET status='revoked', revoked_at=?1, revocation_reason=?2 WHERE id=?3 AND status != 'revoked'")
    .bind(nowISO(), String(reason || "revoked").slice(0, 100), registrationId).run().catch(() => {});
  await env.DB.prepare("UPDATE agent_refresh_tokens SET revoked_at=?1 WHERE registration_id=?2 AND revoked_at IS NULL")
    .bind(nowISO(), registrationId).run().catch(() => {});
  await logEvent(env, { registrationId, event: "revoked", detail: String(reason || "").slice(0, 100) });
}

async function handleRevoke(request, env) {
  const parsed = await readJsonBody(request);
  const body = parsed.body || {};
  let registrationId = str(body.registration_id, 60);

  if (!registrationId) {
    const token = str(body.refresh_token, 200);
    if (token) {
      const row = await env.DB.prepare("SELECT registration_id FROM agent_refresh_tokens WHERE token_hash = ?1")
        .bind(await sha256hex(token)).first().catch(() => null);
      if (row) registrationId = row.registration_id;
    }
  }
  // Отменяне и с Bearer заглавка — най-удобното за агент, който вече има токен.
  if (!registrationId) {
    const m = /^Bearer\s+(.+)$/i.exec(String(request.headers.get("Authorization") || "").trim());
    if (m) {
      const claims = await verifyJwt(env, m[1], { audience: RESOURCE }).catch(() => null);
      if (claims && String(claims.sub || "").startsWith("agent:")) registrationId = String(claims.sub).slice(6);
    }
  }
  if (registrationId) await revokeRegistration(env, registrationId, str(body.reason, 100) || "agent_request");
  // RFC 7009 семантика: винаги 200, за да не се издава кое е валидно.
  return jsonNoStore({ revoked: true }, 200);
}

// ---------------------------------------------------------------------------
// GET /agent/auth — безопасно описание (скенер може да го чете без странични ефекти)
// ---------------------------------------------------------------------------

async function handleRegisterInfo(env) {
  const issuers = await listTrustedIssuers(env).catch(() => []);
  return jsonNoStore({
    ...agentAuthBlock(),
    method: "POST",
    content_type: "application/json",
    trusted_issuers: issuers.map((r) => ({ issuer: r.issuer, name: r.name })),
    note: "This GET is a safe description. Registration happens with POST and has side effects — do not probe it during passive scans.",
  }, 200);
}

// ---------------------------------------------------------------------------
// /auth.md — манифестът, който агентът чете
// ---------------------------------------------------------------------------

/**
 * Документът е на английски НАРОЧНО: това е протоколен манифест, който четат
 * агенти, а не потребители — както и примерът в github.com/workos/auth.md.
 * Човешката документация на български е на /docs/api.
 */
export function authMdDocument({ trustedIssuers = [], emailConfigured = true } = {}) {
  const issuerList = trustedIssuers.length
    ? trustedIssuers.map((r) => `- \`${r.issuer}\` — ${r.name}`).join("\n")
    : "_None registered yet._ Until an identity provider is added here, ID-JAG assertions are rejected with `invalid_assertion` / `assertion issuer is not trusted`. Identity providers can request enrolment at <office@s2kdesign.com>; we need your issuer URL and JWKS URI.";

  return `# auth.md — agent registration for ${BRAND}

${BRAND} (${SITE}) is a public register of European and national funding
procedures across the 27 EU member states. This document tells an AI agent how
to register for a credential on behalf of a user, following the auth.md
convention (<https://workos.com/auth-md>).

- **Resource:** \`${RESOURCE}\`
- **Authorization server:** \`${ISSUER}\`
- **Protected resource metadata:** \`${SITE}/.well-known/oauth-protected-resource\`
- **Authorization server metadata (contains \`agent_auth\`):** \`${SITE}/.well-known/oauth-authorization-server\`
- **Register:** \`POST ${AGENT_AUTH_PATHS.register}\`
- **Human documentation:** \`${SITE}/docs/api\`

> Most of this site needs no credential at all. Every procedure, programme,
> country and source is public: \`GET ${RESOURCE}/projects?country=BG\` works
> anonymously, and every public page returns Markdown with
> \`Accept: text/markdown\`. Register only when you need a user's **profile** or
> **saved procedures**, or when you want your traffic attributed to a named agent.

## Audience

You should read this if you are an autonomous agent acting for a person who
wants their ${BRAND} profile or saved procedures used in your work. If you are a
human, read ${SITE}/docs/api instead.

## Step 1 — Discover

1. \`GET ${SITE}/.well-known/oauth-protected-resource\` → note \`resource\` and \`authorization_servers\`.
2. \`GET ${SITE}/.well-known/oauth-authorization-server\` → read the \`agent_auth\` block.

The \`agent_auth\` block carries \`skill\` (this file), \`register_uri\`,
\`claim_uri\`, \`revocation_uri\`, \`identity_types_supported\`,
\`assertion_types_supported\`, \`credential_types_supported\` and
\`events_supported\`. Do not hard-code the URLs below — read them from metadata.

## Step 2 — Choose a registration method

| Method | \`identity_type\` | \`assertion_type\` | Human needed? | Result |
| --- | --- | --- | --- | --- |
| ID-JAG | \`identity_assertion\` | \`${ID_JAG_TOKEN_TYPE}\` | No | Linked immediately if the asserted email matches a verified account |
| Verified email | \`identity_assertion\` | \`verified_email\` | Yes, one 6-digit code | Linked after the claim ceremony |
| Anonymous | \`anonymous\` | — | No | Public data only; can be claimed later |

Only \`credential_type: "access_token"\` is issued. There are no API keys.

## Step 3 — Register

\`POST ${AGENT_AUTH_PATHS.register}\` with \`Content-Type: application/json\`.

Show the user what you are about to do **before** you assert their identity.

### ID-JAG

\`\`\`json
{
  "identity_type": "identity_assertion",
  "assertion_type": "${ID_JAG_TOKEN_TYPE}",
  "assertion": "<compact JWS>",
  "credential_type": "access_token",
  "agent": { "name": "Your Agent", "instance_id": "opaque-id", "contact": "abuse@example.com" }
}
\`\`\`

Mint the assertion with \`aud\` = \`${RESOURCE}\`, a fresh \`jti\`, and an expiry
no more than 5 minutes out. Signature algorithms accepted: \`RS256\`, \`PS256\`,
\`ES256\`. Each \`jti\` is accepted once. Include the user's verified email as the
\`email\` claim together with \`email_verified: true\` — that is what links the
credential to their account.

**Trusted issuers**

${issuerList}

If your issuer is not on that list, or the asserted email has no verified
account here, registration still succeeds but returns \`status: "unclaimed"\`
with public scope and a \`claim\` object. Continue at step 4.

### Verified email

\`\`\`json
{
  "identity_type": "identity_assertion",
  "assertion_type": "verified_email",
  "email": "person@example.com",
  "agent": { "name": "Your Agent" }
}
\`\`\`

Returns \`201\` with a credential (public scope), plus a \`claim\` object holding
\`claim_token\`. Continue at step 4.

### Anonymous

\`\`\`json
{ "identity_type": "anonymous", "agent": { "name": "Your Agent" } }
\`\`\`

Returns \`201\` with a credential scoped to \`procedures:read\`. Claiming is
optional; do it only if the user asks for their own data.

## Step 4 — Claim ceremony (when \`status\` is \`unclaimed\`)

1. If you do not already have a \`claim_token\`, \`POST ${AGENT_AUTH_PATHS.claim}\`
   with \`{ "registration_id": "...", "email": "person@example.com" }\`.
2. We email the user a 6-digit code, valid for 15 minutes.${emailConfigured ? "" : " **Email delivery is not configured on this deployment right now**, so `delivered` will be `false` — tell the user and stop."}
3. Ask the user for the code. **Never guess it** — five wrong codes end the ceremony.
4. \`POST ${AGENT_AUTH_PATHS.claimComplete}\` with \`{ "claim_token": "...", "code": "123456" }\`.

Keep \`claim_token\` in memory for the duration of the ceremony only. Never log
it, never persist it.

On success you receive a fresh credential with scope
\`procedures:read openid profile:read saved:read\` and \`status: "active"\`.

If the address has no verified ${BRAND} account, the response is \`409 no_account\`.
The user must sign in at ${SITE} once (Google sign-in), then repeat the ceremony.
We never create accounts on an agent's behalf.

## Step 5 — Use the credential

\`\`\`http
GET ${RESOURCE}/saved-procedures HTTP/1.1
Host: euro-funds.eu
Authorization: Bearer <credential>
\`\`\`

- Credentials last 1 hour. Renew with \`POST ${AGENT_AUTH_PATHS.token}\` and
  \`{ "refresh_token": "..." }\`. Refresh tokens rotate on every use; presenting a
  used one revokes the whole registration.
- **Read-only.** Any non-GET request with a Bearer credential returns \`403\`.
  \`/api/admin/*\` is never reachable with a credential.
- On \`401\`, restart at step 1. Never retry a stashed credential.

### Scopes

| Scope | Grants |
| --- | --- |
| \`procedures:read\` | Public procedure, programme, country and source data |
| \`openid\` | The user's identifier, name and email |
| \`profile:read\` | Their funding profile (country, region, sector, company size) |
| \`saved:read\` | Their saved procedures |

Only \`procedures:read\` is granted before a claim completes.

## Revocation

- Agent-initiated: \`POST ${AGENT_AUTH_PATHS.revoke}\` with
  \`{ "registration_id": "..." }\`, or with \`Authorization: Bearer <credential>\`.
  Always returns \`200\`.
- User-initiated: the user revokes agent access from their account at ${SITE}.
- Provider-initiated (ID-JAG): we honour the CAEP event types listed in
  \`events_supported\`.
- Revocation is immediate — the registration is checked on every request, not
  just at token expiry.

## Errors

| Status | \`error\` | What to do |
| --- | --- | --- |
| 400 | \`invalid_request\` | Fix the body and retry once |
| 400 | \`invalid_code\` | Ask the user for the code again (\`attempts_remaining\`) |
| 400 | \`invalid_grant\` | Refresh token is spent or expired — register again |
| 401 | \`invalid_assertion\` | Read \`error_description\`; do not retry the same assertion |
| 401 | \`invalid_token\` | Credential is dead — restart at step 1 |
| 403 | \`insufficient_scope\` | Complete the claim ceremony, or stop |
| 409 | \`no_account\` | Ask the user to sign in at ${SITE} once, then repeat |
| 409 | \`already_claimed\` | Use the existing credential |
| 410 | \`expired_claim\` | Start a new claim |
| 429 | \`rate_limited\`, \`too_many_attempts\` | Back off; do not loop |
| 5xx | — | Exponential backoff, at most 3 attempts |

## Rules

- Do not skip ahead. Discovery precedes registration; registration precedes use.
- Do not \`POST\` to \`${AGENT_AUTH_PATHS.register}\` to probe availability — it
  creates registrations and can send email. \`GET\` the same URL for a safe,
  side-effect-free description.
- Never assert an identity the user has not confirmed to you.
- Data here is compiled from official sources and does not replace the official
  procedure documentation. See ${SITE}/terms.

_Machine-readable metadata: ${SITE}/.well-known/oauth-authorization-server (\`agent_auth\`)._
`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const AUTH_MD_HEADERS = {
  "content-type": "text/markdown; charset=utf-8",
  "cache-control": "public, max-age=3600",
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
  link: `<${AGENT_AUTH_PATHS.skill}>; rel="canonical", <${SITE}/.well-known/oauth-authorization-server>; rel="describedby"; type="application/json"`,
};

/** Връща Response за пътищата на auth.md или null. */
export async function handleAgentAuth(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/auth.md" || pathname === "/AUTH.md") {
    if (method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    const issuers = await listTrustedIssuers(env).catch(() => []);
    return new Response(authMdDocument({ trustedIssuers: issuers, emailConfigured: isEmailConfigured(env) }), { status: 200, headers: AUTH_MD_HEADERS });
  }

  if (pathname === "/agent/auth") {
    if (method === "GET") return handleRegisterInfo(env);
    if (method === "POST") return handleRegister(request, env);
    return agentError("invalid_request", "Use POST to register or GET for a safe description.", 405);
  }
  if (pathname === "/agent/auth/claim") {
    if (method !== "POST") return agentError("invalid_request", "Use POST.", 405);
    return handleClaimStart(request, env);
  }
  if (pathname === "/agent/auth/claim/complete") {
    if (method !== "POST") return agentError("invalid_request", "Use POST.", 405);
    return handleClaimComplete(request, env);
  }
  if (pathname === "/agent/auth/token") {
    if (method !== "POST") return agentError("invalid_request", "Use POST.", 405);
    return handleRefresh(request, env);
  }
  if (pathname === "/agent/auth/revoke") {
    if (method !== "POST") return agentError("invalid_request", "Use POST.", 405);
    return handleRevoke(request, env);
  }

  return null;
}
