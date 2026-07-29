// Единен източник на истината за маршрутите на приложението.
//
// Ползва се от ТРИ места, за да не се разминават: (1) таблицата с публични
// endpoint-и в администрацията, (2) сравнението на OpenAPI с реалния рутер,
// (3) проверката „няма ли админ/вътрешен маршрут в публичните описания".
//
// Класификация:
//   public    — умишлено публично, документира се в OpenAPI
//   protected — лични данни; сесия в браузъра или OAuth токен само за четене
//   internal  — вътрешно (HMAC/cron/админ); НЕ се документира и НЕ се публикува
//
// При добавяне на нов маршрут в worker.js/handlers.js добави го и тук — тестът
// `router_match` ще светне, ако описанието се разминава с рутера.

export const ROUTE_KIND = { PUBLIC: "public", PROTECTED: "protected", INTERNAL: "internal" };

/** @type {Array<{id:string,method:string,path:string,kind:string,group:string,purposeKey:string,auth:string,contentType:string,cache:string,openapi:boolean,probe?:string}>} */
export const ROUTES = [
  // --- Публични данни -------------------------------------------------------
  { id: "getHealth", method: "GET", path: "/api/health", kind: "public", group: "platform", purposeKey: "route.health", auth: "none", contentType: "application/json", cache: "no-store", openapi: true, probe: "/api/health" },
  { id: "listProjects", method: "GET", path: "/api/projects", kind: "public", group: "procedures", purposeKey: "route.projects", auth: "none", contentType: "application/json", cache: "public, max-age=60", openapi: true, probe: "/api/projects?country=BG" },
  { id: "getProject", method: "GET", path: "/api/project", kind: "public", group: "procedures", purposeKey: "route.project", auth: "none", contentType: "application/json", cache: "public, max-age=60", openapi: true, probe: null },
  { id: "listDocuments", method: "GET", path: "/api/documents", kind: "public", group: "procedures", purposeKey: "route.documents", auth: "none", contentType: "application/json", cache: "public, max-age=60", openapi: true, probe: null },
  { id: "listCountries", method: "GET", path: "/api/countries", kind: "public", group: "countries", purposeKey: "route.countries", auth: "none", contentType: "application/json", cache: "public, max-age=60", openapi: true, probe: "/api/countries" },
  { id: "getProfileOptions", method: "GET", path: "/api/countries/profile-options", kind: "public", group: "countries", purposeKey: "route.profileOptions", auth: "none", contentType: "application/json", cache: "public, max-age=60", openapi: true, probe: "/api/countries/profile-options?country=BG" },
  { id: "listSources", method: "GET", path: "/api/sources", kind: "public", group: "countries", purposeKey: "route.sources", auth: "none", contentType: "application/json", cache: "public, max-age=60", openapi: true, probe: "/api/sources?country=BG" },
  { id: "getPlatformStatistics", method: "GET", path: "/api/public/platform-statistics", kind: "public", group: "platform", purposeKey: "route.statistics", auth: "none", contentType: "application/json", cache: "public, max-age=300", openapi: true, probe: "/api/public/platform-statistics" },
  { id: "listChangelog", method: "GET", path: "/api/changelog", kind: "public", group: "platform", purposeKey: "route.changelog", auth: "none", contentType: "application/json", cache: "no-store", openapi: true, probe: "/api/changelog?limit=3" },
  { id: "getAiConfiguration", method: "GET", path: "/api/ai/public-configuration", kind: "public", group: "platform", purposeKey: "route.aiConfig", auth: "none", contentType: "application/json", cache: "public, max-age=300", openapi: true, probe: "/api/ai/public-configuration" },
  { id: "getGeo", method: "GET", path: "/api/geo", kind: "public", group: "countries", purposeKey: "route.geo", auth: "none", contentType: "application/json", cache: "no-store", openapi: true, probe: "/api/geo" },
  { id: "getLanguages", method: "GET", path: "/api/i18n/languages", kind: "public", group: "platform", purposeKey: "route.languages", auth: "none", contentType: "application/json", cache: "public, max-age=86400", openapi: false, probe: "/api/i18n/languages" },

  // --- Лични данни (сесия ИЛИ OAuth токен само за четене) --------------------
  { id: "getMe", method: "GET", path: "/api/auth/me", kind: "protected", group: "user", purposeKey: "route.me", auth: "session|bearer:openid", contentType: "application/json", cache: "no-store", openapi: true },
  { id: "getProfile", method: "GET", path: "/api/profile", kind: "protected", group: "user", purposeKey: "route.profile", auth: "session|bearer:profile:read", contentType: "application/json", cache: "no-store", openapi: true },
  { id: "listSaved", method: "GET", path: "/api/saved-procedures", kind: "protected", group: "user", purposeKey: "route.saved", auth: "session|bearer:saved:read", contentType: "application/json", cache: "no-store", openapi: true },
  { id: "getPreferences", method: "GET", path: "/api/preferences", kind: "protected", group: "user", purposeKey: "route.preferences", auth: "session|bearer:profile:read", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "getUserinfo", method: "GET", path: "/oauth/userinfo", kind: "protected", group: "oauth", purposeKey: "route.userinfo", auth: "bearer:openid", contentType: "application/json", cache: "no-store", openapi: true },
  { id: "putProfile", method: "PUT", path: "/api/profile", kind: "protected", group: "user", purposeKey: "route.profileWrite", auth: "session", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "saveProcedure", method: "POST", path: "/api/saved-procedures", kind: "protected", group: "user", purposeKey: "route.savedWrite", auth: "session", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "deleteAccount", method: "DELETE", path: "/api/account", kind: "protected", group: "user", purposeKey: "route.account", auth: "session", contentType: "application/json", cache: "no-store", openapi: false },

  // --- OAuth протокол (публичен по спецификация) -----------------------------
  { id: "oauthAuthorize", method: "GET", path: "/oauth/authorize", kind: "public", group: "oauth", purposeKey: "route.authorize", auth: "session", contentType: "text/html", cache: "no-store", openapi: false, probe: null },
  { id: "oauthToken", method: "POST", path: "/oauth/token", kind: "public", group: "oauth", purposeKey: "route.token", auth: "pkce", contentType: "application/json", cache: "no-store", openapi: false, probe: null },
  { id: "oauthRevoke", method: "POST", path: "/oauth/revoke", kind: "public", group: "oauth", purposeKey: "route.revoke", auth: "none", contentType: "application/json", cache: "no-store", openapi: false, probe: null },

  // --- auth.md: агентска регистрация (публично по спецификация) --------------
  // POST маршрутите НЕ се сондират — регистрацията има странични ефекти (създава
  // запис, може да изпрати имейл). Сондира се само описателният GET.
  { id: "agentAuthInfo", method: "GET", path: "/agent/auth", kind: "public", group: "agentAuth", purposeKey: "route.agentAuthInfo", auth: "none", contentType: "application/json", cache: "no-store", openapi: false, probe: "/agent/auth" },
  { id: "agentAuthRegister", method: "POST", path: "/agent/auth", kind: "public", group: "agentAuth", purposeKey: "route.agentAuthRegister", auth: "assertion", contentType: "application/json", cache: "no-store", openapi: false, probe: null },
  { id: "agentAuthClaim", method: "POST", path: "/agent/auth/claim", kind: "public", group: "agentAuth", purposeKey: "route.agentAuthClaim", auth: "none", contentType: "application/json", cache: "no-store", openapi: false, probe: null },
  { id: "agentAuthClaimComplete", method: "POST", path: "/agent/auth/claim/complete", kind: "public", group: "agentAuth", purposeKey: "route.agentAuthClaimComplete", auth: "claim_token", contentType: "application/json", cache: "no-store", openapi: false, probe: null },
  { id: "agentAuthToken", method: "POST", path: "/agent/auth/token", kind: "public", group: "agentAuth", purposeKey: "route.agentAuthToken", auth: "refresh_token", contentType: "application/json", cache: "no-store", openapi: false, probe: null },
  { id: "agentAuthRevoke", method: "POST", path: "/agent/auth/revoke", kind: "public", group: "agentAuth", purposeKey: "route.agentAuthRevoke", auth: "none", contentType: "application/json", cache: "no-store", openapi: false, probe: null },

  // --- Вътрешни: НЕ се документират и НЕ се публикуват -----------------------
  { id: "adminUsers", method: "GET", path: "/api/admin/users", kind: "internal", group: "admin", purposeKey: "route.adminUsers", auth: "session:admin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "adminSystem", method: "GET", path: "/api/admin/system", kind: "internal", group: "admin", purposeKey: "route.adminSystem", auth: "session:admin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "adminSources", method: "GET", path: "/api/admin/sources", kind: "internal", group: "admin", purposeKey: "route.adminSources", auth: "session:admin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "adminErrors", method: "GET", path: "/api/admin/errors", kind: "internal", group: "admin", purposeKey: "route.adminErrors", auth: "session:admin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "adminFeedback", method: "GET", path: "/api/admin/feedback", kind: "internal", group: "admin", purposeKey: "route.adminFeedback", auth: "session:admin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "adminAi", method: "GET", path: "/api/admin/ai/", kind: "internal", group: "admin", purposeKey: "route.adminAi", auth: "session:admin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "adminDiscovery", method: "GET", path: "/api/admin/discovery/", kind: "internal", group: "admin", purposeKey: "route.adminDiscovery", auth: "session:admin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "internalAiRunReport", method: "POST", path: "/api/internal/ai-runs/report", kind: "internal", group: "internal", purposeKey: "route.internalReport", auth: "hmac", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "internalAiPipeline", method: "POST", path: "/api/internal/ai/", kind: "internal", group: "internal", purposeKey: "route.internalPipeline", auth: "hmac", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "clientErrors", method: "POST", path: "/api/errors", kind: "internal", group: "internal", purposeKey: "route.clientErrors", auth: "same-origin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "feedback", method: "POST", path: "/api/feedback", kind: "internal", group: "internal", purposeKey: "route.feedback", auth: "same-origin", contentType: "application/json", cache: "no-store", openapi: false },
  { id: "translateBatch", method: "POST", path: "/api/i18n/translate-batch", kind: "internal", group: "internal", purposeKey: "route.translate", auth: "same-origin", contentType: "application/json", cache: "no-store", openapi: false },
];

