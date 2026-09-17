// Тестове за слоя „готовност за агенти": markdown negotiation, Link заглавки,
// API каталог, OpenAPI, Content Signals и OAuth 2.1 authorization server
// (пълен поток: authorize → code → token → Bearer → refresh ротация).
//
//   node test/agent-readiness.test.mjs

import assert from "node:assert/strict";

import { wantsMarkdown, estimateTokens, markdownResponse } from "../worker/agent/markdown.js";
import { AGENT_LINKS, agentLinkHeader, withAgentHeaders, apiCatalog, openApiDocument, openApiResponse, robotsTxt, CONTENT_SIGNAL, handleHealth, apiDocsHtml, apiDocsMarkdown } from "../worker/agent/discovery.js";
import {
  handleOAuthServer, authenticateBearer, redirectUriAllowed, requiredScope,
  SUPPORTED_SCOPES, ISSUER, RESOURCE, verifyJwt,
} from "../worker/agent/oauth-server.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const req = (url, init = {}) => new Request(url, init);
const acc = (value) => req("https://euro-funds.eu/", { headers: { Accept: value } });

// ---------------------------------------------------------------------------
// Markdown content negotiation
// ---------------------------------------------------------------------------

t("Accept: text/markdown → markdown", () => {
  assert.equal(wantsMarkdown(acc("text/markdown")), true);
  assert.equal(wantsMarkdown(acc("text/markdown, text/html;q=0.5")), true);
  assert.equal(wantsMarkdown(acc("text/x-markdown")), true);
});

t("браузърски Accept НЕ дава markdown (HTML остава подразбиране)", () => {
  assert.equal(wantsMarkdown(acc("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8")), false);
  assert.equal(wantsMarkdown(acc("*/*")), false);
  assert.equal(wantsMarkdown(req("https://euro-funds.eu/")), false);
});

t("q=0 и по-нисък приоритет от HTML не дават markdown", () => {
  assert.equal(wantsMarkdown(acc("text/markdown;q=0")), false);
  assert.equal(wantsMarkdown(acc("text/html;q=1.0, text/markdown;q=0.3")), false);
  assert.equal(wantsMarkdown(acc("text/html;q=0.3, text/markdown;q=0.9")), true);
});

t("оценката на токени отчита кирилицата", () => {
  assert.equal(estimateTokens(""), 0);
  const cyr = estimateTokens("процедура за финансиране");
  const lat = estimateTokens("procedura za finansirane");
  assert.ok(cyr > lat, "кирилицата се токенизира по-плътно");
  assert.ok(estimateTokens("a".repeat(400)) >= 100);
});

t("markdownResponse има правилните заглавки", () => {
  const r = markdownResponse("# Заглавие\n", { canonicalUrl: "https://euro-funds.eu/" });
  assert.equal(r.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.equal(r.headers.get("vary"), "Accept");
  assert.ok(Number(r.headers.get("x-markdown-tokens")) > 0);
  assert.match(r.headers.get("link"), /rel="canonical"/);
});

// ---------------------------------------------------------------------------
// Link заглавки (RFC 8288)
// ---------------------------------------------------------------------------

t("Link заглавката ползва регистрирани relation типове", () => {
  const registered = new Set(["api-catalog", "service-desc", "service-doc", "status", "describedby", "sitemap", "canonical", "alternate"]);
  for (const l of AGENT_LINKS) assert.ok(registered.has(l.rel), `нерегистриран rel: ${l.rel}`);
  const header = agentLinkHeader();
  assert.match(header, /<https:\/\/euro-funds\.eu\/\.well-known\/api-catalog>; rel="api-catalog"/);
  assert.match(header, /rel="service-desc"/);
  assert.match(header, /rel="service-doc"/);
});

t("HTML отговорите на homepage получават Link + Vary", () => {
  const html = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  const out = withAgentHeaders(html, new URL("https://euro-funds.eu/"));
  const link = out.headers.get("link");
  assert.match(link, /rel="api-catalog"/);
  assert.match(link, /rel="alternate"; type="text\/markdown"/);
  assert.match(out.headers.get("vary"), /Accept/);
});

t("JSON и статичните файлове не се пипат", () => {
  const j = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  assert.equal(withAgentHeaders(j, new URL("https://euro-funds.eu/api/projects")).headers.get("link"), null);
  const asset = new Response("x", { status: 200, headers: { "content-type": "text/html" } });
  assert.equal(withAgentHeaders(asset, new URL("https://euro-funds.eu/_next/static/x.html")).headers.get("link"), null);
});

t("съществуващ Link не се презаписва", () => {
  const html = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html", link: '</a>; rel="preload"' } });
  const out = withAgentHeaders(html, new URL("https://euro-funds.eu/"));
  assert.match(out.headers.get("link"), /rel="preload"/);
  assert.match(out.headers.get("link"), /rel="api-catalog"/);
});

// ---------------------------------------------------------------------------
// API каталог (RFC 9727) + OpenAPI
// ---------------------------------------------------------------------------

t("api-catalog е linkset+json с anchor и трите връзки", async () => {
  const r = apiCatalog();
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^application\/linkset\+json/);
  const body = await r.json();
  assert.ok(Array.isArray(body.linkset) && body.linkset.length >= 1);
  const e = body.linkset[0];
  assert.equal(e.anchor, "https://euro-funds.eu/api");
  for (const rel of ["service-desc", "service-doc", "status"]) {
    assert.ok(Array.isArray(e[rel]) && e[rel][0].href.startsWith("https://"), `липсва ${rel}`);
  }
});

