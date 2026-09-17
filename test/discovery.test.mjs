// Тестове за валидационния слой на администрацията („API & Agents" и
// „SEO & Discovery"): парсери, класификация на маршрути, сравнение с OpenAPI,
// редакция на тайни, дедупликация на сигнали и пълен одит срещу мокнат сайт.
//
//   node test/discovery.test.mjs

import assert from "node:assert/strict";

import {
  analyseMarkdown, analyseSitemap, detectLeakage, duplicateLinks, extractJsonLd, extractMetadata,
  groupForAgent, isValidHreflang, parseContentSignal, parseLinkHeader, parseRobots, parseSitemap,
  redactObject, redactText, robotsAllows, safeBodyPreview, validateJsonLd, REDACTED,
} from "../worker/discovery/parsers.js";
import {
  ROUTES, compareOpenApiWithRouter, documentedRoutes, internalRoutes, isNeverPublic,
  publicRoutes, protectedRoutes,
} from "../worker/discovery/inventory.js";
import { GROUPS, STATUS, buildPlan, executeCheck } from "../worker/discovery/validation.js";
import { SCOPE_GROUPS, makeFetchImpl, runInScope } from "../worker/discovery/handlers.js";
import { indexChecks } from "../app/admin/discovery-index.js";
import { codeSlug } from "../app/lib/slug.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

// ===========================================================================
// Класификация на маршрути
// ===========================================================================

t("маршрутите са класифицирани и няма дублирани идентификатори", () => {
  const ids = ROUTES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "дублиран route id");
  for (const r of ROUTES) assert.ok(["public", "protected", "internal"].includes(r.kind), r.id);
  assert.ok(publicRoutes().length > 5);
  assert.ok(internalRoutes().length > 5);
});

t("вътрешните и админ маршрутите НИКОГА не се документират", () => {
  for (const r of internalRoutes()) {
    assert.equal(r.openapi, false, `${r.path} не бива да е в OpenAPI`);
    assert.equal(r.probe == null, true, `${r.path} не бива да има проба`);
  }
  for (const r of documentedRoutes()) {
    assert.equal(isNeverPublic(r.path), false, `${r.path} е частен, но е маркиран за документиране`);
  }
});

t("isNeverPublic хваща админ/вътрешните пътища", () => {
  for (const p of ["/api/admin/users", "/api/internal/ai/x", "/admin", "/profile", "/saved", "/login"]) {
    assert.equal(isNeverPublic(p), true, p);
  }
  for (const p of ["/api/projects", "/procedures/x", "/openapi.json", "/"]) {
    assert.equal(isNeverPublic(p), false, p);
  }
});

t("защитените маршрути обявяват как се достъпват", () => {
  for (const r of protectedRoutes()) assert.ok(r.auth && r.auth !== "none", r.id);
});

// ===========================================================================
// Сравнение с OpenAPI
// ===========================================================================

t("сравнението открива недокументирани и излишни операции", () => {
  const doc = {
    paths: {
      "/api/health": { get: { operationId: "getHealth" } },
      "/api/projects": { get: { operationId: "listProjects" } },
      "/api/does-not-exist": { get: { operationId: "ghost" } },
    },
  };
  const cmp = compareOpenApiWithRouter(doc);
  assert.equal(cmp.documentedCount, 3);
  assert.ok(cmp.orphanedInSpec.includes("GET /api/does-not-exist"));
  assert.ok(cmp.missingFromSpec.includes("GET /api/countries"), "липсващите се засичат");
  assert.ok(cmp.undocumentedPublic.some((x) => x.includes("/api/i18n/languages")));
  assert.deepEqual(cmp.leakedPrivatePaths, []);
});

t("сравнението вдига тревога при изтекъл админ маршрут", () => {
  const cmp = compareOpenApiWithRouter({ paths: { "/api/admin/users": { get: { operationId: "adminUsers" } } } });
  assert.deepEqual(cmp.leakedPrivatePaths, ["/api/admin/users"]);
});

t("сравнението открива повтарящи се operationId", () => {
  const cmp = compareOpenApiWithRouter({
    paths: { "/api/health": { get: { operationId: "same" } }, "/api/projects": { get: { operationId: "same" } } },
  });
  assert.deepEqual(cmp.duplicateOperationIds, ["same"]);
});

// ===========================================================================
// Link заглавки (RFC 8288)
// ===========================================================================

const LINK_HEADER = '<https://euro-funds.eu/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", <https://euro-funds.eu/openapi.json>; rel="service-desc"; type="application/openapi+json;version=3.1", <https://euro-funds.eu/docs/api>; rel="service-doc"; type="text/html"';

t("Link заглавката се разбира правилно (вкл. запетая в type)", () => {
  const links = parseLinkHeader(LINK_HEADER);
  assert.equal(links.length, 3);
  assert.equal(links[0].rel, "api-catalog");
  assert.equal(links[0].target, "https://euro-funds.eu/.well-known/api-catalog");
  assert.equal(links[1].type, "application/openapi+json;version=3.1");
  assert.equal(links[2].rel, "service-doc");
});

t("няколко rel стойности в една връзка стават отделни записи", () => {
  const links = parseLinkHeader('</a>; rel="service-desc describedby"');
  assert.deepEqual(links.map((l) => l.rel), ["service-desc", "describedby"]);
});

t("празна или невалидна Link заглавка не хвърля", () => {
  assert.deepEqual(parseLinkHeader(""), []);
  assert.deepEqual(parseLinkHeader(null), []);
  assert.deepEqual(parseLinkHeader("боклук"), []);
});

t("дублираните връзки се откриват", () => {
  const links = parseLinkHeader('</a>; rel="status", </a>; rel="status"');
  assert.deepEqual(duplicateLinks(links), ["status /a"]);
});

// ===========================================================================
// robots.txt
// ===========================================================================

const ROBOTS = `# коментар
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
Allow: /
Disallow: /admin
Disallow: /profile
Disallow: /api/
Allow: /api/health

User-agent: GPTBot
Disallow: /procedures

Sitemap: https://euro-funds.eu/sitemap.xml
`;

t("robots.txt се разбира на групи, sitemap и Content-Signal", () => {
  const p = parseRobots(ROBOTS);
  assert.equal(p.groups.length, 2);
  assert.deepEqual(p.groups[0].agents, ["*"]);
  assert.deepEqual(p.sitemaps, ["https://euro-funds.eu/sitemap.xml"]);
  assert.deepEqual(parseContentSignal(p.groups[0].contentSignal), { search: "yes", "ai-input": "yes", "ai-train": "yes" });
  assert.deepEqual(p.unknown, []);
});

t("правилата се прилагат с най-дългото съвпадение", () => {
  const p = parseRobots(ROBOTS);
  const star = groupForAgent(p, "*");
  assert.equal(robotsAllows(star, "/procedures/x"), true);
  assert.equal(robotsAllows(star, "/admin"), false);
  assert.equal(robotsAllows(star, "/api/projects"), false);
  assert.equal(robotsAllows(star, "/api/health"), true, "по-дългият Allow печели");
});