/** Машинно четими ресурси за агенти (не са API операции). */
export const DISCOVERY_RESOURCES = [
  { id: "markdown", path: "/", standard: "Markdown content negotiation", official: true, expectType: "text/markdown", negotiate: true },
  { id: "apiCatalog", path: "/.well-known/api-catalog", standard: "RFC 9727", official: true, expectType: "application/linkset+json" },
  { id: "openapi", path: "/openapi.json", standard: "OpenAPI 3.1", official: true, expectType: "application/openapi+json" },
  { id: "apiDocs", path: "/docs/api", standard: "RFC 8631 service-doc", official: true, expectType: "text/html" },
  { id: "health", path: "/api/health", standard: "RFC 9727 status", official: true, expectType: "application/json" },
  { id: "sitemap", path: "/sitemap.xml", standard: "sitemaps.org 0.9", official: true, expectType: "application/xml" },
  { id: "robots", path: "/robots.txt", standard: "RFC 9309", official: true, expectType: "text/plain" },
  // llms.txt НЕ е официален стандарт — обозначава се като експериментален.
  { id: "llmsTxt", path: "/llms.txt", standard: "llmstxt.org", official: false, expectType: "text/markdown" },
  // auth.md също не е IETF стандарт — конвенция на WorkOS, приета от скенерите.
  { id: "authMd", path: "/auth.md", standard: "auth.md", official: false, expectType: "text/markdown" },
  // DNS-AID също не е публикуван RFC — Internet-Draft (dnsop).
  { id: "agentIndex", path: "/.well-known/agent-index.json", standard: "DNS-AID", official: false, expectType: "application/json" },
  { id: "oauthMetadata", path: "/.well-known/oauth-authorization-server", standard: "RFC 8414", official: true, expectType: "application/json" },
  { id: "openidConfiguration", path: "/.well-known/openid-configuration", standard: "OpenID Connect Discovery 1.0", official: true, expectType: "application/json" },
  { id: "protectedResource", path: "/.well-known/oauth-protected-resource", standard: "RFC 9728", official: true, expectType: "application/json" },
  { id: "jwks", path: "/.well-known/jwks.json", standard: "RFC 7517", official: true, expectType: "application/jwk-set+json" },
];

