// Откриваемост за AI агенти: Link заглавки (RFC 8288), API каталог (RFC 9727),
// OpenAPI 3.1 описание, човешка документация, здравен endpoint и robots.txt с
// Content Signals (contentsignals.org).

const SITE = "https://euro-funds.eu";
const BRAND = "Euro-Funding";

// ---------------------------------------------------------------------------
// Link заглавки (RFC 8288) — само регистрирани relation типове (IANA).
// ---------------------------------------------------------------------------

export const AGENT_LINKS = [
  { href: "/.well-known/api-catalog", rel: "api-catalog", type: "application/linkset+json" },
  { href: "/openapi.json", rel: "service-desc", type: "application/openapi+json;version=3.1" },
  { href: "/docs/api", rel: "service-doc", type: "text/html" },
  { href: "/api/health", rel: "status", type: "application/json" },
  { href: "/.well-known/oauth-authorization-server", rel: "describedby", type: "application/json" },
  { href: "/llms.txt", rel: "describedby", type: "text/markdown" },
  { href: "/sitemap.xml", rel: "sitemap", type: "application/xml" },
];

/** Стойност за Link заглавка (запетая-разделена; валидно по RFC 8288). */
export function agentLinkHeader(origin = SITE) {
  return AGENT_LINKS.map((l) => `<${origin}${l.href}>; rel="${l.rel}"; type="${l.type}"`).join(", ");
}

const HTML_PATH = /^\/(?:[a-z]{2}\/)?(?:$|procedures|calendar|saved|changelog|about|how-ai-works|terms|privacy|cookies|sources|docs)/;

/**
 * Добавя Link заглавките към HTML отговорите (началната страница задължително —
 * там ги търсят агентите). Не пипа JSON/статични asset-и, за да не раздува
 * всеки отговор. Добавя и alternate към markdown версията + Vary: Accept.
 */