t("OpenAPI документът е 3.1 и описва публичните endpoint-и", () => {
  const doc = openApiDocument("2.47.0");
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(doc.info.version, "2.47.0");
  for (const p of ["/api/health", "/api/projects", "/api/project", "/api/countries", "/api/sources", "/api/changelog"]) {
    assert.ok(doc.paths[p], `липсва път ${p}`);
  }
  const flow = doc.components.securitySchemes.oauth2.flows.authorizationCode;
  assert.equal(flow.authorizationUrl, "https://euro-funds.eu/oauth/authorize");
  assert.equal(flow.tokenUrl, "https://euro-funds.eu/oauth/token");
  for (const s of SUPPORTED_SCOPES) assert.ok(s in flow.scopes, `липсва scope ${s}`);
  // Защитените пътища ИЗИСКВАТ токен.
  assert.deepEqual(doc.paths["/api/saved-procedures"].get.security, [{ oauth2: ["saved:read"] }]);
  assert.ok(JSON.stringify(doc).length > 3000);
});

t("openApiResponse е валиден JSON с правилен content-type", async () => {
  const r = openApiResponse("1.0.0");
  assert.match(r.headers.get("content-type"), /application\/openapi\+json/);
  const parsed = await r.json();
  assert.equal(parsed.openapi, "3.1.0");
});

t("API документацията се сервира като HTML и като markdown", () => {
  const html = apiDocsHtml("2.47.0");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /openapi\.json/);
  assert.match(html, /Accept: text\/markdown/);
  const md = apiDocsMarkdown("2.47.0");
  assert.match(md, /^---/);
  assert.match(md, /# API документация/);
});

// ---------------------------------------------------------------------------
// Content Signals в robots.txt
// ---------------------------------------------------------------------------

t("robots.txt съдържа Content-Signal вътре в User-agent блок", async () => {
  const r = robotsTxt();
  const body = await r.text();
  assert.match(r.headers.get("content-type"), /text\/plain/);
  const lines = body.split("\n").map((l) => l.trim());
  const ua = lines.findIndex((l) => l.toLowerCase() === "user-agent: *");
  const cs = lines.findIndex((l) => l.startsWith("Content-Signal:"));
  assert.ok(ua >= 0 && cs > ua, "Content-Signal трябва да е в блока на User-agent");
  for (const k of ["search=", "ai-input=", "ai-train="]) assert.ok(CONTENT_SIGNAL.includes(k), `липсва ${k}`);
  assert.match(body, /Sitemap: https:\/\/euro-funds\.eu\/sitemap\.xml/);
  // Личните раздели остават затворени, а /.well-known/ — отворен.
  for (const p of ["/admin", "/profile", "/saved", "/api/"]) assert.ok(body.includes(`Disallow: ${p}`), `липсва Disallow ${p}`);
  assert.ok(body.includes("Allow: /.well-known/"));
});

// ---------------------------------------------------------------------------
// Мок на D1 (само заявките, които OAuth слоят ползва)
// ---------------------------------------------------------------------------

function makeDB() {
  const tables = {
    oauth_signing_keys: [], oauth_clients: [], oauth_authorization_codes: [],
    oauth_refresh_tokens: [], oauth_grants: [], users: [], sessions: [],
  };
  const exec = (sql, b, mode) => {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.startsWith("INSERT OR IGNORE INTO oauth_signing_keys")) {
      if (!tables.oauth_signing_keys.some((k) => k.kid === b[0])) {
        tables.oauth_signing_keys.push({ kid: b[0], algorithm: "ES256", public_jwk: b[1], private_jwk_ciphertext: b[2], private_jwk_iv: b[3], status: "active", created_at: b[4] });
      }
      return null;
    }
    if (s.startsWith("SELECT * FROM oauth_signing_keys")) return tables.oauth_signing_keys.filter((k) => k.status === "active")[0] || null;
    if (s.startsWith("SELECT kid, public_jwk FROM oauth_signing_keys")) return tables.oauth_signing_keys.filter((k) => ["active", "retiring"].includes(k.status));

    if (s.startsWith("SELECT * FROM oauth_clients")) return tables.oauth_clients.find((c) => c.client_id === b[0] && c.enabled) || null;

    if (s.startsWith("INSERT INTO oauth_authorization_codes")) {
      tables.oauth_authorization_codes.push({
        code_hash: b[0], client_id: b[1], user_id: b[2], redirect_uri: b[3], scope: b[4],
        code_challenge: b[5], code_challenge_method: "S256", resource: b[6], nonce: b[7],
        expires_at: b[8], consumed_at: null, created_at: b[9],
      });
      return null;
    }
    if (s.startsWith("SELECT * FROM oauth_authorization_codes")) return tables.oauth_authorization_codes.find((c) => c.code_hash === b[0]) || null;
    if (s.startsWith("UPDATE oauth_authorization_codes SET consumed_at")) {
      const row = tables.oauth_authorization_codes.find((c) => c.code_hash === b[1]);
      if (row) row.consumed_at = b[0];
      return null;
    }

    if (s.startsWith("INSERT INTO oauth_refresh_tokens")) {
      tables.oauth_refresh_tokens.push({ token_hash: b[0], client_id: b[1], user_id: b[2], scope: b[3], expires_at: b[4], created_at: b[5], revoked_at: null, rotated_to: null });
      return null;
    }
    if (s.startsWith("SELECT * FROM oauth_refresh_tokens")) return tables.oauth_refresh_tokens.find((r) => r.token_hash === b[0]) || null;
    if (s.startsWith("UPDATE oauth_refresh_tokens SET revoked_at=?1, rotated_to=?2")) {
      const row = tables.oauth_refresh_tokens.find((r) => r.token_hash === b[2]);
      if (row) { row.revoked_at = b[0]; row.rotated_to = b[1]; }
      return null;
    }
    if (s.startsWith("UPDATE oauth_refresh_tokens SET revoked_at=?1 WHERE client_id")) {
      for (const r of tables.oauth_refresh_tokens) if (r.client_id === b[1] && r.user_id === b[2] && !r.revoked_at) r.revoked_at = b[0];
      return null;
    }
    if (s.startsWith("UPDATE oauth_refresh_tokens SET revoked_at=?1 WHERE token_hash")) {
      const row = tables.oauth_refresh_tokens.find((r) => r.token_hash === b[1]);
      if (row && !row.revoked_at) row.revoked_at = b[0];
      return null;
    }

    if (s.startsWith("INSERT INTO oauth_grants")) {
      const ex = tables.oauth_grants.find((g) => g.user_id === b[1] && g.client_id === b[2]);
      if (ex) ex.scope = b[3];
      else tables.oauth_grants.push({ id: b[0], user_id: b[1], client_id: b[2], scope: b[3], created_at: b[4] });
      return null;
    }
    if (s.startsWith("SELECT scope FROM oauth_grants")) return tables.oauth_grants.find((g) => g.user_id === b[0] && g.client_id === b[1]) || null;

    if (s.startsWith("SELECT id, email") && s.includes("FROM users")) return tables.users.find((u) => u.id === b[0]) || null;
    if (s.startsWith("SELECT * FROM sessions")) return tables.sessions.find((x) => x.session_token_hash === b[0]) || null;
    if (s.startsWith("UPDATE sessions SET last_used_at")) return null;
    if (s.startsWith("DELETE FROM sessions")) return null;

    throw new Error("непокрита заявка в мока: " + s.slice(0, 90));
  };
  return {
    tables,
    prepare(sql) {
      let binds = [];
      const stmt = {
        bind(...a) { binds = a; return stmt; },
        async first() { return exec(sql, binds, "first"); },
        async all() { const r = exec(sql, binds, "all"); return { results: Array.isArray(r) ? r : (r ? [r] : []) }; },
        async run() { return exec(sql, binds, "run"); },
      };
      return stmt;
    },
  };
}

