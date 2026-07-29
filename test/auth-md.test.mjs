// Тестове за auth.md — агентска регистрация (https://workos.com/auth-md).
//
// Покрива и трите потока (ID-JAG, потвърден имейл, анонимно), церемонията по
// потвърждаване, ротацията на refresh токени, отменянето и инвариантите на
// сигурността (непотвърден креденшъл НЕ вижда лични данни).
//
//   node test/auth-md.test.mjs

import assert from "node:assert/strict";

import { handleAgentAuth, authMdDocument, PUBLIC_AGENT_SCOPES, LINKED_AGENT_SCOPES } from "../worker/agent/agent-auth.js";
import {
  handleOAuthServer, authenticateBearer, agentAuthBlock, signJwt,
  AGENT_AUTH_PATHS, ID_JAG_TOKEN_TYPE, ISSUER, RESOURCE,
} from "../worker/agent/oauth-server.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const sha256hex = async (s) => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
};
const b64url = (buf) => Buffer.from(buf).toString("base64url");

// ---------------------------------------------------------------------------
// Мок на D1 — пада с ясна грешка при непокрита заявка (както в останалите тестове)
// ---------------------------------------------------------------------------

function makeDB() {
  const tables = {
    users: [], oauth_signing_keys: [],
    agent_registrations: [], agent_refresh_tokens: [], agent_claims: [],
    agent_trusted_issuers: [], agent_issuer_keys: [], agent_assertion_jti: [], agent_auth_events: [],
  };

  const exec = (sql, b, mode) => {
    const s = sql.trim().replace(/\s+/g, " ");

    // --- ключове за подпис (общи с OAuth server-а) ---------------------------
    if (s.startsWith("SELECT * FROM oauth_signing_keys")) return tables.oauth_signing_keys[0] || null;
    if (s.startsWith("INSERT OR IGNORE INTO oauth_signing_keys")) {
      if (!tables.oauth_signing_keys.some((k) => k.kid === b[0])) {
        tables.oauth_signing_keys.push({ kid: b[0], algorithm: "ES256", public_jwk: b[1], private_jwk_ciphertext: b[2], private_jwk_iv: b[3], status: "active", created_at: b[4] });
      }
      return null;
    }
    if (s.startsWith("SELECT kid, public_jwk FROM oauth_signing_keys")) return tables.oauth_signing_keys.map((k) => ({ kid: k.kid, public_jwk: k.public_jwk }));

    // --- потребители ---------------------------------------------------------
    if (s.startsWith("SELECT id, email, email_verified, display_name")) return tables.users.find((u) => u.id === b[0]) || null;
    if (s.startsWith("SELECT id, email, email_verified FROM users WHERE lower(email)")) {
      return tables.users.find((u) => String(u.email).toLowerCase() === b[0]) || null;
    }

    // --- регистрации ---------------------------------------------------------
    if (s.startsWith("INSERT INTO agent_registrations")) {
      tables.agent_registrations.push({
        id: b[0], identity_type: b[1], assertion_type: b[2], agent_issuer: b[3], agent_subject: b[4],
        agent_name: b[5], agent_instance: b[6], agent_contact: b[7], email: b[8], user_id: b[9],
        scope: b[10], status: b[11], claimed_at: b[12], expires_at: b[13], created_at: b[14],
        use_count: 0, last_used_at: null, revoked_at: null, revocation_reason: null,
      });
      return null;
    }
    if (s.startsWith("SELECT id, identity_type, assertion_type, agent_issuer")) {
      return tables.agent_registrations.find((r) => r.id === b[0]) || null;
    }
    if (s.startsWith("UPDATE agent_registrations SET user_id=?1")) {
      const r = tables.agent_registrations.find((x) => x.id === b[4]);
      if (r) Object.assign(r, { user_id: b[0], email: b[1], scope: b[2], status: "active", claimed_at: b[3], expires_at: null });
      return null;
    }
    if (s.startsWith("UPDATE agent_registrations SET last_used_at")) {
      const r = tables.agent_registrations.find((x) => x.id === b[1]);
      if (r) { r.last_used_at = b[0]; r.use_count += 1; }
      return null;
    }
    if (s.startsWith("UPDATE agent_registrations SET status='revoked'")) {
      const r = tables.agent_registrations.find((x) => x.id === b[2] && x.status !== "revoked");
      if (r) Object.assign(r, { status: "revoked", revoked_at: b[0], revocation_reason: b[1] });
      return null;
    }

    // --- refresh токени ------------------------------------------------------
    if (s.startsWith("INSERT INTO agent_refresh_tokens")) {
      tables.agent_refresh_tokens.push({ token_hash: b[0], registration_id: b[1], scope: b[2], expires_at: b[3], created_at: b[4], revoked_at: null, rotated_to: null });
      return null;
    }
    if (s.startsWith("SELECT * FROM agent_refresh_tokens")) return tables.agent_refresh_tokens.find((r) => r.token_hash === b[0]) || null;
    if (s.startsWith("SELECT registration_id FROM agent_refresh_tokens")) return tables.agent_refresh_tokens.find((r) => r.token_hash === b[0]) || null;
    if (s.startsWith("UPDATE agent_refresh_tokens SET revoked_at=?1, rotated_to=?2")) {
      const r = tables.agent_refresh_tokens.find((x) => x.token_hash === b[2]);
      if (r) { r.revoked_at = b[0]; r.rotated_to = b[1]; }
      return null;
    }
    if (s.startsWith("UPDATE agent_refresh_tokens SET revoked_at=?1 WHERE registration_id")) {
      for (const r of tables.agent_refresh_tokens) if (r.registration_id === b[1] && !r.revoked_at) r.revoked_at = b[0];
      return null;
    }

    // --- церемония -----------------------------------------------------------
    if (s.startsWith("INSERT INTO agent_claims")) {
      tables.agent_claims.push({ claim_token_hash: b[0], registration_id: b[1], email: b[2], otp_hash: b[3], delivered: b[4], expires_at: b[5], created_at: b[6], attempts: 0, completed_at: null });
      return null;
    }
    if (s.startsWith("SELECT * FROM agent_claims")) return tables.agent_claims.find((c) => c.claim_token_hash === b[0]) || null;
    if (s.startsWith("UPDATE agent_claims SET attempts")) {
      const c = tables.agent_claims.find((x) => x.claim_token_hash === b[0]);
      if (c) c.attempts += 1;
      return null;
    }
    if (s.startsWith("UPDATE agent_claims SET completed_at")) {
      const c = tables.agent_claims.find((x) => x.claim_token_hash === b[1]);
      if (c) c.completed_at = b[0];
      return null;
    }

    // --- доверени издатели и техните ключове ----------------------------------
    if (s.startsWith("SELECT * FROM agent_trusted_issuers")) return tables.agent_trusted_issuers.find((i) => i.issuer === b[0] && i.enabled === 1) || null;
    if (s.startsWith("SELECT issuer, name FROM agent_trusted_issuers")) return tables.agent_trusted_issuers.filter((i) => i.enabled === 1);
    if (s.startsWith("SELECT public_jwk, fetched_at FROM agent_issuer_keys")) return tables.agent_issuer_keys.find((k) => k.issuer === b[0] && k.kid === b[1]) || null;
    if (s.startsWith("INSERT INTO agent_issuer_keys")) {
      const ex = tables.agent_issuer_keys.find((k) => k.issuer === b[0] && k.kid === b[1]);
      if (ex) { ex.public_jwk = b[2]; ex.fetched_at = b[3]; }
      else tables.agent_issuer_keys.push({ issuer: b[0], kid: b[1], public_jwk: b[2], fetched_at: b[3] });
      return null;
    }

    // --- еднократност на твърденията -----------------------------------------
    if (s.startsWith("SELECT jti_hash FROM agent_assertion_jti")) return tables.agent_assertion_jti.find((j) => j.jti_hash === b[0]) || null;
    if (s.startsWith("INSERT OR IGNORE INTO agent_assertion_jti")) {
      if (!tables.agent_assertion_jti.some((j) => j.jti_hash === b[0])) tables.agent_assertion_jti.push({ jti_hash: b[0], issuer: b[1], expires_at: b[2], created_at: b[3] });
      return null;
    }

    // --- дневник --------------------------------------------------------------
    if (s.startsWith("INSERT INTO agent_auth_events")) {
      tables.agent_auth_events.push({ registration_id: b[0], event: b[1], identity_type: b[2], detail: b[3], created_at: b[4] });
      return null;
    }
    if (s.startsWith("SELECT COUNT(*) AS n FROM agent_auth_events")) {
      return { n: tables.agent_auth_events.filter((e) => e.event === "registered" && e.detail === b[0] && e.created_at > b[1]).length };
    }

    throw new Error("непокрита заявка в мока: " + s.slice(0, 100));
  };

  // D1 връща КОПИЯ на редовете, не живи обекти. Мокът прави същото — иначе
  // тестът мълчаливо вижда промени, които истинската база не би показала.
  const copy = (r) => (r && typeof r === "object" ? { ...r } : r);

  return {
    tables,
    prepare(sql) {
      let binds = [];
      const stmt = {
        bind(...a) { binds = a; return stmt; },
        async first() { const r = exec(sql, binds, "first"); return copy(Array.isArray(r) ? (r[0] || null) : r); },
        async all() { const r = exec(sql, binds, "all"); return { results: (Array.isArray(r) ? r : (r ? [r] : [])).map(copy) }; },
        async run() { return exec(sql, binds, "run"); },
      };
      return stmt;
    },
  };
}