export function withAgentHeaders(response, url) {
  try {
    if (!response || response.status >= 300) return response;
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return response;
    if (!HTML_PATH.test(url.pathname)) return response;
    const headers = new Headers(response.headers);
    const links = [
      agentLinkHeader(SITE),
      `<${SITE}${url.pathname}>; rel="alternate"; type="text/markdown"`,
    ];
    const existing = headers.get("link");
    headers.set("link", existing ? `${existing}, ${links.join(", ")}` : links.join(", "));
    const vary = headers.get("vary");
    headers.set("vary", vary && !/accept/i.test(vary) ? `${vary}, Accept` : vary || "Accept");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

// ---------------------------------------------------------------------------
// HEAD семантика (RFC 9110 §9.3.2)
// ---------------------------------------------------------------------------

/**
 * HEAD трябва да върне същите заглавки като GET, само без тяло. Машинно
 * четимите маршрути бяха зад `method === "GET"`, затова HEAD падаше към
 * статиката и връщаше 404 — а RFC 9727 изисква HEAD да работи за каталога.
 * Затова HEAD се пуска по същия път като GET, а тялото се маха накрая.
 */
export function asGetRequest(request, url) {
  if (request.method !== "HEAD") return request;
  return new Request(url.toString(), { method: "GET", headers: request.headers, cf: request.cf });
}

/** Маха тялото, ако оригиналната заявка е била HEAD. Заглавките се запазват. */
export function stripBodyForHead(response, isHead) {
  if (!isHead || !response) return response;
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

// ---------------------------------------------------------------------------
// /.well-known/api-catalog (RFC 9727 — linkset+json)
// ---------------------------------------------------------------------------

export function apiCatalog() {
  const body = {
    linkset: [
      {
        anchor: `${SITE}/api`,
        "service-desc": [{ href: `${SITE}/openapi.json`, type: "application/openapi+json", title: "OpenAPI 3.1 описание на публичното API" }],
        "service-doc": [{ href: `${SITE}/docs/api`, type: "text/html", title: "Документация на API-то" }],
        "service-meta": [{ href: `${SITE}/.well-known/oauth-protected-resource`, type: "application/json", title: "Метаданни на защитения ресурс (RFC 9728)" }],
        status: [{ href: `${SITE}/api/health`, type: "application/json", title: "Здравен статус" }],
        author: [{ href: `${SITE}/about`, title: BRAND }],
        "terms-of-service": [{ href: `${SITE}/terms`, title: "Условия за ползване" }],
        describedby: [{ href: `${SITE}/llms.txt`, type: "text/markdown", title: "Карта на съдържанието за езикови модели" }],
      },
    ],
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/linkset+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}

// ---------------------------------------------------------------------------
// /openapi.json — OpenAPI 3.1 на публичното API
// ---------------------------------------------------------------------------

const COUNTRY_PARAM = {
  name: "country", in: "query", required: false,
  description: "Двубуквен код на държава по ISO 3166-1 alpha-2 (по подразбиране BG).",
  schema: { type: "string", pattern: "^[A-Za-z]{2}$", default: "BG" },
};

function op({ tag, id, summary, description, params = [], security, schema }) {
  const o = {
    tags: [tag],
    operationId: id,
    summary,
    description,
    responses: {
      200: { description: "Успешен отговор", content: { "application/json": { schema: schema || { type: "object" } } } },
      400: { description: "Невалиден параметър", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    },
  };
  if (params.length) o.parameters = params;
  if (security) {
    o.security = security;
    o.responses[401] = { description: "Липсва или е невалиден токен", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
    o.responses[403] = { description: "Недостатъчен обхват (scope)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
  }
  return o;
}

export function openApiDocument(version = "0.0.0") {
  const doc = {
    openapi: "3.1.0",
    info: {
      title: `${BRAND} Public API`,
      version,
      summary: "Процедури за европейско и национално финансиране в 27-те държави от ЕС.",
      description:
        "Публично, безплатно API върху данните на euro-funds.eu. Данните се събират от официални " +
        "национални източници и се структурират с изкуствен интелект. Не заменят официалната " +
        "документация по процедурата.\n\n" +
        "Всяка публична HTML страница поддържа и `Accept: text/markdown`.",
      contact: { name: BRAND, url: `${SITE}/about` },
      license: { name: "Условия за ползване", url: `${SITE}/terms` },
      termsOfService: `${SITE}/terms`,
    },
    servers: [{ url: SITE, description: "Продукция" }],
    externalDocs: { description: "Документация", url: `${SITE}/docs/api` },
    tags: [
      { name: "Процедури", description: "Процедури за финансиране и техните документи" },
      { name: "Държави", description: "Обхванати държави, региони и източници" },
      { name: "Платформа", description: "Статус, статистики и промени" },
      { name: "Потребител", description: "Лични данни — изискват OAuth 2.1 токен с права само за четене" },
    ],
    paths: {
      "/api/health": { get: op({ tag: "Платформа", id: "getHealth", summary: "Здравен статус", description: "Наличност на услугата и базата, версия и обхват на данните.", schema: { $ref: "#/components/schemas/Health" } }) },
      "/api/projects": { get: op({ tag: "Процедури", id: "listProjects", summary: "Списък процедури за държава", description: "Всички процедури за държавата, с брой прикачени документи и последния snapshot.", params: [COUNTRY_PARAM], schema: { $ref: "#/components/schemas/ProjectList" } }) },
      "/api/project": {
        get: op({
          tag: "Процедури", id: "getProject", summary: "Една процедура с документите ѝ",
          description: "Пълните данни за процедура по идентификатор, заедно с анализираните документи.",
          params: [{ name: "id", in: "query", required: true, description: "Идентификатор (slug) на процедурата.", schema: { type: "string" } }],
          schema: { type: "object", properties: { ok: { type: "boolean" }, project: { $ref: "#/components/schemas/Project" }, documents: { type: "array", items: { $ref: "#/components/schemas/Document" } } } },
        }),
      },
      "/api/documents": {
        get: op({
          tag: "Процедури", id: "listDocuments", summary: "Документи към процедура",
          params: [{ name: "project_id", in: "query", required: true, schema: { type: "string" } }],
          schema: { type: "object", properties: { ok: { type: "boolean" }, documents: { type: "array", items: { $ref: "#/components/schemas/Document" } } } },
        }),
      },
      "/api/countries": { get: op({ tag: "Държави", id: "listCountries", summary: "Обхванати държави", description: "27-те държави от ЕС със статус на покритие и последна успешна синхронизация.", schema: { type: "object", properties: { ok: { type: "boolean" }, countries: { type: "array", items: { $ref: "#/components/schemas/Country" } } } } }) },
      "/api/countries/profile-options": { get: op({ tag: "Държави", id: "getProfileOptions", summary: "Региони, програми и валута за държава", params: [COUNTRY_PARAM] }) },
      "/api/sources": { get: op({ tag: "Държави", id: "listSources", summary: "Официални източници за държава", description: "Регистър на порталите, от които се събират данните, с честота и състояние.", params: [COUNTRY_PARAM] }) },
      "/api/public/platform-statistics": { get: op({ tag: "Платформа", id: "getPlatformStatistics", summary: "Статистики от последния публикуван snapshot", description: "Реални стойности — липсващите данни се връщат като null, не се допълват с предположения." }) },
      "/api/changelog": {
        get: op({
          tag: "Платформа", id: "listChangelog", summary: "Хронология на промените",
          params: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
            { name: "cursor", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string", enum: ["feature", "improvement", "fix", "data", "performance", "security"] } },
            { name: "q", in: "query", schema: { type: "string" } },
          ],
        }),
      },
      "/api/ai/public-configuration": { get: op({ tag: "Платформа", id: "getAiConfiguration", summary: "Кои AI модели се ползват и за какво", description: "Само публични данни за прозрачност — без ключове и без вътрешни настройки." }) },
      "/api/geo": { get: op({ tag: "Държави", id: "getGeo", summary: "Приблизителна държава на заявката", description: "Само двубуквен код от Cloudflare. НЕ се съхранява и НЕ се връща IP адрес." }) },
      "/api/auth/me": { get: op({ tag: "Потребител", id: "getMe", summary: "Текущият потребител", security: [{ oauth2: ["openid"] }, {}] }) },
      "/api/profile": { get: op({ tag: "Потребител", id: "getProfile", summary: "Профил на потребителя", description: "Изисква токен с обхват `profile:read`. Записът (PUT) е достъпен само през сесия в браузъра.", security: [{ oauth2: ["profile:read"] }] }) },
      "/api/saved-procedures": { get: op({ tag: "Потребител", id: "listSaved", summary: "Запазени процедури", description: "Изисква токен с обхват `saved:read`.", security: [{ oauth2: ["saved:read"] }] }) },
      "/oauth/userinfo": { get: op({ tag: "Потребител", id: "getUserinfo", summary: "OpenID Connect UserInfo", security: [{ oauth2: ["openid"] }] }) },
    },
    components: {
      securitySchemes: {
        oauth2: {
          type: "oauth2",
          description: "OAuth 2.1 authorization code + PKCE (S256 задължително). Токените дават права САМО за четене.",
          flows: {
            authorizationCode: {
              authorizationUrl: `${SITE}/oauth/authorize`,
              tokenUrl: `${SITE}/oauth/token`,
              refreshUrl: `${SITE}/oauth/token`,
              scopes: {
                openid: "Идентификатор и основен профил на потребителя",
                "profile:read": "Четене на профила за финансиране (държава, регион, сектор)",
                "saved:read": "Четене на запазените процедури",
              },
            },
          },
        },
      },
      schemas: {
        Error: { type: "object", properties: { ok: { type: "boolean", const: false }, error: { type: "string" } }, required: ["ok", "error"] },
        Health: {
          type: "object",
          properties: {
            ok: { type: "boolean" }, status: { type: "string", enum: ["pass", "warn", "fail"] },
            version: { type: "string" }, database: { type: "string" },
            procedures: { type: "integer" }, countries: { type: "integer" },
            dataSnapshot: { type: ["string", "null"], format: "date" }, time: { type: "string", format: "date-time" },
          },
        },
        Project: {
          type: "object",
          properties: {
            id: { type: "string", description: "Стабилен slug — не се променя между синхронизации." },
            name: { type: "string" }, program: { type: ["string", "null"] }, priority: { type: ["string", "null"] },
            category: { type: ["string", "null"], enum: ["youth", "new", "other", null] },
            status: { type: "string", enum: ["open", "closing_soon", "upcoming", "closed"] },
            deadline: { type: ["string", "null"], description: "Срок както е обявен от източника." },
            deadline_date: { type: ["string", "null"], format: "date" },
            budget: { type: ["string", "null"] },
            budget_amount_eur: { type: ["number", "null"], description: "null означава липсващи структурирани данни, не нулев бюджет." },
            budget_currency: { type: ["string", "null"] },
            eligible: { type: ["string", "null"] }, link: { type: ["string", "null"], format: "uri" },
            official_url: { type: ["string", "null"], format: "uri" }, managing_authority: { type: ["string", "null"] },
            country_code: { type: "string", pattern: "^[A-Z]{2}$" },
            first_seen: { type: ["string", "null"], format: "date" }, last_updated: { type: ["string", "null"], format: "date" },
            doc_count: { type: "integer" },
          },
          required: ["id", "name", "status", "country_code"],
        },
        Document: {
          type: "object",
          properties: {
            id: { type: "integer" }, project_id: { type: "string" }, title: { type: "string" },
            doc_type: { type: ["string", "null"] },
            content: { type: ["string", "null"], description: "Markdown резюме/анализ на документа." },
            source_url: { type: ["string", "null"], format: "uri" },
          },
        },
        Country: {
          type: "object",
          properties: {
            code: { type: "string" }, slug: { type: "string" }, name_bg: { type: "string" },
            native_name: { type: ["string", "null"] }, english_name: { type: ["string", "null"] },
            currency_code: { type: ["string", "null"] }, enabled: { type: "integer" },
            coverage_status: { type: "string" }, ingestion_status: { type: "string" },
            last_successful_sync_at: { type: ["string", "null"] },
          },
        },
        ProjectList: {
          type: "object",
          properties: {
            ok: { type: "boolean" }, country: { type: "string" },
            projects: { type: "array", items: { $ref: "#/components/schemas/Project" } },
            snapshot: { type: ["object", "null"] },
          },
        },
      },
    },
  };
  return doc;
}

export function openApiResponse(version) {
  return new Response(JSON.stringify(openApiDocument(version), null, 2), {
    status: 200,
    headers: {
      "content-type": "application/openapi+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}

// ---------------------------------------------------------------------------
// /api/health
// ---------------------------------------------------------------------------

export async function handleHealth(env, version = "0.0.0") {
  const started = Date.now();
  let database = "fail";
  let procedures = null;
  let countries = null;
  let snapshot = null;
  try {
    const r = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM projects) AS p, (SELECT COUNT(*) FROM countries WHERE enabled=1) AS c, (SELECT MAX(snapshot_date) FROM country_daily_statistics WHERE publish_status='published') AS s").first();
    if (r) {
      database = "pass";
      procedures = r.p;
      countries = r.c;
      snapshot = r.s || null;
    }
  } catch {
    database = "fail";
  }
  const status = database === "pass" ? (procedures > 0 ? "pass" : "warn") : "fail";
  const body = {
    ok: status !== "fail",
    status,
    version,
    database,
    procedures,
    countries,
    dataSnapshot: snapshot,
    latencyMs: Date.now() - started,
    time: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: status === "fail" ? 503 : 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

// ---------------------------------------------------------------------------
// robots.txt с Content Signals
// ---------------------------------------------------------------------------

// Декларираните предпочитания за ползване на съдържанието (contentsignals.org /
// IETF aipref). Стойностите са бизнес решение на собственика на сайта.
export const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=yes";

export function robotsTxt() {
  const body = [
    "# robots.txt — https://euro-funds.eu",
    "#",
    "# Content Signals (https://contentsignals.org/) декларират как може да се ползва",
    "# съдържанието на този сайт. Значение на сигналите:",
    "#   search    = индексиране и показване в резултати от търсене с връзки/откъси",
    "#   ai-input  = ползване като вход за AI модел при заявка (retrieval, grounding, RAG)",
    "#   ai-train  = обучение или дообучение на AI модели",
    "# „yes“ означава разрешено. Сигналите изразяват предпочитанията на собственика;",
    "# те не отменят приложимото право, нито условията на /terms.",
    "",
    "User-agent: *",
    `Content-Signal: ${CONTENT_SIGNAL}`,
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /profile",
    "Disallow: /login",
    "Disallow: /saved",
    "Disallow: /oauth/",
    "Disallow: /api/",
    "Allow: /api/health",
    "Allow: /.well-known/",
    "",
    "# Машинно четими ресурси за агенти",
    "# /llms.txt                    — карта на съдържанието (llmstxt.org)",
    "# /openapi.json                — OpenAPI 3.1 описание на публичното API",
    "# /.well-known/api-catalog     — API каталог (RFC 9727)",
    "# Accept: text/markdown        — markdown версия на всяка публична страница",
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

// ---------------------------------------------------------------------------
// /docs/api — човешка документация (service-doc)
// ---------------------------------------------------------------------------

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ENDPOINT_ROWS = [
  ["GET /api/health", "Наличност, версия и обхват на данните"],
  ["GET /api/projects?country=BG", "Всички процедури за държава"],
  ["GET /api/project?id=&lt;slug&gt;", "Една процедура с документите ѝ"],
  ["GET /api/documents?project_id=&lt;slug&gt;", "Документи към процедура"],
  ["GET /api/countries", "27-те държави със статус на покритие"],
  ["GET /api/countries/profile-options?country=BG", "Региони, програми и валута"],
  ["GET /api/sources?country=BG", "Официални източници за държавата"],
  ["GET /api/public/platform-statistics", "Статистики от последния snapshot"],
  ["GET /api/changelog", "Хронология на промените"],
  ["GET /api/ai/public-configuration", "Кои AI модели се ползват и за какво"],
];

export function apiDocsHtml(version = "") {
  const rows = ENDPOINT_ROWS.map(([a, b]) => `<tr><td><code>${a}</code></td><td>${esc(b)}</td></tr>`).join("");
  const links = AGENT_LINKS.map((l) => `<li><a href="${l.href}"><code>${esc(l.href)}</code></a> — <code>rel="${esc(l.rel)}"</code></li>`).join("");
  return `<!doctype html><html lang="bg"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API документация | ${BRAND}</title>
<meta name="description" content="Публично API на Euro-Funding: процедури за европейско финансиране, документи, източници и статистики. OpenAPI 3.1, markdown content negotiation и OAuth 2.1 за лични данни.">
<link rel="canonical" href="${SITE}/docs/api">
<meta property="og:title" content="API документация | ${BRAND}">
<meta property="og:description" content="Публично API, OpenAPI 3.1, markdown за агенти и OAuth 2.1 достъп само за четене.">
<meta property="og:url" content="${SITE}/docs/api">
<meta property="og:type" content="website">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="API документация | ${BRAND}">
<meta name="twitter:description" content="Публично API, OpenAPI 3.1, markdown за агенти и OAuth 2.1 достъп само за четене.">
<style>
:root{--primary:#0b6ea3;--text:#0f2942;--muted:#64748b;--line:#e2e8f0;--bg:#f8fafc}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:32px 20px 72px}
header.site{display:flex;gap:16px;align-items:center;justify-content:space-between;margin-bottom:28px}
a{color:var(--primary)}
h1{font-size:30px;line-height:1.25;margin:0 0 8px}
h2{font-size:21px;margin:36px 0 10px}
h3{font-size:17px;margin:24px 0 6px}
p.lead{color:var(--muted);margin-top:0}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:12px 0}
td,th{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:14.5px}
tr:last-child td{border-bottom:0}
th{background:#f1f5f9;font-weight:600}
code{background:#eef2f7;padding:1px 5px;border-radius:5px;font-size:13.5px}
pre{background:#0f2942;color:#e2e8f0;padding:14px 16px;border-radius:10px;overflow:auto;font-size:13.5px;line-height:1.5}
pre code{background:none;color:inherit;padding:0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}
ul{padding-left:20px}
footer{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
</style></head><body><div class="wrap">
<header class="site"><a href="${SITE}/"><strong>${BRAND}</strong></a><span style="color:var(--muted);font-size:14px">${version ? "версия " + esc(version) : ""}</span></header>
<main>
<h1>API документация</h1>
<p class="lead">Публично, безплатно API върху данните за европейско и национално финансиране в 27-те държави от ЕС. Машинно четимото описание е <a href="/openapi.json">OpenAPI 3.1</a>.</p>

<div class="card"><strong>Данните не заменят официалната документация.</strong> Стойностите се извличат автоматично и се структурират с изкуствен интелект. Липсващите стойности се връщат като <code>null</code> — те означават „няма структурирани данни“, а не нула. Винаги проверявайте оригиналния документ от <code>official_url</code>.</div>

<h2>Публични endpoint-и</h2>
<table><tr><th>Endpoint</th><th>Описание</th></tr>${rows}</table>
<p>Без автентикация, без ключ. Отговорите са JSON с <code>ok: true|false</code>. Държавата се подава като двубуквен код по ISO 3166-1 alpha-2 (<code>?country=BG</code>).</p>
<pre><code>curl "${SITE}/api/projects?country=BG"</code></pre>

<h2>Markdown за агенти</h2>
<p>Всяка публична страница връща markdown, ако заявката е с <code>Accept: text/markdown</code>. Отговорът е <code>Content-Type: text/markdown; charset=utf-8</code> и носи <code>x-markdown-tokens</code> с оценка на токените. HTML остава подразбиране за браузъри.</p>
<pre><code>curl -H "Accept: text/markdown" "${SITE}/procedures?country=BG"</code></pre>
<p>Markdown-ът се генерира директно от базата, а не от HTML — затова съдържа реалните процедури, срокове и бюджети. Кратка карта на съдържанието: <a href="/llms.txt"><code>/llms.txt</code></a>.</p>

<h2>Откриваемост</h2>
<p>Началната страница връща <code>Link</code> заглавки (RFC 8288):</p>
<ul>${links}</ul>

<h2>Автентикация (OAuth 2.1)</h2>
<p>Публичните данни не изискват автентикация. Личните данни на потребител (профил и запазени процедури) се достъпват с OAuth 2.1 authorization code + PKCE. <strong>Издаваните токени дават права само за четене</strong> — писане е възможно единствено през сесия в браузъра.</p>
<table>
<tr><th>Метаданни</th><td><code>/.well-known/oauth-authorization-server</code>, <code>/.well-known/openid-configuration</code></td></tr>
<tr><th>Ресурс</th><td><code>/.well-known/oauth-protected-resource</code></td></tr>
<tr><th>Ключове</th><td><code>/.well-known/jwks.json</code> (ES256)</td></tr>
<tr><th>Обхвати</th><td><code>openid</code>, <code>profile:read</code>, <code>saved:read</code></td></tr>
<tr><th>PKCE</th><td>задължително, само <code>S256</code></td></tr>
</table>
<p>Динамична регистрация на клиенти не се поддържа. За client_id пишете на екипа през <a href="${SITE}/about">страницата за контакт</a>.</p>
<pre><code>curl -H "Authorization: Bearer &lt;access_token&gt;" "${SITE}/api/saved-procedures"</code></pre>

<h2>Ограничения и коректност</h2>
<ul>
<li>Кеширане: публичните отговори са с <code>Cache-Control: public, max-age=60…3600</code>. Ползвайте ги, вместо да презареждате често.</li>
<li>Идентификаторите на процедурите (<code>id</code>) са стабилни между синхронизациите.</li>
<li>Не се съхраняват и не се връщат IP адреси — <code>/api/geo</code> връща само код на държава.</li>
<li>Условия за ползване: <a href="${SITE}/terms">/terms</a>. Предпочитанията за AI ползване са в <a href="/robots.txt">robots.txt</a>.</li>
</ul>
</main>
<footer>© ${BRAND} · <a href="${SITE}/terms">Условия</a> · <a href="${SITE}/privacy">Поверителност</a> · <a href="${SITE}/">Начало</a></footer>
</div></body></html>`;
}

export function apiDocsMarkdown(version = "") {
  const rows = ENDPOINT_ROWS.map(([a, b]) => `| \`${a.replace(/&lt;/g, "<").replace(/&gt;/g, ">")}\` | ${b} |`).join("\n");
  return [
    "---",
    `title: "API документация | ${BRAND}"`,
    `url: "${SITE}/docs/api"`,
    version ? `version: "${version}"` : "",
    "---",
    "",
    "# API документация",
    "",
    "Публично, безплатно API върху данните за европейско и национално финансиране в 27-те държави",
    `от ЕС. Машинно четимо описание: [\`/openapi.json\`](${SITE}/openapi.json) (OpenAPI 3.1).`,
    "",
    "> Данните не заменят официалната документация. Липсващите стойности се връщат като `null` —",
    "> това означава „няма структурирани данни“, а не нула.",
    "",
    "## Публични endpoint-и",
    "",
    "| Endpoint | Описание |",
    "| --- | --- |",
    rows,
    "",
    "Без автентикация и без ключ. Държавата се подава като двубуквен код по ISO 3166-1 alpha-2.",
    "",
    "```",
    `curl "${SITE}/api/projects?country=BG"`,
    "```",
    "",
    "## Markdown за агенти",
    "",
    "Всяка публична страница връща markdown при `Accept: text/markdown`, с `Content-Type:`",
    "`text/markdown; charset=utf-8` и заглавка `x-markdown-tokens`.",
    "",
    "```",
    `curl -H "Accept: text/markdown" "${SITE}/procedures?country=BG"`,
    "```",
    "",
    "## Автентикация (OAuth 2.1)",
    "",
    "Публичните данни не изискват автентикация. Личните данни се достъпват с authorization code",
    "+ PKCE (S256). Издаваните токени са **само за четене**.",
    "",
    `- Метаданни: [\`/.well-known/oauth-authorization-server\`](${SITE}/.well-known/oauth-authorization-server)`,
    `- OpenID Connect: [\`/.well-known/openid-configuration\`](${SITE}/.well-known/openid-configuration)`,
    `- Ресурс: [\`/.well-known/oauth-protected-resource\`](${SITE}/.well-known/oauth-protected-resource)`,
    `- Ключове: [\`/.well-known/jwks.json\`](${SITE}/.well-known/jwks.json) (ES256)`,
    "- Обхвати: `openid`, `profile:read`, `saved:read`",
    "- Динамична регистрация на клиенти не се поддържа.",
    "",
    "```",
    `curl -H "Authorization: Bearer <access_token>" "${SITE}/api/saved-procedures"`,
    "```",
    "",
    "## Свързани ресурси",
    "",
    `- [API каталог (RFC 9727)](${SITE}/.well-known/api-catalog)`,
    `- [Карта на съдържанието](${SITE}/llms.txt)`,
    `- [Здравен статус](${SITE}/api/health)`,
    `- [Условия за ползване](${SITE}/terms)`,
    "",
  ].filter((l) => l !== "").join("\n");
}