function makeEnv() {
  const DB = makeDB();
  DB.tables.users.push({ id: "user-1", email: "ivan@example.com", email_verified: 1, display_name: "Иван", avatar_url: null, locale: "bg", role: "user", created_at: "2026-01-01", last_login_at: "2026-07-26" });
  DB.tables.oauth_clients.push({
    client_id: "euro-funding-agent", client_name: "AI агент (локален)", client_type: "public",
    redirect_uris: JSON.stringify(["http://127.0.0.1/callback"]), allow_loopback: 1,
    scopes: "openid profile:read saved:read", enabled: 1,
  });
  return {
    DB,
    AUTH_SECRET: "test-auth-secret-0123456789abcdef",
    AI_CREDENTIALS_MASTER_KEY: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64"),
    APP_URL: "https://euro-funds.eu",
  };
}

async function pkce() {
  const verifier = "verifier-" + "a".repeat(50);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = Buffer.from(digest).toString("base64url");
  return { verifier, challenge };
}

const call = (env, url, init) => handleOAuthServer(new Request(url, init), env, new URL(url));

// ---------------------------------------------------------------------------
// OAuth: метаданни
// ---------------------------------------------------------------------------

t("метаданните на authorization server-а имат задължителните полета", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/.well-known/oauth-authorization-server");
  const m = await r.json();
  for (const f of ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri", "grant_types_supported", "response_types_supported"]) {
    assert.ok(m[f], `липсва ${f}`);
  }
  assert.equal(m.issuer, ISSUER);
  assert.ok(m.issuer.startsWith("https://"));
  // Всеки endpoint трябва да е под същия issuer (иначе агентите не му вярват).
  for (const f of ["authorization_endpoint", "token_endpoint", "jwks_uri"]) assert.ok(m[f].startsWith(ISSUER), f);
  assert.deepEqual(m.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(m.grant_types_supported, ["authorization_code", "refresh_token"]);
  assert.ok(!m.grant_types_supported.includes("implicit"));
  assert.ok(!m.registration_endpoint, "динамична регистрация не се поддържа");
});

t("openid-configuration покрива OIDC полетата", async () => {
  const env = makeEnv();
  const m = await (await call(env, "https://euro-funds.eu/.well-known/openid-configuration")).json();
  assert.equal(m.userinfo_endpoint, "https://euro-funds.eu/oauth/userinfo");
  assert.deepEqual(m.id_token_signing_alg_values_supported, ["ES256"]);
  assert.ok(m.claims_supported.includes("email"));
  assert.ok(m.scopes_supported.includes("openid"));
});

t("метаданните на защитения ресурс сочат към нашия AS", async () => {
  const env = makeEnv();
  const m = await (await call(env, "https://euro-funds.eu/.well-known/oauth-protected-resource")).json();
  assert.equal(m.resource, RESOURCE);
  assert.deepEqual(m.authorization_servers, [ISSUER]);
  assert.deepEqual(m.bearer_methods_supported, ["header"]);
});