t("блокиран AI обхождащ за процедурите се засича", () => {
  const p = parseRobots(ROBOTS);
  const gpt = groupForAgent(p, "GPTBot");
  assert.equal(robotsAllows(gpt, "/procedures"), false);
  const claude = groupForAgent(p, "ClaudeBot");
  assert.equal(robotsAllows(claude, "/procedures"), true, "без своя група наследява *");
});

// ===========================================================================
// sitemap
// ===========================================================================

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url><loc>https://euro-funds.eu/</loc><lastmod>2026-07-26</lastmod>
<xhtml:link rel="alternate" hreflang="bg" href="https://euro-funds.eu/bg"/></url>
<url><loc>https://euro-funds.eu/procedures/a</loc><lastmod>2026-07-25</lastmod></url>
<url><loc>https://euro-funds.eu/procedures/a</loc><lastmod>2026-07-25</lastmod></url>
<url><loc>https://euro-funds.eu/admin</loc></url>
<url><loc>http://euro-funds.eu/insecure</loc></url>
<url><loc>https://old.workers.dev/x</loc></url>
<url><loc>https://euro-funds.eu/procedures?utm=1</loc></url>
<url><loc>https://euro-funds.eu/bad</loc><lastmod>вчера</lastmod></url>
</urlset>`;

t("sitemap се разбира и анализира срещу продукционния хост", () => {
  const parsed = parseSitemap(SITEMAP);
  assert.equal(parsed.entries.length, 8);
  assert.ok(parsed.hasXmlDeclaration && parsed.hasNamespace);
  assert.equal(parsed.entries[0].alternates.length, 1);

  const a = analyseSitemap(parsed, { origin: "https://euro-funds.eu", privateMatcher: isNeverPublic });
  assert.deepEqual(a.duplicates, ["https://euro-funds.eu/procedures/a"]);
  assert.ok(a.privateUrls.includes("https://euro-funds.eu/admin"));
  assert.ok(a.invalid.includes("http://euro-funds.eu/insecure"), "http адресите са невалидни");
  assert.ok(a.wrongHost.includes("https://old.workers.dev/x"));
  assert.ok(a.withQuery.includes("https://euro-funds.eu/procedures?utm=1"));
  assert.ok(a.badLastmod.includes("https://euro-funds.eu/bad"));
  assert.equal(a.newestLastmod, "2026-07-26");
  assert.equal(a.byType.procedure, 2);
});

t("чист sitemap не дава фалшиви положителни", () => {
  const clean = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://euro-funds.eu/</loc><lastmod>2026-07-26</lastmod></url>
  <url><loc>https://euro-funds.eu/procedures/x</loc><lastmod>2026-07-26T10:00:00Z</lastmod></url></urlset>`;
  const a = analyseSitemap(parseSitemap(clean), { origin: "https://euro-funds.eu", privateMatcher: isNeverPublic });
  assert.deepEqual([a.duplicates.length, a.invalid.length, a.privateUrls.length, a.wrongHost.length, a.badLastmod.length], [0, 0, 0, 0, 0]);
});

// ===========================================================================
// HTML метаданни / structured data / social / hreflang
// ===========================================================================

const HTML = `<!doctype html><html lang="bg"><head>
<title>Процедура за финансиране | Euro-Funding</title>
<meta name="description" content="Достатъчно дълго описание на процедурата за европейско финансиране с реални подробности.">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://euro-funds.eu/procedures/x">
<link rel="alternate" hreflang="bg" href="https://euro-funds.eu/bg">
<link rel="alternate" hreflang="x-default" href="https://euro-funds.eu/">
<meta property="og:title" content="Процедура"><meta property="og:description" content="Описание">
<meta property="og:type" content="website"><meta property="og:url" content="https://euro-funds.eu/procedures/x">
<meta property="og:image" content="https://euro-funds.eu/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"MonetaryGrant","name":"Процедура","url":"https://euro-funds.eu/procedures/x"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
</head><body><h1>Процедура за финансиране</h1></body></html>`;

t("метаданните се извличат пълно", () => {
  const m = extractMetadata(HTML);
  assert.equal(m.lang, "bg");
  assert.equal(m.canonicalCount, 1);
  assert.equal(m.canonical, "https://euro-funds.eu/procedures/x");
  assert.equal(m.h1Count, 1);
  assert.equal(m.og.image, "https://euro-funds.eu/og-image.png");
  assert.equal(m.twitter.card, "summary_large_image");
  assert.equal(m.alternates.length, 2);
  assert.equal(m.jsonLd.length, 2);
  assert.deepEqual(m.jsonLd.map((b) => b.type), ["MonetaryGrant", "BreadcrumbList"]);
});

t("липсващ каноничен и няколко H1 се засичат", () => {
  const bad = extractMetadata('<html><head><title>x</title></head><body><h1>a</h1><h1>b</h1></body></html>');
  assert.equal(bad.canonicalCount, 0);
  assert.equal(bad.h1Count, 2);
});

t("JSON-LD валидацията хваща грешен контекст и непродукционни адреси", () => {
  const good = validateJsonLd(extractJsonLd(HTML)[0], { origin: "https://euro-funds.eu" });
  assert.deepEqual(good.problems, []);

  const bad = validateJsonLd(extractJsonLd('<script type="application/ld+json">{"@context":"https://example.org","@type":"Organization","url":"http://localhost:3000"}</script>')[0], { origin: "https://euro-funds.eu" });
  assert.ok(bad.problems.includes("context"));
  assert.ok(bad.problems.includes("non_production_url"));
  assert.ok(bad.problems.includes("missing_name"));
});

t("невалиден JSON-LD не хвърля", () => {
  const blocks = extractJsonLd('<script type="application/ld+json">{нещо счупено}</script>');
  assert.equal(blocks[0].valid, false);
  assert.deepEqual(validateJsonLd(blocks[0], { origin: "https://euro-funds.eu" }).problems, ["invalid_json"]);
});

t("измислени оценки в JSON-LD се маркират", () => {
  const b = extractJsonLd('<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"x","url":"https://euro-funds.eu","aggregateRating":{"ratingValue":5}}</script>')[0];
  assert.ok(validateJsonLd(b, { origin: "https://euro-funds.eu" }).problems.includes("rating_without_source"));
});

t("hreflang кодовете се валидират", () => {
  for (const c of ["bg", "en", "de", "en-US", "x-default", "pt-BR"]) assert.equal(isValidHreflang(c), true, c);
  for (const c of ["", "english", "e", "b_g", "123456"]) assert.equal(isValidHreflang(c), false, c);
});

// ===========================================================================
// Markdown
// ===========================================================================

t("смисленият markdown се различава от празна SPA обвивка", () => {
  const real = "---\ntitle: x\n---\n\n# Заглавие\n\n" + "дума ".repeat(80) + "\n\n[връзка](https://euro-funds.eu/x)\n";
  const a = analyseMarkdown(real);
  assert.equal(a.meaningful, true);
  assert.equal(a.headings, 1);
  assert.equal(a.links, 1);
  assert.equal(a.hasFrontmatter, true);

  const shell = analyseMarkdown("---\ntitle: x\n---\n\n<div id=\"__next\"></div>");
  assert.equal(shell.meaningful, false);
  assert.equal(shell.looksLikeHtml, true);

  assert.equal(analyseMarkdown("# Само заглавие").meaningful, false, "малко текст не е смислено съдържание");
  assert.equal(analyseMarkdown("").meaningful, false);
});