function makeEnv(extra = {}) {
  const DB = makeDB();
  DB.tables.users.push({ id: "user-1", email: "ivan@example.com", email_verified: 1, display_name: "Иван", avatar_url: null, locale: "bg", role: "user", created_at: "2026-01-01", last_login_at: "2026-07-29" });
  return {
    DB,
    AUTH_SECRET: "test-auth-secret-0123456789abcdef",
    AI_CREDENTIALS_MASTER_KEY: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
    APP_URL: "https://euro-funds.eu",
    ...extra,
  };
}

const call = (env, url, init) => handleAgentAuth(new Request(url, init), env, new URL(url));
const post = (env, path, body, headers = {}) =>
  call(env, `https://euro-funds.eu${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

/** Прихваща изходящите заявки (Resend + JWKS) без истинска мрежа. */
function stubFetch(handler) {
  const original = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    sent.push({ url, init });
    const r = await handler(url, init);
    if (r) return r;
    throw new Error("неочаквана мрежова заявка в теста: " + url);
  };
  return { sent, restore: () => { globalThis.fetch = original; } };
}

/** Изважда 6-цифрения код от прихванатия имейл. */
function codeFromEmail(sent) {
  const email = sent.find((s) => s.url.includes("api.resend.com"));
  assert.ok(email, "имейлът не беше изпратен");
  const body = JSON.parse(email.init.body);
  const m = /(\d{6})/.exec(body.text);
  assert.ok(m, "в имейла няма 6-цифрен код");
  return m[1];
}

const resendOk = () => new Response(JSON.stringify({ id: "email-1" }), { status: 200, headers: { "content-type": "application/json" } });

// ---------------------------------------------------------------------------
// /auth.md
// ---------------------------------------------------------------------------

t("/auth.md се сервира като markdown с H1, съдържащ „auth.md“", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/auth.md");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "text/markdown; charset=utf-8");
  const body = await r.text();
  const h1 = (/^#\s+(.+)$/m.exec(body) || [])[1];
  assert.ok(h1, "липсва H1");
  assert.match(h1, /auth\.md/i);
  assert.match(r.headers.get("link"), /rel="canonical"/);
});

t("манифестът описва трите потока, обхватите и отменянето", () => {
  const doc = authMdDocument({ trustedIssuers: [], emailConfigured: true });
  for (const needle of [ID_JAG_TOKEN_TYPE, "verified_email", "anonymous", AGENT_AUTH_PATHS.register, AGENT_AUTH_PATHS.claim, AGENT_AUTH_PATHS.revoke, "procedures:read", "saved:read", RESOURCE]) {
    assert.ok(doc.includes(needle), `в /auth.md липсва: ${needle}`);
  }
  // Без доверени издатели това трябва да е казано честно, а не премълчано.
  assert.match(doc, /None registered yet/);
  assert.match(authMdDocument({ trustedIssuers: [{ issuer: "https://idp.example", name: "IdP" }] }), /https:\/\/idp\.example/);
});

t("манифестът предупреждава, когато имейлът не е конфигуриран", () => {
  assert.match(authMdDocument({ emailConfigured: false }), /Email delivery is not configured/);
  assert.doesNotMatch(authMdDocument({ emailConfigured: true }), /Email delivery is not configured/);
});

t("/auth.md отказва методи, различни от GET", async () => {
  const r = await call(makeEnv(), "https://euro-funds.eu/auth.md", { method: "PUT" });
  assert.equal(r.status, 405);
});

// ---------------------------------------------------------------------------
// Метаданни: блокът agent_auth
// ---------------------------------------------------------------------------

t("блокът agent_auth е в метаданните на authorization server-а", async () => {
  const env = makeEnv();
  const r = await handleOAuthServer(new Request("https://euro-funds.eu/.well-known/oauth-authorization-server"), env, new URL("https://euro-funds.eu/.well-known/oauth-authorization-server"));
  const m = await r.json();
  const a = m.agent_auth;
  assert.ok(a, "липсва agent_auth");
  for (const f of ["skill", "register_uri", "claim_uri", "revocation_uri", "identity_types_supported", "assertion_types_supported", "credential_types_supported", "events_supported"]) {
    assert.ok(a[f], `липсва agent_auth.${f}`);
  }
  assert.deepEqual(a.identity_types_supported, ["identity_assertion", "anonymous"]);
  assert.ok(a.assertion_types_supported.includes(ID_JAG_TOKEN_TYPE));
  assert.ok(a.assertion_types_supported.includes("verified_email"));
  assert.deepEqual(a.credential_types_supported, ["access_token"]);
  // Всички указатели сочат към нашия произход — агентът не бива да бъде пращан другаде.
  for (const f of ["skill", "register_uri", "claim_uri", "revocation_uri", "token_uri"]) assert.ok(String(a[f]).startsWith(ISSUER), f);
  assert.equal(a.identity_assertion.audience, RESOURCE);
});

t("openid-configuration остава чист OIDC (без agent_auth)", async () => {
  const env = makeEnv();
  const r = await handleOAuthServer(new Request("https://euro-funds.eu/.well-known/openid-configuration"), env, new URL("https://euro-funds.eu/.well-known/openid-configuration"));
  const m = await r.json();
  assert.equal(m.agent_auth, undefined);
});

t("метаданните на защитения ресурс сочат към /auth.md", async () => {
  const env = makeEnv();
  const r = await handleOAuthServer(new Request("https://euro-funds.eu/.well-known/oauth-protected-resource"), env, new URL("https://euro-funds.eu/.well-known/oauth-protected-resource"));
  const m = await r.json();
  assert.equal(m.agent_auth_skill, agentAuthBlock().skill);
  assert.deepEqual(m.bearer_methods_supported, ["header"]);
  assert.ok(Array.isArray(m.authorization_servers) && m.authorization_servers.includes(ISSUER));
});

t("GET /agent/auth е безопасен: описва, но не регистрира", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/agent/auth");
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.method, "POST");
  assert.ok(body.register_uri);
  assert.equal(env.DB.tables.agent_registrations.length, 0, "GET не бива да създава регистрация");
});

// ---------------------------------------------------------------------------
// Поток 3: анонимна регистрация
// ---------------------------------------------------------------------------

t("анонимна регистрация издава креденшъл само за публичните данни", async () => {
  const env = makeEnv();
  const r = await post(env, "/agent/auth", { identity_type: "anonymous", agent: { name: "Тест агент" } });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.credential_type, "access_token");
  assert.equal(body.token_type, "Bearer");
  assert.equal(body.status, "unclaimed");
  assert.equal(body.scope, PUBLIC_AGENT_SCOPES.join(" "));
  assert.ok(body.credential && body.refresh_token && body.registration_id);
  assert.ok(body.claim && body.claim.claim_uri, "трябва да предложи церемония");
  assert.equal(r.headers.get("cache-control"), "no-store");
});

t("анонимен креденшъл се разпознава, но НЕ носи потребител", async () => {
  const env = makeEnv();
  const body = await (await post(env, "/agent/auth", { identity_type: "anonymous" })).json();
  const auth = await authenticateBearer(env, new Request("https://euro-funds.eu/api/projects", { headers: { authorization: `Bearer ${body.credential}` } }));
  assert.ok(auth && !auth.error);
  assert.equal(auth.user, null, "анонимният агент няма потребител");
  assert.ok(auth.agent, "регистрацията се връща");
  assert.deepEqual(auth.scopes, PUBLIC_AGENT_SCOPES);
});

t("непознат identity_type / credential_type се отказва ясно", async () => {
  const env = makeEnv();
  const a = await post(env, "/agent/auth", { identity_type: "magic" });
  assert.equal(a.status, 400);
  assert.equal((await a.json()).error, "unsupported_identity_type");
  const b = await post(env, "/agent/auth", { identity_type: "anonymous", credential_type: "api_key" });
  assert.equal(b.status, 400);
  const bj = await b.json();
  assert.equal(bj.error, "unsupported_credential_type");
  assert.deepEqual(bj.credential_types_supported, ["access_token"]);
});

t("тяло, което не е JSON, се отказва (без да пипа базата)", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/agent/auth", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "invalid_request");
  assert.equal(env.DB.tables.agent_registrations.length, 0);
});

// ---------------------------------------------------------------------------
// Поток 2: потвърден имейл + церемония
// ---------------------------------------------------------------------------

t("регистрация с потвърден имейл пуска церемония и изпраща код", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test_key_1234567890" });
  const net = stubFetch((url) => (url.includes("api.resend.com") ? resendOk() : null));
  try {
    const r = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "Ivan@Example.com", agent: { name: "Тест агент" } });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.status, "unclaimed");
    assert.equal(body.scope, PUBLIC_AGENT_SCOPES.join(" "));
    assert.ok(body.claim.claim_token);
    assert.equal(body.claim.delivered, true);
    assert.equal(body.claim.code_length, 6);
    // Имейлът се връща маскиран, не в пълен вид.
    assert.match(body.claim.email_hint, /^i\*\*\*@example\.com$/);
    const code = codeFromEmail(net.sent);
    assert.equal(code.length, 6);
  } finally { net.restore(); }
});

t("верният код свързва креденшъла с акаунта и разширява обхвата", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test_key_1234567890" });
  const net = stubFetch((url) => (url.includes("api.resend.com") ? resendOk() : null));
  try {
    const reg = await (await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "ivan@example.com" })).json();
    const code = codeFromEmail(net.sent);

    const r = await post(env, "/agent/auth/claim/complete", { claim_token: reg.claim.claim_token, code });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.status, "active");
    assert.equal(body.claimed, true);
    assert.equal(body.subject.sub, "user-1");
    assert.equal(body.scope, LINKED_AGENT_SCOPES.join(" "));

    const auth = await authenticateBearer(env, new Request("https://euro-funds.eu/api/saved-procedures", { headers: { authorization: `Bearer ${body.credential}` } }));
    assert.ok(auth && !auth.error);
    assert.equal(auth.user.id, "user-1");
    assert.ok(auth.scopes.includes("saved:read"));
  } finally { net.restore(); }
});

t("сгрешен код не минава и брои опитите; церемонията не се повтаря", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test_key_1234567890" });
  const net = stubFetch((url) => (url.includes("api.resend.com") ? resendOk() : null));
  try {
    const reg = await (await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "ivan@example.com" })).json();
    const wrong = await post(env, "/agent/auth/claim/complete", { claim_token: reg.claim.claim_token, code: "000000" });
    assert.equal(wrong.status, 400);
    const wj = await wrong.json();
    assert.equal(wj.error, "invalid_code");
    assert.equal(wj.attempts_remaining, 4);
    // Регистрацията остава непотвърдена.
    assert.equal(env.DB.tables.agent_registrations[0].user_id, null);

    const code = codeFromEmail(net.sent);
    const ok1 = await post(env, "/agent/auth/claim/complete", { claim_token: reg.claim.claim_token, code });
    assert.equal(ok1.status, 200);
    const ok2 = await post(env, "/agent/auth/claim/complete", { claim_token: reg.claim.claim_token, code });
    assert.equal(ok2.status, 409, "еднократна церемония");
  } finally { net.restore(); }
});

t("непознат имейл: кодът е верен, но акаунт не се създава", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test_key_1234567890" });
  const net = stubFetch((url) => (url.includes("api.resend.com") ? resendOk() : null));
  try {
    const reg = await (await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "nobody@example.com" })).json();
    const code = codeFromEmail(net.sent);
    const r = await post(env, "/agent/auth/claim/complete", { claim_token: reg.claim.claim_token, code });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, "no_account");
    assert.equal(env.DB.tables.users.length, 1, "не се създават потребители");
  } finally { net.restore(); }
});

t("непроменен имейл: церемонията не може да смени адреса от регистрацията", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test_key_1234567890" });
  const net = stubFetch((url) => (url.includes("api.resend.com") ? resendOk() : null));
  try {
    const reg = await (await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "nobody@example.com" })).json();
    const r = await post(env, "/agent/auth/claim", { registration_id: reg.registration_id, email: "ivan@example.com" });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, "email_mismatch");
  } finally { net.restore(); }
});

t("липсващ имейл доставчик се съобщава честно, не се преструва на успех", async () => {
  const env = makeEnv(); // без RESEND_API_KEY
  const r = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "ivan@example.com" });
  const body = await r.json();
  assert.equal(body.claim.delivered, false);
  assert.equal(body.claim.delivery_error, "email_not_configured");
});

t("невалиден имейл се отказва преди да се пипне базата", async () => {
  const env = makeEnv();
  const r = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "not-an-email" });
  assert.equal(r.status, 400);
  assert.equal(env.DB.tables.agent_registrations.length, 0);
});

// ---------------------------------------------------------------------------
// Поток 1: ID-JAG
// ---------------------------------------------------------------------------

async function idpKeypair(kid = "idp-key-1") {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, jwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y, alg: "ES256", use: "sig", kid }, kid };
}

async function mintIdJag(kp, claims, { alg = "ES256" } = {}) {
  const header = { alg, typ: "oauth-id-jag+jwt", kid: kp.kid };
  const enc = new TextEncoder();
  const payload = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  if (alg === "none") return `${payload}.`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

function trustIssuer(env, kp, issuer = "https://idp.example") {
  env.DB.tables.agent_trusted_issuers.push({
    issuer, name: "Тестов доставчик", jwks_uri: `${issuer}/.well-known/jwks.json`,
    audience: null, scopes: LINKED_AGENT_SCOPES.join(" "), enabled: 1, created_at: "2026-07-29",
  });
  return issuer;
}

const jagClaims = (issuer, over = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return { iss: issuer, sub: "idp-user-42", aud: RESOURCE, jti: "jti-" + Math.random().toString(36).slice(2), iat: now, exp: now + 120, email: "ivan@example.com", email_verified: true, ...over };
};

t("валиден ID-JAG от доверен издател свързва креденшъла веднага", async () => {
  const env = makeEnv();
  const kp = await idpKeypair();
  const issuer = trustIssuer(env, kp);
  const jwks = () => new Response(JSON.stringify({ keys: [kp.jwk] }), { status: 200, headers: { "content-type": "application/jwk-set+json" } });
  const net = stubFetch((url) => (url.includes("jwks") ? jwks() : null));
  try {
    const assertion = await mintIdJag(kp, jagClaims(issuer));
    const r = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion, agent: { name: "Тест агент" } });
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.equal(body.status, "active");
    assert.equal(body.scope, LINKED_AGENT_SCOPES.join(" "));
    assert.equal(body.subject.issuer, issuer);
    assert.equal(body.subject.email, "ivan@example.com");
    assert.equal(body.claim, undefined, "свързан креденшъл не иска церемония");

    const auth = await authenticateBearer(env, new Request("https://euro-funds.eu/api/profile", { headers: { authorization: `Bearer ${body.credential}` } }));
    assert.equal(auth.user.id, "user-1");
  } finally { net.restore(); }
});

t("същият jti не се приема втори път (replay)", async () => {
  const env = makeEnv();
  const kp = await idpKeypair();
  const issuer = trustIssuer(env, kp);
  const net = stubFetch((url) => (url.includes("jwks") ? new Response(JSON.stringify({ keys: [kp.jwk] }), { status: 200 }) : null));
  try {
    const assertion = await mintIdJag(kp, jagClaims(issuer, { jti: "fixed-jti" }));
    assert.equal((await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion })).status, 201);
    const second = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion });
    assert.equal(second.status, 401);
    assert.match((await second.json()).error_description, /already been used/);
  } finally { net.restore(); }
});

t("недоверен издател се отказва (и се казва кои са доверените)", async () => {
  const env = makeEnv();
  const kp = await idpKeypair();
  const assertion = await mintIdJag(kp, jagClaims("https://evil.example"));
  const r = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion });
  assert.equal(r.status, 401);
  const body = await r.json();
  assert.equal(body.error, "invalid_assertion");
  assert.match(body.error_description, /not trusted/);
  assert.deepEqual(body.trusted_issuers, []);
});

t("alg=none и подправен подпис не минават", async () => {
  const env = makeEnv();
  const kp = await idpKeypair();
  const issuer = trustIssuer(env, kp);
  const net = stubFetch((url) => (url.includes("jwks") ? new Response(JSON.stringify({ keys: [kp.jwk] }), { status: 200 }) : null));
  try {
    const none = await mintIdJag(kp, jagClaims(issuer), { alg: "none" });
    assert.equal((await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion: none })).status, 401);

    const good = await mintIdJag(kp, jagClaims(issuer));
    const parts = good.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${b64url(new Uint8Array(64))}`;
    const r = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion: tampered });
    assert.equal(r.status, 401);
    assert.match((await r.json()).error_description, /signature is invalid/);
  } finally { net.restore(); }
});