t("JWKS публикува ES256 ключ и НЕ изтича частния", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/.well-known/jwks.json");
  const body = await r.json();
  assert.equal(body.keys.length, 1);
  const k = body.keys[0];
  assert.equal(k.kty, "EC");
  assert.equal(k.crv, "P-256");
  assert.equal(k.alg, "ES256");
  assert.ok(k.kid && k.x && k.y);
  assert.ok(!("d" in k), "частният ключ НЕ бива да се публикува");
  // В базата частният ключ е криптиран, не в чист вид.
  const stored = env.DB.tables.oauth_signing_keys[0];
  assert.ok(!stored.private_jwk_ciphertext.includes('"d"'));
});

// ---------------------------------------------------------------------------
// OAuth: redirect_uri, scope, PKCE
// ---------------------------------------------------------------------------

t("redirect_uri: точно съвпадение или loopback с произволен порт", () => {
  const c = { redirect_uris: ["https://app.example.com/cb"], allow_loopback: 1 };
  assert.equal(redirectUriAllowed(c, "https://app.example.com/cb"), true);
  assert.equal(redirectUriAllowed(c, "https://app.example.com/cb2"), false);
  assert.equal(redirectUriAllowed(c, "http://127.0.0.1:53821/callback"), true);
  assert.equal(redirectUriAllowed(c, "http://localhost:8080/x"), true);
  assert.equal(redirectUriAllowed(c, "https://evil.example.com/"), false);
  const strict = { redirect_uris: ["https://app.example.com/cb"], allow_loopback: 0 };
  assert.equal(redirectUriAllowed(strict, "http://127.0.0.1:9/callback"), false);
});

t("непознат client_id → HTML грешка, БЕЗ пренасочване", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/oauth/authorize?response_type=code&client_id=nope&redirect_uri=https://evil.example.com/");
  assert.equal(r.status, 400);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.equal(r.headers.get("location"), null);
});

t("подправен redirect_uri не получава пренасочване", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/oauth/authorize?response_type=code&client_id=euro-funding-agent&redirect_uri=https://evil.example.com/");
  assert.equal(r.status, 400);
  assert.equal(r.headers.get("location"), null);
});

t("липсващо PKCE → грешка към клиента", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/oauth/authorize?response_type=code&client_id=euro-funding-agent&redirect_uri=" + encodeURIComponent("http://127.0.0.1:5000/callback") + "&scope=openid&state=xyz");
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get("location"));
  assert.equal(loc.searchParams.get("error"), "invalid_request");
  assert.equal(loc.searchParams.get("state"), "xyz");
});

t("plain PKCE се отхвърля (само S256)", async () => {
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/oauth/authorize?response_type=code&client_id=euro-funding-agent&redirect_uri=" + encodeURIComponent("http://127.0.0.1:5000/callback") + "&scope=openid&code_challenge=abc&code_challenge_method=plain");
  assert.equal(new URL(r.headers.get("location")).searchParams.get("error"), "invalid_request");
});

t("невалиден scope → invalid_scope", async () => {
  const env = makeEnv();
  const { challenge } = await pkce();
  const r = await call(env, `https://euro-funds.eu/oauth/authorize?response_type=code&client_id=euro-funding-agent&redirect_uri=${encodeURIComponent("http://127.0.0.1:5000/callback")}&scope=admin:write&code_challenge=${challenge}&code_challenge_method=S256`);
  assert.equal(new URL(r.headers.get("location")).searchParams.get("error"), "invalid_scope");
});

t("без сесия → пренасочване към Google входа с returnTo", async () => {
  const env = makeEnv();
  const { challenge } = await pkce();
  const r = await call(env, `https://euro-funds.eu/oauth/authorize?response_type=code&client_id=euro-funding-agent&redirect_uri=${encodeURIComponent("http://127.0.0.1:5000/callback")}&scope=openid&code_challenge=${challenge}&code_challenge_method=S256`);
  assert.equal(r.status, 302);
  const loc = r.headers.get("location");
  assert.ok(loc.startsWith("/api/auth/google?returnTo="));
  assert.match(decodeURIComponent(loc.split("returnTo=")[1]), /^\/oauth\/authorize\?/);
});

// ---------------------------------------------------------------------------
// OAuth: пълен поток
// ---------------------------------------------------------------------------

async function authenticatedFlow(env, { scope = "openid profile:read saved:read" } = {}) {
  // Сесия в браузъра (както след Google вход).
  const { hashSessionToken } = await import("../worker/util.js");
  const token = "session-token-test";
  env.DB.tables.sessions.push({
    id: "sess-1", user_id: "user-1",
    session_token_hash: await hashSessionToken(env.AUTH_SECRET, token),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
  const cookie = `evp_session=${token}`;
  const { verifier, challenge } = await pkce();
  const redirectUri = "http://127.0.0.1:5000/callback";
  const qs = `response_type=code&client_id=euro-funding-agent&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=st-1&code_challenge=${challenge}&code_challenge_method=S256`;

  // 1) GET → страница за съгласие
  const consent = await call(env, `https://euro-funds.eu/oauth/authorize?${qs}`, { headers: { cookie } });
  assert.equal(consent.status, 200);
  const html = await consent.text();
  assert.match(html, /иска достъп/);
  assert.match(html, /ivan@example\.com/);
  const consentToken = /name="consent_token" value="([^"]+)"/.exec(html)[1];

  // 2) POST approve → код
  const form = new URLSearchParams({
    response_type: "code", client_id: "euro-funding-agent", redirect_uri: redirectUri,
    scope, state: "st-1", code_challenge: challenge, code_challenge_method: "S256",
    consent_token: consentToken, action: "approve",
  });
  const approved = await call(env, "https://euro-funds.eu/oauth/authorize", {
    method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: form.toString(),
  });
  assert.equal(approved.status, 302);
  const back = new URL(approved.headers.get("location"));
  assert.equal(back.origin + back.pathname, redirectUri);
  assert.equal(back.searchParams.get("state"), "st-1");
  return { code: back.searchParams.get("code"), verifier, redirectUri, cookie, challenge, consentToken, scope };
}