// ===========================================================================
// Сигурност: редакция
// ===========================================================================

const REAL_OPENAI_KEY = "sk-" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2";
const REAL_ANTHROPIC_KEY = "sk-ant-api03-" + "Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0Fe9Dc8Ba7";

t("тайните се премахват от текст", () => {
  const text = `ключ ${REAL_OPENAI_KEY} и токен eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSM и AIzaSyA1234567890abcdefghijkl`;
  const out = redactText(text);
  assert.ok(!out.includes(REAL_OPENAI_KEY));
  assert.ok(!out.includes("eyJhbGciOi.eyJzdWIiOiIx.SflKxwRJSM"));
  assert.ok(!out.includes("AIzaSyA1234567890abcdefghijkl"));
  assert.ok(out.includes(REDACTED));
});

t("словашките слъгове не се бъркат с API ключ (регресия от продукцията)", () => {
  // Реален id от продукцията: „sk" е кодът на Словакия, не префикс на OpenAI ключ.
  const slug = "sk-sk-minzp-psk-mzp-001-2023-dv-efrr";
  assert.equal(redactText(`процедура ${slug}`).includes(slug), true, "слъгът трябва да остане");
  assert.deepEqual(detectLeakage(`виж /procedures/${slug}`), []);
  // А истинските ключове продължават да се хващат.
  assert.ok(detectLeakage(REAL_OPENAI_KEY).includes("api_key"));
  assert.ok(detectLeakage(REAL_ANTHROPIC_KEY).includes("api_key"));
  assert.ok(!redactText(REAL_ANTHROPIC_KEY).includes(REAL_ANTHROPIC_KEY));
});

t("имейлите се скриват по подразбиране", () => {
  assert.ok(!redactText("пиши на ivan@example.com").includes("ivan@example.com"));
  assert.ok(redactText("ivan@example.com", { keepEmails: true }).includes("ivan@example.com"));
});

t("чувствителните ключове в обект се заличават дълбоко", () => {
  const o = redactObject({
    ok: true,
    client_secret: "тайна",
    nested: { AUTH_SECRET: "x", api_key: "y", safe: "ок", deeper: { session_token: "z" } },
    list: [{ password: "p" }],
  });
  assert.equal(o.client_secret, REDACTED);
  assert.equal(o.nested.AUTH_SECRET, REDACTED);
  assert.equal(o.nested.api_key, REDACTED);
  assert.equal(o.nested.safe, "ок");
  assert.equal(o.nested.deeper.session_token, REDACTED);
  assert.equal(o.list[0].password, REDACTED);
  assert.equal(o.ok, true);
  assert.ok(!JSON.stringify(o).includes("тайна"));
});

t("preview на тялото е ограничено и изчистено", () => {
  const b = safeBodyPreview("x".repeat(5000) + " " + REAL_OPENAI_KEY, 100);
  assert.equal(b.preview.length, 100);
  assert.equal(b.truncated, true);
  assert.ok(!b.preview.includes(REAL_OPENAI_KEY));
});

t("изтичане на данни се разпознава", () => {
  assert.deepEqual(detectLeakage("нищо особено"), []);
  assert.ok(detectLeakage("виж /api/admin/users").includes("admin_route"));
  assert.ok(detectLeakage(REAL_OPENAI_KEY).includes("api_key"));
  assert.ok(detectLeakage('"client_secret": "x"').includes("secret_field"));
  assert.ok(detectLeakage("-----BEGIN PRIVATE KEY-----").includes("private_key"));
});

// ===========================================================================
// Мокнат сайт + D1 за интеграционните проверки
// ===========================================================================

function makeSite(overrides = {}) {
  const origin = "https://euro-funds.eu";
  const pages = {
    "/": { status: 200, ct: "text/html; charset=utf-8", body: HTML, headers: { link: LINK_HEADER, vary: "Accept" } },
    "/robots.txt": { status: 200, ct: "text/plain; charset=utf-8", body: ROBOTS },
    "/sitemap.xml": { status: 200, ct: "application/xml; charset=utf-8", body: SITEMAP },
    "/api/health": { status: 200, ct: "application/json; charset=utf-8", body: JSON.stringify({ ok: true, status: "pass", version: "2.48.0", database: "pass", procedures: 880, countries: 27, dataSnapshot: "2026-07-26" }) },
    "/openapi.json": {
      status: 200, ct: "application/openapi+json; charset=utf-8",
      body: JSON.stringify({
        openapi: "3.1.0", info: { version: "2.48.0" }, servers: [{ url: origin }],
        paths: { "/api/health": { get: { operationId: "getHealth" } } },
        components: { schemas: { Error: {} }, securitySchemes: { oauth2: {} } },
        tags: [],
      }),
    },
    "/.well-known/api-catalog": {
      status: 200, ct: "application/linkset+json; charset=utf-8",
      body: JSON.stringify({ linkset: [{ anchor: `${origin}/api`, "service-desc": [{ href: `${origin}/openapi.json` }], "service-doc": [{ href: `${origin}/docs/api` }], status: [{ href: `${origin}/api/health` }] }] }),
    },
    "/.well-known/oauth-authorization-server": {
      status: 200, ct: "application/json",
      body: JSON.stringify({ issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, jwks_uri: `${origin}/.well-known/jwks.json`, grant_types_supported: ["authorization_code"], code_challenge_methods_supported: ["S256"] }),
    },
    "/.well-known/jwks.json": { status: 200, ct: "application/jwk-set+json", body: JSON.stringify({ keys: [{ kty: "EC", crv: "P-256", x: "a", y: "b", kid: "k1", alg: "ES256" }] }) },
    "/docs/api": { status: 200, ct: "text/html; charset=utf-8", body: "<html><body>docs</body></html>" },
  };
  Object.assign(pages, overrides);

  const markdown = {
    "/": "---\ntitle: Начало\n---\n\n# Euro-Funding\n\n" + "текст ".repeat(80) + "\n\n[Процедури](https://euro-funds.eu/procedures)\n",
  };

  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const accept = String((init.headers || {}).accept || "");
    const key = u.pathname;
    if (accept.includes("text/markdown") && markdown[key] != null) {
      return mockResponse(200, "text/markdown; charset=utf-8", markdown[key], { vary: "Accept", "x-markdown-tokens": "2779" }, init.method);
    }
    const page = pages[key];
    if (!page) return mockResponse(404, "text/plain", "not found", {}, init.method);
    return mockResponse(page.status, page.ct, page.body, page.headers || {}, init.method);
  };
  return { origin, fetchImpl, pages, markdown };
}

function mockResponse(status, ct, body, extra = {}, method = "GET") {
  const headers = new Headers({ "content-type": ct, ...extra });
  return {
    status,
    headers,
    text: async () => (method === "HEAD" ? "" : body),
  };
}