t("грешен audience и изтекло твърдение не минават", async () => {
  const env = makeEnv();
  const kp = await idpKeypair();
  const issuer = trustIssuer(env, kp);
  const net = stubFetch((url) => (url.includes("jwks") ? new Response(JSON.stringify({ keys: [kp.jwk] }), { status: 200 }) : null));
  try {
    const now = Math.floor(Date.now() / 1000);
    const wrongAud = await mintIdJag(kp, jagClaims(issuer, { aud: "https://other.example/api" }));
    const a = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion: wrongAud });
    assert.equal(a.status, 401);
    assert.match((await a.json()).error_description, /audience/);

    const expired = await mintIdJag(kp, jagClaims(issuer, { iat: now - 600, exp: now - 60 }));
    const b = await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion: expired });
    assert.equal(b.status, 401);
    assert.match((await b.json()).error_description, /expired/);
  } finally { net.restore(); }
});

t("ID-JAG за непознат тук имейл дава непотвърден креденшъл + церемония", async () => {
  const env = makeEnv();
  const kp = await idpKeypair();
  const issuer = trustIssuer(env, kp);
  const net = stubFetch((url) => (url.includes("jwks") ? new Response(JSON.stringify({ keys: [kp.jwk] }), { status: 200 }) : null));
  try {
    const assertion = await mintIdJag(kp, jagClaims(issuer, { email: "nobody@example.com" }));
    const body = await (await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: ID_JAG_TOKEN_TYPE, assertion })).json();
    assert.equal(body.status, "unclaimed");
    assert.equal(body.scope, PUBLIC_AGENT_SCOPES.join(" "));
    assert.equal(body.claim.reason, "no_verified_account_for_this_email");
  } finally { net.restore(); }
});