async function exchange(env, { code, verifier, redirectUri }) {
  return call(env, "https://euro-funds.eu/oauth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: "euro-funding-agent", code, code_verifier: verifier, redirect_uri: redirectUri }).toString(),
  });
}

t("пълен поток: съгласие → код → токен → Bearer проверка", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  assert.ok(flow.code);

  const res = await exchange(env, flow);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /no-store/);
  const body = await res.json();
  assert.equal(body.token_type, "Bearer");
  assert.equal(body.expires_in, 3600);
  assert.ok(body.access_token && body.refresh_token && body.id_token);
  assert.equal(body.scope, flow.scope);

  // Access токенът е валиден JWT (RFC 9068) с правилен issuer/audience.
  const claims = await verifyJwt(env, body.access_token, { audience: RESOURCE });
  assert.equal(claims.iss, ISSUER);
  assert.equal(claims.sub, "user-1");
  assert.equal(claims.client_id, "euro-funding-agent");
  assert.ok(claims.exp - claims.iat === 3600);

  // Bearer автентикацията връща потребителя и обхватите.
  const auth = await authenticateBearer(env, new Request("https://euro-funds.eu/api/profile", { headers: { authorization: `Bearer ${body.access_token}` } }));
  assert.equal(auth.user.id, "user-1");
  assert.ok(auth.scopes.includes("profile:read"));

  // id_token-ът е за клиента, не за ресурса.
  const idClaims = await verifyJwt(env, body.id_token);
  assert.equal(idClaims.aud, "euro-funding-agent");
  assert.equal(idClaims.email, "ivan@example.com");
});

t("кодът е еднократен — повторна размяна гаси цялата верига", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const first = await (await exchange(env, flow)).json();
  const second = await exchange(env, flow);
  assert.equal(second.status, 400);
  assert.equal((await second.json()).error, "invalid_grant");
  // Издаденият refresh токен е отменен (защита при кражба на код).
  const rt = env.DB.tables.oauth_refresh_tokens.find((r) => r.user_id === "user-1");
  assert.ok(rt.revoked_at, "refresh токенът трябва да е отменен");
  assert.ok(first.access_token);
});

t("грешен code_verifier не разменя кода", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const bad = await exchange(env, { ...flow, verifier: "wrong-verifier-" + "b".repeat(40) });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "invalid_grant");
});

t("несъвпадащ redirect_uri при размяна се отхвърля", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const bad = await exchange(env, { ...flow, redirectUri: "http://127.0.0.1:5000/other" });
  assert.equal((await bad.json()).error, "invalid_grant");
});

t("отказът на потребителя връща access_denied", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const form = new URLSearchParams({
    response_type: "code", client_id: "euro-funding-agent", redirect_uri: flow.redirectUri,
    scope: flow.scope, state: "st-1", code_challenge: flow.challenge, code_challenge_method: "S256",
    consent_token: flow.consentToken, action: "deny",
  });
  const r = await call(env, "https://euro-funds.eu/oauth/authorize", {
    method: "POST", headers: { cookie: flow.cookie, "content-type": "application/x-www-form-urlencoded" }, body: form.toString(),
  });
  assert.equal(new URL(r.headers.get("location")).searchParams.get("error"), "access_denied");
});

t("подправен consent_token (CSRF) се отхвърля", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const form = new URLSearchParams({
    response_type: "code", client_id: "euro-funding-agent", redirect_uri: flow.redirectUri,
    scope: flow.scope, state: "st-1", code_challenge: flow.challenge, code_challenge_method: "S256",
    consent_token: "x".repeat(64), action: "approve",
  });
  const r = await call(env, "https://euro-funds.eu/oauth/authorize", {
    method: "POST", headers: { cookie: flow.cookie, "content-type": "application/x-www-form-urlencoded" }, body: form.toString(),
  });
  assert.equal(r.status, 400);
  assert.equal(r.headers.get("location"), null);
});

t("refresh токенът се ротира и не може да се преизползва", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const first = await (await exchange(env, flow)).json();

  const refresh = (token) => call(env, "https://euro-funds.eu/oauth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: "euro-funding-agent", refresh_token: token }).toString(),
  });

  const second = await (await refresh(first.refresh_token)).json();
  assert.ok(second.access_token);
  assert.notEqual(second.refresh_token, first.refresh_token, "токенът трябва да се ротира");

  const replay = await refresh(first.refresh_token);
  assert.equal((await replay.json()).error, "invalid_grant");
  // След преизползване цялата верига е отменена.
  const live = env.DB.tables.oauth_refresh_tokens.filter((r) => !r.revoked_at);
  assert.equal(live.length, 0);
});

t("обхватът не може да се разширява при refresh", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env, { scope: "openid" });
  const first = await (await exchange(env, flow)).json();
  const r = await call(env, "https://euro-funds.eu/oauth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: "euro-funding-agent", refresh_token: first.refresh_token, scope: "openid saved:read" }).toString(),
  });
  assert.equal((await r.json()).error, "invalid_scope");
});