/** Публични HTML страници, които трябва да поддържат markdown. */
export const AGENT_PAGES = [
  { path: "/", typeKey: "page.home" },
  { path: "/procedures", typeKey: "page.procedureIndex" },
  { path: "/about", typeKey: "page.about" },
  { path: "/sources", typeKey: "page.sources" },
  { path: "/calendar", typeKey: "page.calendar" },
  { path: "/changelog", typeKey: "page.changelog" },
  { path: "/docs/api", typeKey: "page.apiDocs" },
];

/** Публични маршрути за SEO одит (procedure detail се добавя динамично от D1). */
export const SEO_PAGES = [
  { path: "/", typeKey: "page.home", expectStructured: false },
  { path: "/procedures", typeKey: "page.procedureIndex", expectStructured: false },
  { path: "/procedures/programs", typeKey: "page.programIndex", expectStructured: false },
  { path: "/about", typeKey: "page.about", expectStructured: false },
  { path: "/sources", typeKey: "page.sources", expectStructured: false },
  { path: "/calendar", typeKey: "page.calendar", expectStructured: false },
  { path: "/changelog", typeKey: "page.changelog", expectStructured: false },
  { path: "/terms", typeKey: "page.policy", expectStructured: false },
  { path: "/privacy", typeKey: "page.policy", expectStructured: false },
  { path: "/docs/api", typeKey: "page.apiDocs", expectStructured: false },
];