function makeDb(rows = [{ slug: "a", country_code: "BG" }]) {
  return {
    procedureSlugs: async () => rows,
    procedureSeoStats: async () => ({ total: rows.length, withoutOfficialUrl: 0, withoutProgram: 0, expiredButOpen: 0, duplicateTitles: 0, duplicateSlugs: 0, countries: 1, withDocuments: 1 }),
  };
}

const runCheck = (code, category, params, site, db) =>
  executeCheck({ code, category, params: params || {} }, { origin: site.origin, fetchImpl: site.fetchImpl, db: db || makeDb(), sampleProcedurePaths: ["/procedures/a"] });

// ===========================================================================
// Интеграционни: проверките срещу мокнат сайт
// ===========================================================================

t("здравната проверка минава при коректен отговор", async () => {
  const r = await runCheck("api.health", "api", {}, makeSite());
  assert.equal(r.status, STATUS.PASSED);
  assert.equal(r.safeDetails.procedures, 880);
  assert.equal(r.responseContentType.includes("application/json"), true);
});

t("API каталогът с грешен тип съдържание е неуспешен", async () => {
  const site = makeSite({ "/.well-known/api-catalog": { status: 200, ct: "application/json", body: JSON.stringify({ linkset: [] }) } });
  const r = await runCheck("api.catalog", "api", {}, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.summaryKey, "api.catalog.contentType");
  assert.equal(r.summaryParams.expected, "application/linkset+json");
});

t("каталог, който рекламира админ API, е неуспешен", async () => {
  const site = makeSite({
    "/.well-known/api-catalog": {
      status: 200, ct: "application/linkset+json",
      body: JSON.stringify({ linkset: [{ anchor: "https://euro-funds.eu/api", "service-desc": [{ href: "https://euro-funds.eu/api/admin/users" }], "service-doc": [{ href: "https://euro-funds.eu/docs/api" }], status: [{ href: "https://euro-funds.eu/api/health" }] }] }),
    },
  });
  const r = await runCheck("api.catalog", "api", {}, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.safeDetails.privateAdvertised.length, 1);
});

t("OpenAPI сравнението открива недокументирани маршрути", async () => {
  const r = await runCheck("api.openapi.router_match", "api", {}, makeSite());
  assert.equal(r.status, STATUS.WARNING);
  assert.ok(r.safeDetails.missingFromSpec.length > 0);
  assert.ok(r.safeDetails.missingFromSpec.includes("GET /api/projects"));
});

t("Link заглавките се четат от продукцията", async () => {
  const r = await runCheck("agents.link_headers.html", "agents", {}, makeSite());
  assert.equal(r.status, STATUS.PASSED);
  assert.deepEqual(r.safeDetails.relations.sort(), ["api-catalog", "service-desc", "service-doc"]);
});

t("липсващи Link заглавки водят до неуспех", async () => {
  const site = makeSite({ "/": { status: 200, ct: "text/html", body: HTML, headers: {} } });
  const r = await runCheck("agents.link_headers.html", "agents", {}, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.summaryKey, "agents.link.none");
});

t("markdown проверката приема реално съдържание", async () => {
  const r = await runCheck("agents.markdown:/", "agents", { path: "/" }, makeSite());
  assert.equal(r.status, STATUS.PASSED);
  assert.equal(r.safeDetails.analysis.meaningful, true);
  assert.equal(r.safeDetails.tokens, 2779);
  assert.equal(r.safeDetails.reductionIsEstimate, true, "без x-original-tokens намалението е оценка");
});

t("markdown проверката хваща празна SPA обвивка", async () => {
  const site = makeSite();
  site.markdown["/"] = "---\ntitle: x\n---\n\n<div id=\"__next\"></div>";
  const r = await runCheck("agents.markdown:/", "agents", { path: "/" }, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("spa_shell"));
});

t("страница без markdown се отчита като неуспех, а не като успех", async () => {
  const site = makeSite({ "/calendar": { status: 200, ct: "text/html; charset=utf-8", body: HTML } });
  const r = await runCheck("agents.markdown:/calendar", "agents", { path: "/calendar" }, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("no_markdown"));
});

t("sitemap проверката открива дубликати и частни маршрути", async () => {
  const r = await runCheck("seo.sitemap", "sitemap", {}, makeSite());
  assert.equal(r.status, STATUS.FAILED, "частен маршрут в sitemap е критичен");
  assert.equal(r.safeDetails.duplicateCount, 1);
  assert.ok(r.safeDetails.privateUrls.includes("https://euro-funds.eu/admin"));
  assert.ok(r.safeDetails.problems.includes("duplicates"));
});

t("robots проверката открива блокирани публични маршрути", async () => {
  const blocking = `User-agent: *\nDisallow: /procedures\nAllow: /\nSitemap: https://euro-funds.eu/sitemap.xml\n`;
  const site = makeSite({ "/robots.txt": { status: 200, ct: "text/plain", body: blocking } });
  const r = await runCheck("seo.robots.policy", "robots", {}, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.summaryKey, "robots.blocksPublic");
  assert.ok(r.safeDetails.crawlers.every((c) => c.blockedPublicPaths.length > 0));
});

t("коректната robots политика минава", async () => {
  // Основната фикстура нарочно блокира GPTBot — тук ползваме чиста политика.
  const clean = `User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\nDisallow: /admin\nDisallow: /profile\nDisallow: /saved\nDisallow: /login\nDisallow: /api/\nAllow: /api/health\n\nSitemap: https://euro-funds.eu/sitemap.xml\n`;
  const r = await runCheck("seo.robots.policy", "robots", {}, makeSite({ "/robots.txt": { status: 200, ct: "text/plain", body: clean } }));
  assert.equal(r.status, STATUS.PASSED);
  assert.ok(r.safeDetails.crawlers.every((c) => c.blockedPublicPaths.length === 0));

  // А фикстурата с блокиран GPTBot трябва да се отчете като провал.
  const blocked = await runCheck("seo.robots.policy", "robots", {}, makeSite());
  assert.equal(blocked.status, STATUS.FAILED);
  const gpt = blocked.safeDetails.crawlers.find((c) => c.crawler === "GPTBot");
  assert.equal(gpt.hasOwnGroup, true);
  assert.ok(gpt.blockedPublicPaths.length > 0);
});

t("Content Signals се отчитат само ако са декларирани", async () => {
  const r = await runCheck("seo.robots.content_signal", "robots", {}, makeSite());
  assert.equal(r.safeDetails.declared, true);
  const none = await runCheck("seo.robots.content_signal", "robots", {}, makeSite({ "/robots.txt": { status: 200, ct: "text/plain", body: "User-agent: *\nAllow: /\n" } }));
  assert.equal(none.status, STATUS.NOT_APPLICABLE);
  assert.equal(none.safeDetails.declared, false);
});