t("второто разрешение за същите права минава без нов въпрос", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const { challenge } = await pkce();
  const qs = `response_type=code&client_id=euro-funding-agent&redirect_uri=${encodeURIComponent(flow.redirectUri)}&scope=${encodeURIComponent(flow.scope)}&state=st-2&code_challenge=${challenge}&code_challenge_method=S256`;
  const r = await call(env, `https://euro-funds.eu/oauth/authorize?${qs}`, { headers: { cookie: flow.cookie } });
  assert.equal(r.status, 302);
  assert.ok(new URL(r.headers.get("location")).searchParams.get("code"));
});

// ---------------------------------------------------------------------------
// OAuth: сигурност на токените
// ---------------------------------------------------------------------------

t("невалиден/подправен токен не минава", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const body = await (await exchange(env, flow)).json();
  const tampered = body.access_token.slice(0, -4) + "AAAA";
  const r = await authenticateBearer(env, new Request("https://euro-funds.eu/api/profile", { headers: { authorization: `Bearer ${tampered}` } }));
  assert.equal(r.error, "invalid_token");
  assert.equal(await authenticateBearer(env, new Request("https://euro-funds.eu/api/profile")), null);
  const junk = await authenticateBearer(env, new Request("https://euro-funds.eu/api/profile", { headers: { authorization: "Bearer not.a.jwt" } }));
  assert.equal(junk.error, "invalid_token");
});

t("alg=none / HS256 не се приема", async () => {
  const env = makeEnv();
  await call(env, "https://euro-funds.eu/.well-known/jwks.json"); // създава ключа
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: ISSUER, sub: "user-1", aud: RESOURCE, scope: "profile:read", exp: now + 3600, iat: now };
  for (const alg of ["none", "HS256"]) {
    const forged = `${enc({ alg, typ: "JWT" })}.${enc(claims)}.`;
    const r = await authenticateBearer(env, new Request("https://euro-funds.eu/api/profile", { headers: { authorization: `Bearer ${forged}` } }));
    assert.equal(r.error, "invalid_token", `alg=${alg} трябва да се отхвърли`);
  }
});

t("токен за друг ресурс (audience) не минава", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const body = await (await exchange(env, flow)).json();
  await assert.rejects(() => verifyJwt(env, body.access_token, { audience: "https://other.example.com/api" }), /bad_audience/);
});

t("изтрит потребител прави токена невалиден веднага", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const body = await (await exchange(env, flow)).json();
  env.DB.tables.users.length = 0;
  const r = await authenticateBearer(env, new Request("https://euro-funds.eu/api/profile", { headers: { authorization: `Bearer ${body.access_token}` } }));
  assert.equal(r.error, "invalid_token");
});

t("обхватите покриват само четящи endpoint-и", () => {
  assert.equal(requiredScope("/api/profile"), "profile:read");
  assert.equal(requiredScope("/api/preferences"), "profile:read");
  assert.equal(requiredScope("/api/saved-procedures"), "saved:read");
  assert.equal(requiredScope("/api/auth/me"), "openid");
  // Администрация и изтриване на акаунт НИКОГА не са достъпни с токен.
  assert.equal(requiredScope("/api/admin/users"), null);
  assert.equal(requiredScope("/api/admin/ai/models"), null);
  assert.equal(requiredScope("/api/account"), null);
});

t("userinfo изисква обхват openid", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env, { scope: "saved:read" });
  const body = await (await exchange(env, flow)).json();
  const r = await call(env, "https://euro-funds.eu/oauth/userinfo", { headers: { authorization: `Bearer ${body.access_token}` } });
  assert.equal(r.status, 403);
  assert.match(r.headers.get("www-authenticate"), /insufficient_scope/);

  const env2 = makeEnv();
  const f2 = await authenticatedFlow(env2, { scope: "openid" });
  const b2 = await (await exchange(env2, f2)).json();
  const ok = await call(env2, "https://euro-funds.eu/oauth/userinfo", { headers: { authorization: `Bearer ${b2.access_token}` } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).email, "ivan@example.com");
});

t("revoke винаги връща 200 и гаси токена (RFC 7009)", async () => {
  const env = makeEnv();
  const flow = await authenticatedFlow(env);
  const body = await (await exchange(env, flow)).json();
  const r = await call(env, "https://euro-funds.eu/oauth/revoke", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: body.refresh_token }).toString(),
  });
  assert.equal(r.status, 200);
  assert.ok(env.DB.tables.oauth_refresh_tokens[0].revoked_at);
  const unknown = await call(env, "https://euro-funds.eu/oauth/revoke", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: "непознат" }).toString(),
  });
  assert.equal(unknown.status, 200);
});

t("WWW-Authenticate е ASCII (заглавките не приемат кирилица)", async () => {
  const { wwwAuthenticate } = await import("../worker/agent/oauth-server.js");
  const header = wwwAuthenticate("invalid_token", "Токенът е невалиден \"навсякъде\"");
  assert.ok(/^[\x20-\x7E]*$/.test(header), "заглавката трябва да е ASCII");
  // Задължителна проверка: реален Response с тази заглавка не хвърля.
  assert.doesNotThrow(() => new Response(null, { status: 401, headers: { "www-authenticate": header } }));
  const env = makeEnv();
  const r = await call(env, "https://euro-funds.eu/oauth/userinfo", { headers: { authorization: "Bearer bad.token.here" } });
  assert.equal(r.status, 401);
  assert.ok(/^[\x20-\x7E]*$/.test(r.headers.get("www-authenticate")));
});