export const publicRoutes = () => ROUTES.filter((r) => r.kind === ROUTE_KIND.PUBLIC);
export const protectedRoutes = () => ROUTES.filter((r) => r.kind === ROUTE_KIND.PROTECTED);
export const internalRoutes = () => ROUTES.filter((r) => r.kind === ROUTE_KIND.INTERNAL);
export const documentedRoutes = () => ROUTES.filter((r) => r.openapi);

/** Маршрут ли е това, което НИКОГА не бива да се появява в публично описание? */
export function isNeverPublic(path) {
  const p = String(path || "");
  return p.startsWith("/api/admin") || p.startsWith("/api/internal") || p.startsWith("/admin") ||
    p.startsWith("/profile") || p.startsWith("/saved") || p.startsWith("/login");
}

/**
 * Сравнява OpenAPI документа с инвентара на рутера.
 * Връща разминаванията, без да чете мрежата — чиста функция (тестваема).
 */
export function compareOpenApiWithRouter(doc) {
  const paths = (doc && doc.paths) || {};
  const documented = new Set();
  const operationIds = [];
  const leaked = [];

  for (const [p, item] of Object.entries(paths)) {
    if (isNeverPublic(p)) leaked.push(p);
    for (const [method, op] of Object.entries(item || {})) {
      if (!/^(get|post|put|patch|delete|head|options)$/i.test(method)) continue;
      documented.add(`${method.toUpperCase()} ${p}`);
      if (op && op.operationId) operationIds.push(op.operationId);
    }
  }

  const shouldDocument = documentedRoutes().map((r) => ({ key: `${r.method} ${r.path}`, route: r }));
  const missing = shouldDocument.filter((x) => !documented.has(x.key)).map((x) => x.key);
  const knownKeys = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
  const orphaned = [...documented].filter((k) => !knownKeys.has(k));
  const undocumentedPublic = publicRoutes()
    .filter((r) => r.openapi === false)
    .map((r) => `${r.method} ${r.path}`);

  const dupIds = operationIds.filter((id, i) => operationIds.indexOf(id) !== i);

  return {
    documentedCount: documented.size,
    operationIds: operationIds.length,
    duplicateOperationIds: [...new Set(dupIds)],
    missingFromSpec: missing,
    orphanedInSpec: orphaned,
    undocumentedPublic,
    leakedPrivatePaths: leaked,
  };
}