t("OAuth метаданните с чужд издател са неуспешни (не се показват като готови)", async () => {
  const site = makeSite({
    "/.well-known/oauth-authorization-server": {
      status: 200, ct: "application/json",
      body: JSON.stringify({ issuer: "https://accounts.google.com", authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth", token_endpoint: "https://oauth2.googleapis.com/token", jwks_uri: "https://www.googleapis.com/oauth2/v3/certs", grant_types_supported: ["authorization_code"] }),
    },
  });
  const r = await runCheck("api.oauth.metadata", "api", {}, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("issuer_mismatch"));
});

t("липсващи OAuth метаданни не се представят като конфигурирани", async () => {
  const site = makeSite({ "/.well-known/oauth-authorization-server": undefined });
  delete site.pages["/.well-known/oauth-authorization-server"];
  const r = await runCheck("api.oauth.metadata", "api", {}, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.summaryKey, "oauth.unreachable");
});

t("публикуван частен ключ в JWKS е критичен провал", async () => {
  const site = makeSite({ "/.well-known/jwks.json": { status: 200, ct: "application/jwk-set+json", body: JSON.stringify({ keys: [{ kty: "EC", crv: "P-256", x: "a", y: "b", d: "ТАЙНА", kid: "k" }] }) } });
  const r = await runCheck("api.oauth.jwks", "api", {}, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("private_key_exposed"));
});

t("метаданните никога не изнасят частния ключ в резултата", async () => {
  const site = makeSite({ "/.well-known/jwks.json": { status: 200, ct: "application/jwk-set+json", body: JSON.stringify({ keys: [{ kty: "EC", d: "ТАЙНА", kid: "k" }] }) } });
  const r = await runCheck("api.oauth.jwks", "api", {}, site);
  assert.ok(!JSON.stringify(r).includes("ТАЙНА"));
});

t("метаданните на страница се проверяват срещу продукционния хост", async () => {
  const r = await runCheck("seo.metadata:/", "metadata", { path: "/" }, makeSite());
  assert.equal(r.status, STATUS.PASSED);
  assert.equal(r.safeDetails.canonicalCount, 1);
  assert.equal(r.safeDetails.h1Count, 1);
});

t("каноничен адрес към друг хост е критичен", async () => {
  const html = HTML.replace("https://euro-funds.eu/procedures/x", "https://staging.workers.dev/x");
  const site = makeSite({ "/": { status: 200, ct: "text/html", body: html, headers: { link: LINK_HEADER } } });
  const r = await runCheck("seo.metadata:/", "metadata", { path: "/" }, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("canonical_host"));
});

t("noindex на публична страница е критичен", async () => {
  const html = HTML.replace('content="index,follow"', 'content="noindex,follow"');
  const site = makeSite({ "/": { status: 200, ct: "text/html", body: html, headers: { link: LINK_HEADER } } });
  const r = await runCheck("seo.metadata:/", "metadata", { path: "/" }, site);
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.problems.includes("noindex"));
});

t("структурираните данни се валидират", async () => {
  const r = await runCheck("seo.structured_data:/", "structured_data", { path: "/" }, makeSite());
  assert.equal(r.status, STATUS.PASSED);
  assert.deepEqual(r.safeDetails.types, ["MonetaryGrant", "BreadcrumbList"]);
});

t("социалните метаданни се четат от реалния HTML", async () => {
  const r = await runCheck("seo.social:/", "social", { path: "/" }, makeSite());
  assert.equal(r.status, STATUS.PASSED);
  assert.equal(r.safeDetails.og.image, "https://euro-funds.eu/og-image.png");
});

t("непокритите процедури в sitemap се засичат", async () => {
  const r = await runCheck("seo.sitemap.coverage", "sitemap", {}, makeSite(), makeDb([{ slug: "a" }, { slug: "nyama-takava" }]));
  assert.equal(r.status, STATUS.FAILED);
  assert.equal(r.safeDetails.missingCount, 1);
  assert.deepEqual(r.safeDetails.missing, ["nyama-takava"]);
});

t("id с двоеточие/кирилица се сравнява по каноничен слъг (регресия)", async () => {
  // Sitemap-ът съдържа /procedures/a; в базата id-то е „A:isun:A" → codeSlug „a-isun-a".
  const site = makeSite({
    "/sitemap.xml": {
      status: 200, ct: "application/xml",
      body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://euro-funds.eu/procedures/bg-isun-bg16ffpr003-2-004</loc></url></urlset>`,
    },
  });
  const r = await runCheck("seo.sitemap.coverage", "sitemap", {}, site, makeDb([{ slug: "BG:isun:BG16FFPR003-2.004" }]));
  assert.equal(r.status, STATUS.PASSED, "не бива да се отчита като липсваща");
  assert.equal(r.safeDetails.missingCount, 0);
});

t("вътрешните маршрути трябва да искат вход", async () => {
  const exposed = {};
  for (const r of internalRoutes().filter((x) => x.method === "GET").slice(0, 6)) {
    exposed[r.path] = { status: 200, ct: "application/json", body: JSON.stringify({ users: [] }) };
  }
  const r = await runCheck("api.no_private_exposure", "api", {}, makeSite(exposed));
  assert.equal(r.status, STATUS.FAILED);
  assert.ok(r.safeDetails.findings.some((f) => f.exposed));

  const ok = await runCheck("api.no_private_exposure", "api", {}, makeSite());
  assert.equal(ok.status, STATUS.PASSED);
});

t("непозната проверка не хвърля", async () => {
  const r = await executeCheck({ code: "няма.такава", category: "api", params: {} }, { origin: "https://euro-funds.eu", fetchImpl: async () => { throw new Error("no"); } });
  assert.equal(r.status, STATUS.NOT_APPLICABLE);
});

t("мрежова грешка става резултат, не изключение", async () => {
  const r = await executeCheck({ code: "api.health", category: "api", params: {} }, { origin: "https://euro-funds.eu", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(r.status, STATUS.FAILED);
});

// ===========================================================================
// План на одита
// ===========================================================================

t("планът покрива всички групи и е сериализуем", () => {
  const plan = buildPlan(GROUPS, { sampleProcedurePaths: ["/procedures/a", "/procedures/b"], seoPages: [{ path: "/", typeKey: "page.home" }] });
  assert.ok(plan.length > 30, `очаквани >30 проверки, получени ${plan.length}`);
  const cats = new Set(plan.map((c) => c.category));
  for (const g of ["api", "agents", "sitemap", "robots", "metadata", "structured_data", "social", "i18n_seo", "procedures"]) {
    assert.ok(cats.has(g), `липсва група ${g}`);
  }
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(plan)));
  assert.equal(new Set(plan.map((c) => c.code)).size, plan.length, "дублирани кодове в плана");
});

t("планът за една група не влачи останалите", () => {
  const plan = buildPlan(["robots"], {});
  assert.ok(plan.length >= 3);
  assert.ok(plan.every((c) => c.category === "robots"));
});

t("планът никога не проверява админ маршрут като публичен", () => {
  const plan = buildPlan(GROUPS, { sampleProcedurePaths: [], seoPages: [] });
  const endpointChecks = plan.filter((c) => c.code.startsWith("api.endpoint:"));
  for (const c of endpointChecks) {
    const route = ROUTES.find((r) => r.id === c.params.routeId);
    assert.equal(route.kind, "public", `${route.id} не е публичен`);
  }
});

// ===========================================================================
// Дедупликация на сигнали + прогрес (мок на D1)
// ===========================================================================

function makeD1() {
  const tables = { discovery_signals: [], agent_readiness_runs: [], agent_readiness_check_results: [] };
  const exec = (sql, b) => {
    const s = sql.replace(/\s+/g, " ").trim();
    if (s.startsWith("SELECT id, state, occurrences FROM discovery_signals")) return tables.discovery_signals.find((x) => x.signal_key === b[0]) || null;
    if (s.startsWith("UPDATE discovery_signals SET state='resolved'")) {
      const r = tables.discovery_signals.find((x) => x.id === b[2]); if (r) { r.state = "resolved"; r.resolved_at = b[0]; } return null;
    }
    if (s.startsWith("UPDATE discovery_signals SET state='open'")) {
      const r = tables.discovery_signals.find((x) => x.id === b[6]); if (r) { r.state = "open"; r.severity = b[0]; r.occurrences += 1; r.last_seen_at = b[1]; } return null;
    }
    if (s.startsWith("INSERT INTO discovery_signals")) {
      tables.discovery_signals.push({ id: b[0], signal_key: b[1], category: b[2], check_code: b[3], resource_url: b[4], severity: b[5], state: "open", summary_key: b[6], occurrences: 1, first_seen_at: b[9], last_seen_at: b[9] });
      return null;
    }
    throw new Error("непокрита заявка: " + s.slice(0, 70));
  };
  return {
    tables,
    prepare(sql) {
      let binds = [];
      const st = { bind(...a) { binds = a; return st; }, async first() { return exec(sql, binds); }, async all() { const r = exec(sql, binds); return { results: Array.isArray(r) ? r : (r ? [r] : []) }; }, async run() { return exec(sql, binds); } };
      return st;
    },
  };
}

t("сигналът се създава веднъж и после само се брои", async () => {
  const { syncSignal } = await import("../worker/discovery/handlers.js");
  const DB = makeD1();
  const env = { DB };
  const bad = { code: "seo.sitemap", category: "sitemap", status: "failed", resourceUrl: "https://euro-funds.eu/sitemap.xml", summaryKey: "sitemap.problems", summaryParams: {}, safeDetails: { problems: ["duplicates"] } };

  assert.equal((await syncSignal(env, "run1", bad)).action, "created");
  assert.equal(DB.tables.discovery_signals.length, 1);
  assert.equal((await syncSignal(env, "run2", bad)).action, "updated");
  assert.equal(DB.tables.discovery_signals.length, 1, "без дубликати при всяко пускане");
  assert.equal(DB.tables.discovery_signals[0].occurrences, 2);

  const fixed = { ...bad, status: "passed" };
  assert.equal((await syncSignal(env, "run3", fixed)).action, "resolved");
  assert.equal(DB.tables.discovery_signals[0].state, "resolved");
});

t("проверки без правило не пораждат сигнал", async () => {
  const { syncSignal } = await import("../worker/discovery/handlers.js");
  const DB = makeD1();
  const r = await syncSignal({ DB }, "run", { code: "api.cors", category: "api", status: "failed", summaryKey: "x", safeDetails: {} });
  assert.equal(r, null);
  assert.equal(DB.tables.discovery_signals.length, 0);
});

t("успешна проверка не създава сигнал", async () => {
  const { syncSignal } = await import("../worker/discovery/handlers.js");
  const DB = makeD1();
  assert.equal(await syncSignal({ DB }, "run", { code: "seo.sitemap", category: "sitemap", status: "passed", summaryKey: "sitemap.ok", safeDetails: {} }), null);
  assert.equal(DB.tables.discovery_signals.length, 0);
});

t("тежестта на сигнала следва правилото, а не статуса наслуки", async () => {
  const { syncSignal } = await import("../worker/discovery/handlers.js");
  const DB = makeD1();
  await syncSignal({ DB }, "r", { code: "api.no_private_exposure", category: "api", status: "failed", summaryKey: "x", safeDetails: {} });
  assert.equal(DB.tables.discovery_signals[0].severity, "critical");
  const DB2 = makeD1();
  await syncSignal({ DB: DB2 }, "r", { code: "api.no_private_exposure", category: "api", status: "warning", summaryKey: "x", safeDetails: {} });
  assert.equal(DB2.tables.discovery_signals[0].severity, "info");
});

t("детайлите на сигнала се записват редактирани", async () => {
  const { syncSignal } = await import("../worker/discovery/handlers.js");
  const DB = makeD1();
  await syncSignal({ DB }, "r", { code: "seo.sitemap", category: "sitemap", status: "failed", summaryKey: "x", safeDetails: { client_secret: "ТАЙНА", ok: 1 } });
  assert.ok(!JSON.stringify(DB.tables.discovery_signals).includes("ТАЙНА"));
});

// ===========================================================================
// Превод на резултатите
// ===========================================================================

t("резюметата се превеждат по ключ, а не се пазят на един език", async () => {
  const { summaryText, SUMMARY_TEMPLATES } = await import("../app/admin/discovery-summaries.js");
  const identity = (x) => x;
  const text = summaryText({ summaryKey: "api.health.ok", summaryParams: { version: "2.48.0", procedures: 880, countries: 27 } }, identity);
  assert.ok(text.includes("2.48.0") && text.includes("880") && text.includes("27"));

  // Симулация на превод: всеки шаблон минава през преводача.
  const toEnglish = (x) => `[EN] ${x}`;
  const translated = summaryText({ summaryKey: "sitemap.ok", summaryParams: { total: 5 } }, toEnglish);
  assert.ok(translated.startsWith("[EN] "), "текстът минава през преводача");
  assert.ok(translated.includes("5"));

  // Липсващ параметър не оставя суров плейсхолдър.
  assert.ok(!summaryText({ summaryKey: "api.health.ok", summaryParams: {} }, identity).includes("{version}"));
  assert.ok(Object.keys(SUMMARY_TEMPLATES).length > 50);
});

t("всеки summaryKey от валидатора има шаблон", async () => {
  const { SUMMARY_TEMPLATES } = await import("../app/admin/discovery-summaries.js");
  // ВАЖНО: НЕ ползвай `new URL(...)` тук — под vitest (environment: "jsdom")
  // глобалният `URL` е jsdom-полифил без поддръжка на file: схема ("The URL must
  // be of scheme file"). fileURLToPath(import.meta.url) работи с директен string.
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../worker/discovery/validation.js"), "utf8");
  // Кодовете на проверките се регистрират с H("...") и в buildPlan — те не са
  // summaryKey и се изключват. Всичко останало трябва да има шаблон.
  const checkCodes = new Set([
    ...[...src.matchAll(/H\("([^"]+)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/add\("([^"]+)"/g)].map((m) => m[1].split(":")[0]),
  ]);
  const keys = [...new Set([...src.matchAll(/"([a-z][a-zA-Z]*(?:\.[a-zA-Z]+)+)"/g)].map((m) => m[1]))]
    .filter((k) => !checkCodes.has(k))
    .filter((k) => !/\.(js|json|txt|xml|mjs)$/.test(k))
    .filter((k) => !k.includes("/"))
    // `page.*` са ключове за вид страница, а не резюмета; изключваме и домейни.
    .filter((k) => !k.startsWith("page."))
    .filter((k) => !/\.(org|com|eu|io)$/.test(k));
  const missing = keys.filter((k) => !(k in SUMMARY_TEMPLATES));
  assert.deepEqual(missing, [], "липсващи шаблони: " + missing.join(", "));
});

// ===========================================================================
// Език на страницата на процедурата (регресия от одита)
// ===========================================================================

t("проверката хваща страница с грешен обявен език", async () => {
  const site = makeSite({
    "/procedures/hu-x": { status: 200, ct: "text/html", body: HTML },        // codeSlug("HU:x") → lang="bg"
    "/procedures/bg-y": { status: 200, ct: "text/html", body: HTML },        // lang="bg"
  });
  // Суровите id-та съдържат „:" и точки — проверката трябва да ползва codeSlug.
  const db = { ...makeDb(), procedureLanguages: async () => ([{ slug: "hu-x", language: "hu" }, { slug: "bg-y", language: "bg" }]) };
  const r = await runCheck("seo.procedures.language", "procedures", {}, site, db);
  assert.equal(r.status, STATUS.WARNING);
  assert.equal(r.safeDetails.mismatched.length, 1);
  assert.equal(r.safeDetails.mismatched[0].slug, "hu-x", "адресът минава през codeSlug");
  assert.equal(r.safeDetails.mismatched[0].expected, "hu");
  assert.equal(r.safeDetails.mismatched[0].actual, "bg");
});

t("проверката минава, когато езикът е верен", async () => {
  const huHtml = HTML.replace('<html lang="bg">', '<html lang="hu">');
  const site = makeSite({ "/procedures/hu-x": { status: 200, ct: "text/html", body: huHtml } });
  const db = { ...makeDb(), procedureLanguages: async () => ([{ slug: "hu-x", language: "hu" }]) };
  const r = await runCheck("seo.procedures.language", "procedures", {}, site, db);
  assert.equal(r.status, STATUS.PASSED);
});

t("езикът на процедурната страница следва източника, не интерфейса", async () => {
  const { pageLanguage, contentLanguageTag, ogLocale } = await import("../worker/procedure-page.js");
  // Реален случай от продукцията: унгарска процедура се сервираше с lang="bg".
  const hu = { original_language: "hu" };
  assert.equal(pageLanguage(hu), "hu");
  assert.equal(contentLanguageTag(hu), "hu");
  assert.equal(ogLocale(hu), "hu_HU");

  // Регионални варианти се запазват.
  const pt = { original_language: "pt-BR" };
  assert.equal(pageLanguage(pt), "pt-br");
  assert.equal(ogLocale(pt), "pt_BR");

  // Липсващ/невалиден език → български (описателните полета са на български).
  for (const v of [null, "", "  ", "английски", "xx-YY-ZZ", 42]) {
    assert.equal(pageLanguage({ original_language: v }), "bg", JSON.stringify(v));
  }
  assert.equal(pageLanguage(null), "bg");
  assert.equal(contentLanguageTag({}), "bg");
});

t("HTML на процедурата обявява езика последователно", async () => {
  const { renderProcedureHTML } = await import("../worker/procedure-page.js");
  const html = renderProcedureHTML(
    { id: "hu-x", name: "A hazai KKV szektor", program: "NCC-HU", status: "open", deadline: "30.09.2026", original_language: "hu" },
    []
  );
  assert.match(html, /<html lang="hu"/);
  assert.match(html, /hreflang="hu"/);
  assert.match(html, /og:locale" content="hu_HU"/);
  assert.match(html, /"inLanguage":"hu"/);
  assert.ok(!/<html lang="bg"/.test(html), "не бива да остава bg");

  // Българска процедура остава на български.
  const bg = renderProcedureHTML({ id: "bg-x", name: "Подкрепа", status: "open", original_language: "bg" }, []);
  assert.match(bg, /<html lang="bg"/);
});

// ===========================================================================
// Self-fetch (HTTP 522 в производството)
// ===========================================================================

const ORIGIN = "https://euro-funds.eu";

// fetch, който би върнал 522 — точно каквото прави Cloudflare, ако Worker
// излезе по мрежата към собствения си hostname.
function edge522() {
  return async () => new Response("error code: 522", { status: 522 });
}

t("собственият origin минава през вътрешния рутер, а не по мрежата", async () => {
  const calls = [];
  const env = {
    SELF_FETCH: async (url) => { calls.push(String(url)); return new Response("sitemap", { status: 200 }); },
  };
  const g = globalThis.fetch;
  globalThis.fetch = edge522();
  try {
    const f = makeFetchImpl(env, ORIGIN);
    const r = await f(`${ORIGIN}/sitemap.xml`);
    assert.equal(r.status, 200, "не бива да се получава 522");
    assert.deepEqual(calls, [`${ORIGIN}/sitemap.xml`]);
  } finally { globalThis.fetch = g; }
});

t("външните адреси НЕ минават през вътрешния рутер", async () => {
  const calls = [];
  const env = { SELF_FETCH: async (u) => { calls.push(String(u)); return new Response("x"); } };
  const g = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => { outbound++; return new Response("ok", { status: 200 }); };
  try {
    const f = makeFetchImpl(env, ORIGIN);
    const r = await f("https://example.org/og.png");
    assert.equal(r.status, 200);
    assert.equal(outbound, 1, "външният адрес трябва да мине по мрежата");
    assert.deepEqual(calls, [], "SELF_FETCH не бива да се вика за чужд хост");
  } finally { globalThis.fetch = g; }
});

t("одитът не може да рекурсира в собствените си админ адреси", async () => {
  let selfCalls = 0;
  const env = { SELF_FETCH: async () => { selfCalls++; return new Response("boom"); } };
  const f = makeFetchImpl(env, ORIGIN);
  for (const p of ["/api/admin/discovery/overview", "/api/admin/discovery/runs/1/drive"]) {
    const r = await f(`${ORIGIN}${p}`);
    assert.equal(r.status, 403, p);
    const body = await r.json();
    assert.equal(body.error, "recursion_blocked");
  }
  assert.equal(selfCalls, 0, "не бива да се стига до вътрешния рутер");
});

t("Request обект (не само низ) също се разпознава като собствен origin", async () => {
  const env = { SELF_FETCH: async () => new Response("ok", { status: 200 }) };
  const g = globalThis.fetch;
  globalThis.fetch = edge522();
  try {
    const f = makeFetchImpl(env, ORIGIN);
    const r = await f(new Request(`${ORIGIN}/robots.txt`));
    assert.equal(r.status, 200);
  } finally { globalThis.fetch = g; }
});

t("без SELF_FETCH се пада обратно към мрежата (локални изпълнения)", async () => {
  const g = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => { outbound++; return new Response("ok", { status: 200 }); };
  try {
    const f = makeFetchImpl({}, ORIGIN);
    const r = await f(`${ORIGIN}/robots.txt`);
    assert.equal(r.status, 200);
    assert.equal(outbound, 1);
  } finally { globalThis.fetch = g; }
});

t("проверка през вътрешния рутер дава passed там, където мрежата дава 522", async () => {
  const routed = async (url) => {
    if (String(url).endsWith("/robots.txt")) {
      return new Response("User-agent: *\nAllow: /\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nSitemap: https://euro-funds.eu/sitemap.xml\n",
        { status: 200, headers: { "content-type": "text/plain" } });
    }
    return new Response("not found", { status: 404 });
  };
  const plan = buildPlan(["robots"], { origin: ORIGIN });
  const robotsCheck = plan.find((c) => c.code === "seo.robots");
  assert.ok(robotsCheck, "планът трябва да съдържа seo.robots");

  // 1) Както беше в производството: мрежов fetch → 522.
  const broken = await executeCheck(robotsCheck, { origin: ORIGIN, fetchImpl: edge522() });
  assert.equal(broken.status, STATUS.FAILED);
  assert.equal(broken.responseStatus, 522);

  // 2) Със SELF_FETCH: същата проверка минава.
  const fixed = await executeCheck(robotsCheck, { origin: ORIGIN, fetchImpl: makeFetchImpl({ SELF_FETCH: routed }, ORIGIN) });
  assert.equal(fixed.responseStatus, 200);
  assert.notEqual(fixed.status, STATUS.FAILED, `очаквах не-провал, получих ${fixed.summaryKey}`);
});

// ===========================================================================
// Адреси на процедури (codeSlug, а не суров id)
// ===========================================================================

t("процедурен адрес се гради от codeSlug — суровият id дава 404", () => {
  // Тези три реални процедури проваляха 11 проверки в продукцията: одитът
  // строеше „/procedures/HU:hu-palyazat:…" (404), вместо каноничния слъг.
  const cases = [
    ["HU:hu-palyazat:ssns-ncc-hu-2026-fstp", "hu-hu-palyazat-ssns-ncc-hu-2026-fstp"],
    ["LT:lt-esinvesticijos:step-defence", "lt-lt-esinvesticijos-step-defence"],
    ["SI:si-podjetniskisklad:jp-start-up-mentorji", "si-si-podjetniskisklad-jp-start-up-mentorji"],
  ];
  for (const [id, expected] of cases) {
    assert.equal(codeSlug(id), expected, id);
    assert.equal(/[:%]/.test(codeSlug(id)), false, "слъгът не бива да носи двоеточия");
  }
});

// ===========================================================================
// Обхват на таба (одит в единия таб не бива да „изпразва" другия)
// ===========================================================================

t("двата таба покриват различни групи и заедно покриват всички", () => {
  const api = SCOPE_GROUPS.api, seo = SCOPE_GROUPS.seo;
  assert.equal(api.some((g) => seo.includes(g)), false, "групите се застъпват");
  assert.deepEqual([...api, ...seo].sort(), [...GROUPS].sort(), "групите не покриват GROUPS");
});

t("одит от „API & Agents“ не се брои за таба „SEO & Discovery“", () => {
  const apiRun = { groups_json: JSON.stringify(["api", "agents"]) };
  const seoRun = { groups_json: JSON.stringify(SCOPE_GROUPS.seo) };
  const partial = { groups_json: JSON.stringify(["sitemap"]) };

  assert.equal(runInScope(apiRun, SCOPE_GROUPS.api), true);
  assert.equal(runInScope(apiRun, SCOPE_GROUPS.seo), false, "именно това чупеше екрана");
  assert.equal(runInScope(seoRun, SCOPE_GROUPS.seo), true);
  assert.equal(runInScope(seoRun, SCOPE_GROUPS.api), false);
  // Частична валидация принадлежи на своя таб.
  assert.equal(runInScope(partial, SCOPE_GROUPS.seo), true);
  assert.equal(runInScope(partial, SCOPE_GROUPS.api), false);
  // Без обхват (стар клиент) — показваме всичко, а не нищо.
  assert.equal(runInScope(apiRun, null), true);
});

t("повреден groups_json не хвърля и не влиза в никой обхват", () => {
  assert.equal(runInScope({ groups_json: "{не е json" }, SCOPE_GROUPS.seo), false);
  assert.equal(runInScope({}, SCOPE_GROUPS.seo), false);
});

// ===========================================================================
// Индекс на резултатите (шаблони и дати по карта)
// ===========================================================================

const CH = [
  { code: "seo.sitemap", category: "sitemap", status: "passed", completedAt: "2026-07-26T21:00:00.000Z" },
  { code: "seo.metadata:/", category: "metadata", status: "passed", completedAt: "2026-07-26T21:41:00.000Z" },
  { code: "seo.metadata:/about", category: "metadata", status: "warning", completedAt: "2026-07-26T21:42:00.000Z" },
  { code: "seo.structured_data:/", category: "structured_data", status: "failed", completedAt: "2026-07-26T21:42:30.000Z" },
];

t("шаблонът „код:*“ намира всички ресурси на тази проверка", () => {
  const idx = indexChecks(CH);
  // Преди поправката „seo.metadata:*" → „seo.metadata:" и не съвпадаше с
  // ключа „seo.metadata" → всяка такава карта оставаше „Няма валидация".
  assert.equal(idx.rollup(["seo.metadata:*"]), "warning");
  assert.equal(idx.rollup(["seo.structured_data:*"]), "failed");
  assert.equal(idx.rollup(["seo.sitemap"]), "passed");
});

t("шаблон без двоеточие продължава да работи", () => {
  const idx = indexChecks([
    { code: "agents.markdown:/", status: "passed", completedAt: "2026-07-26T10:00:00.000Z" },
    { code: "agents.markdown:/about", status: "passed", completedAt: "2026-07-26T10:01:00.000Z" },
  ]);
  assert.equal(idx.rollup(["agents.markdown*"]), "passed");
});

t("непозната проверка си остава „unknown“, а не „passed“", () => {
  const idx = indexChecks(CH);
  assert.equal(idx.rollup(["seo.nope:*"]), "unknown");
  assert.equal(idx.status("seo.nope"), "unknown");
});

t("всяка карта носи собствената си дата на проверка", () => {
  const idx = indexChecks(CH);
  assert.equal(idx.checkedAt("seo.sitemap"), "2026-07-26T21:00:00.000Z");
  // Най-новата измежду покритите от шаблона.
  assert.equal(idx.checkedAt("seo.metadata:*"), "2026-07-26T21:42:00.000Z");
  // Няколко кода наведнъж → най-новият.
  assert.equal(idx.checkedAt("seo.sitemap", "seo.structured_data:*"), "2026-07-26T21:42:30.000Z");
  assert.equal(idx.checkedAt("seo.nope"), null);
});

// ===========================================================================
// Пускане
// ===========================================================================

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
  console.log(`\n${passed}/${tests.length} passed (discovery)`);
}