t("HEAD минава по същия път като GET и се връща без тяло (регресия)", async () => {
  const { asGetRequest, stripBodyForHead, apiCatalog, openApiResponse, robotsTxt } = await import("../worker/agent/discovery.js");
  const env = makeEnv();

  // 1) HEAD се нормализира до GET, за да не пада към статиката (беше 404).
  const url = new URL("https://euro-funds.eu/.well-known/api-catalog");
  const head = new Request(url, { method: "HEAD" });
  assert.equal(asGetRequest(head, url).method, "GET");
  assert.equal(asGetRequest(new Request(url), url).method, "GET", "GET остава непроменен");

  // 2) Заглавките са идентични с GET, тялото е празно — за всички machine-readable маршрути.
  const producers = [
    ["api-catalog", () => apiCatalog()],
    ["openapi", () => openApiResponse("2.48.0")],
    ["robots", () => robotsTxt()],
    ["oauth-metadata", async () => handleOAuthServer(new Request("https://euro-funds.eu/.well-known/oauth-authorization-server"), env, new URL("https://euro-funds.eu/.well-known/oauth-authorization-server"))],
    ["jwks", async () => handleOAuthServer(new Request("https://euro-funds.eu/.well-known/jwks.json"), env, new URL("https://euro-funds.eu/.well-known/jwks.json"))],
  ];
  for (const [name, make] of producers) {
    const g = await make();
    const h = stripBodyForHead(await make(), true);
    assert.ok(g && g.status === 200, `${name}: GET не върна 200`);
    assert.equal(h.status, g.status, `${name}: различен статус`);
    assert.equal(h.headers.get("content-type"), g.headers.get("content-type"), `${name}: различен тип`);
    assert.equal(await h.text(), "", `${name}: HEAD не бива да има тяло`);
    assert.ok((await g.text()).length > 0, `${name}: GET трябва да има тяло`);
  }

  // 3) Не-HEAD отговорите остават непокътнати.
  assert.equal(await stripBodyForHead(new Response("данни", { status: 200 }), false).text(), "данни");
});

t("непокрит път връща null (не прихваща чужди маршрути)", async () => {
  const env = makeEnv();
  assert.equal(await call(env, "https://euro-funds.eu/procedures"), null);
  assert.equal(await call(env, "https://euro-funds.eu/api/projects"), null);
});

// ---------------------------------------------------------------------------
// Markdown съдържание от D1 (истинските данни, не празен SPA shell)
// ---------------------------------------------------------------------------

const PROJECTS = [
  { id: "bg16rfpr002-1.014", name: "Подкрепа за иновации в МСП", program: "Конкурентоспособност", status: "open", deadline: "30.09.2026", deadline_date: "2026-09-30", country_code: "BG", budget: "50 000 000 лв.", budget_amount_eur: 25564594, budget_currency: "BGN", eligible: "Микро, малки и средни предприятия", priority: "Приоритет 1", notes: "Изисква се съфинансиране 40%.", official_url: "https://eufunds.bg/x", link: "https://eufunds.bg/x", managing_authority: "МИР", first_seen: "2026-06-01", last_updated: "2026-07-20" },
  { id: "bg05sfpr002-2.007", name: "Младежка заетост 2026", program: "Развитие на човешките ресурси", status: "upcoming", deadline: "15.11.2026", deadline_date: "2026-11-15", country_code: "BG", budget: null, eligible: "Работодатели", category: "youth" },
];
const DOCS = [{ title: "Условия за кандидатстване", doc_type: "Насоки", content: "## Кратко резюме\n\nБюджетът е 50 млн. лв.", source_url: "https://eufunds.bg/doc.pdf" }];

function markdownEnv() {
  for(const p of PROJECTS) p.public_slug=p.id.replaceAll(".","-");
  const q = (sql, b) => {
    const s = sql.replace(/\s+/g, " ").replaceAll("FROM public_projects", "FROM projects");
    if(s.includes("public_slug IS NULL")) return [];
    if(s.includes("WHERE public_slug =")) return PROJECTS.find(p=>p.public_slug===b[0]) || null;
    if (s.includes("MAX(snapshot_date)")) return { d: "2026-07-25" };
    if (s.includes("FROM country_daily_statistics s JOIN countries c")) {
      return [{ country_code: "BG", total_procedures: 42, active_procedures: 18, upcoming_procedures: 5, published_budget_eur: 1234567, budget_procedure_count: 12, name_bg: "България", english_name: "Bulgaria", slug: "bulgaria" }];
    }
    if (s.includes("FROM documents")) return DOCS;
    if (s.startsWith("SELECT * FROM projects WHERE id")) return PROJECTS.find((p) => p.id === b[0]) || null;
    if (s.startsWith("SELECT id FROM projects")) return PROJECTS.map((p) => ({ id: p.id }));
    if (s.includes("FROM projects")) return PROJECTS;
    if (s.includes("FROM funding_sources")) return [{ name: "ИСУН 2020", authority_name: "МС", source_level: "national", base_url: "https://eumis2020.government.bg", calls_url: null, verified: 1, source_health: "healthy" }];
    if (s.includes("FROM changelog_entries")) return [{ version: "2.47.0", title: "Готовност за агенти", summary: "Ново", category: "feature", published_at: "2026-07-26", affected_route: "/", content: '["Първо","Второ"]' }];
    return [];
  };
  const prepare = (sql) => {
    let binds = [];
    const stmt = {
      bind(...a) { binds = a; return stmt; },
      async first() { const r = q(sql, binds); return Array.isArray(r) ? (r[0] || null) : r; },
      async all() { const r = q(sql, binds); return { results: Array.isArray(r) ? r : (r ? [r] : []) }; },
      async run() { return null; },
    };
    return stmt;
  };
  return { DB: { prepare } };
}