// ---------------------------------------------------------------------------
// Подновяване и отменяне
// ---------------------------------------------------------------------------

t("refresh токенът се ротира; преизползването гаси регистрацията", async () => {
  const env = makeEnv();
  const first = await (await post(env, "/agent/auth", { identity_type: "anonymous" })).json();
  const second = await (await post(env, "/agent/auth/token", { refresh_token: first.refresh_token })).json();
  assert.ok(second.credential && second.refresh_token !== first.refresh_token);

  const reuse = await post(env, "/agent/auth/token", { refresh_token: first.refresh_token });
  assert.equal(reuse.status, 400);
  assert.equal((await reuse.json()).error, "invalid_grant");
  assert.equal(env.DB.tables.agent_registrations[0].status, "revoked");
});

t("отменянето действа веднага върху вече издадения креденшъл", async () => {
  const env = makeEnv();
  const body = await (await post(env, "/agent/auth", { identity_type: "anonymous" })).json();
  const before = await authenticateBearer(env, new Request("https://euro-funds.eu/api/projects", { headers: { authorization: `Bearer ${body.credential}` } }));
  assert.ok(before && !before.error);

  const r = await post(env, "/agent/auth/revoke", { registration_id: body.registration_id });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).revoked, true);

  const after = await authenticateBearer(env, new Request("https://euro-funds.eu/api/projects", { headers: { authorization: `Bearer ${body.credential}` } }));
  assert.equal(after.error, "invalid_token");
  // Описанието стига до WWW-Authenticate → само ASCII.
  assert.match(after.description, /^[\x20-\x7E]*$/);
});