const mdGet = (path, headers = { Accept: "text/markdown" }) => {
  const u = new URL("https://euro-funds.eu" + path);
  return { request: new Request(u, { headers }), url: u };
};

t("markdown-ът на началната страница носи реални данни от D1", async () => {
  const { handleMarkdown } = await import("../worker/agent/markdown.js");
  const { request, url } = mdGet("/");
  const r = await handleMarkdown(request, markdownEnv(), url, { defaultCountry: "BG" });
  assert.equal(r.headers.get("content-type"), "text/markdown; charset=utf-8");
  const body = await r.text();
  assert.match(body, /^---\n/, "YAML frontmatter");
  assert.match(body, /title:/);
  assert.match(body, /# Euro-Funding/);
  assert.match(body, /България \(BG\)/);
  assert.match(body, /Подкрепа за иновации в МСП/);
  assert.match(body, /2026-07-25/);
  assert.match(body, /## За агенти/);
  assert.match(body, /openapi\.json/);
  assert.ok(Number(r.headers.get("x-markdown-tokens")) > 50);
});

t("детайлът на процедурата включва документите и източника", async () => {
  const { handleMarkdown } = await import("../worker/agent/markdown.js");
  const { request, url } = mdGet("/procedures/bg16rfpr002-1-014");
  const body = await (await handleMarkdown(request, markdownEnv(), url, { defaultCountry: "BG" })).text();
  assert.match(body, /# Подкрепа за иновации в МСП/);
  assert.match(body, /Микро, малки и средни предприятия/);
  assert.match(body, /## Документи \(1\)/);
  assert.match(body, /Кратко резюме/);
  assert.match(body, /https:\/\/eufunds\.bg\/doc\.pdf/);
  assert.match(body, /api\/project\?id=/);
});

t("непозната процедура → null (нормалният 404 остава)", async () => {
  const { handleMarkdown } = await import("../worker/agent/markdown.js");
  const { request, url } = mdGet("/procedures/няма-такава");
  assert.equal(await handleMarkdown(request, markdownEnv(), url, { defaultCountry: "BG" }), null);
});

t("езиковият префикс не чупи markdown маршрутите", async () => {
  const { handleMarkdown } = await import("../worker/agent/markdown.js");
  for (const p of ["/en", "/bg/procedures", "/de/about"]) {
    const { request, url } = mdGet(p);
    const r = await handleMarkdown(request, markdownEnv(), url, { defaultCountry: "BG" });
    assert.ok(r, `липсва markdown за ${p}`);
    assert.match(r.headers.get("content-type"), /text\/markdown/);
  }
});

t("тръбите в данните не чупят markdown таблиците", async () => {
  const { handleMarkdown } = await import("../worker/agent/markdown.js");
  const env = markdownEnv();
  const orig = env.DB.prepare;
  env.DB.prepare = (sql) => {
    const st = orig(sql);
    const all = st.all;
    st.all = async () => {
      const r = await all();
      return { results: r.results.map((x) => (x && x.name ? { ...x, name: String(x.name).replace("Подкрепа", "Под|крепа") } : x)) };
    };
    return st;
  };
  const { request, url } = mdGet("/procedures");
  const body = await (await handleMarkdown(request, env, url, { defaultCountry: "BG" })).text();
  assert.match(body, /Под\\\|крепа/, "тръбата трябва да е екранирана");
  for (const line of body.split("\n").filter((l) => l.startsWith("| ["))) {
    const cells = line.split(/(?<!\\)\|/).length - 2;
    assert.equal(cells, 5, "редът трябва да има точно 5 колони: " + line.slice(0, 60));
  }
});

t("llms.txt е валидна карта на съдържанието", async () => {
  const { llmsTxt } = await import("../worker/agent/markdown.js");
  const body = await llmsTxt(markdownEnv());
  assert.match(body, /^# Euro-Funding/);
  assert.match(body, /^> /m, "нужно е резюме с blockquote (llmstxt.org)");
  assert.match(body, /## API/);
  assert.match(body, /openapi\.json/);
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

t("/api/health отчита състоянието на базата", async () => {
  const okEnv = { DB: { prepare: () => ({ first: async () => ({ p: 42, c: 26, s: "2026-07-25" }) }) } };
  const r = await handleHealth(okEnv, "2.47.0");
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.status, "pass");
  assert.equal(b.version, "2.47.0");
  assert.equal(b.procedures, 42);
  assert.equal(b.dataSnapshot, "2026-07-25");

  const badEnv = { DB: { prepare: () => ({ first: async () => { throw new Error("db down"); } }) } };
  const bad = await handleHealth(badEnv, "2.47.0");
  assert.equal(bad.status, 503);
  assert.equal((await bad.json()).status, "fail");
});

// ---------------------------------------------------------------------------
// Пускане
// ---------------------------------------------------------------------------

// Под vitest (globals: true) `it` е глобален → всеки опашкуван тест се регистрира
// като истински тест (правилно отчитане в CI). Без vitest (директно с `node`) пада
// на ръчния изпълнител по-долу.
if (typeof it === "function") {
  for (const [name, fn] of tests) it(name, fn);
} else {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log("ok  -", name);
    } catch (e) {
      console.error("FAIL -", name, "\n     ", e.message);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} passed (agent-readiness)`);
}