t("отменяне с Bearer заглавка работи и е идемпотентно", async () => {
  const env = makeEnv();
  const body = await (await post(env, "/agent/auth", { identity_type: "anonymous" })).json();
  const r1 = await post(env, "/agent/auth/revoke", {}, { authorization: `Bearer ${body.credential}` });
  assert.equal(r1.status, 200);
  assert.equal(env.DB.tables.agent_registrations[0].status, "revoked");
  const r2 = await post(env, "/agent/auth/revoke", { registration_id: "не-съществува" });
  assert.equal(r2.status, 200, "RFC 7009: винаги 200");
});

// ---------------------------------------------------------------------------
// Инварианти на сигурността
// ---------------------------------------------------------------------------

t("агентски токен не може сам да си вдигне обхвата", async () => {
  const env = makeEnv();
  const body = await (await post(env, "/agent/auth", { identity_type: "anonymous" })).json();
  const reg = env.DB.tables.agent_registrations[0];
  // Подправен (но валидно подписан от НАС) токен с по-широк обхват.
  const now = Math.floor(Date.now() / 1000);
  const forged = await signJwt(env, {
    typ: "at+jwt",
    claims: { iss: ISSUER, sub: `agent:${reg.id}`, aud: RESOURCE, scope: "saved:read profile:read openid procedures:read", jti: "x", iat: now, nbf: now, exp: now + 600 },
  });
  const auth = await authenticateBearer(env, new Request("https://euro-funds.eu/api/saved-procedures", { headers: { authorization: `Bearer ${forged}` } }));
  assert.deepEqual(auth.scopes, PUBLIC_AGENT_SCOPES, "обхватът идва от регистрацията, не от токена");
  assert.equal(auth.user, null);
  assert.ok(body.credential);
});

t("токен за непозната регистрация е невалиден", async () => {
  const env = makeEnv();
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt(env, { typ: "at+jwt", claims: { iss: ISSUER, sub: "agent:no-such-id", aud: RESOURCE, scope: "procedures:read", jti: "x", iat: now, nbf: now, exp: now + 600 } });
  const auth = await authenticateBearer(env, new Request("https://euro-funds.eu/api/projects", { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(auth.error, "invalid_token");
});

t("анонимните регистрации се ограничават по източник", async () => {
  const env = makeEnv();
  const headers = { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.7" };
  let last;
  for (let i = 0; i < 21; i++) {
    last = await call(env, "https://euro-funds.eu/agent/auth", { method: "POST", headers, body: JSON.stringify({ identity_type: "anonymous" }) });
  }
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error, "rate_limited");
});

t("суровият IP не се записва в дневника (само псевдоним)", async () => {
  const env = makeEnv();
  await call(env, "https://euro-funds.eu/agent/auth", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
    body: JSON.stringify({ identity_type: "anonymous" }),
  });
  const details = env.DB.tables.agent_auth_events.map((e) => String(e.detail || ""));
  assert.ok(details.length);
  for (const d of details) assert.ok(!d.includes("203.0.113.7"), "IP адресът не бива да се записва");
});

t("claim токенът и кодът не се пазят в прав вид", async () => {
  const env = makeEnv({ RESEND_API_KEY: "re_test_key_1234567890" });
  const net = stubFetch((url) => (url.includes("api.resend.com") ? resendOk() : null));
  try {
    const reg = await (await post(env, "/agent/auth", { identity_type: "identity_assertion", assertion_type: "verified_email", email: "ivan@example.com" })).json();
    const code = codeFromEmail(net.sent);
    const row = env.DB.tables.agent_claims[0];
    assert.equal(row.claim_token_hash, await sha256hex(reg.claim.claim_token));
    assert.notEqual(row.otp_hash, code);
    assert.ok(!JSON.stringify(row).includes(code), "кодът не бива да е в базата");
    assert.ok(!JSON.stringify(row).includes(reg.claim.claim_token));
  } finally { net.restore(); }
});

t("непокрит път връща null (не прихваща чужди маршрути)", async () => {
  const env = makeEnv();
  assert.equal(await call(env, "https://euro-funds.eu/procedures"), null);
  assert.equal(await call(env, "https://euro-funds.eu/api/projects"), null);
});

// ---------------------------------------------------------------------------
// Изпълнение (vitest, ако е налично; иначе самостоятелно)
// ---------------------------------------------------------------------------

if (typeof it === "function") {
  for (const [name, fn] of tests) it(name, fn);
} else {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log("ok  - " + name);
    } catch (e) {
      console.log("FAIL - " + name + " \n      " + (e && e.message));
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} passed (auth.md)`);
}
