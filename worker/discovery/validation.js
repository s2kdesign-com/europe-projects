// SiteDiscoveryValidationService — валидира РЕАЛНИТЕ продукционни отговори.
//
// Всяка проверка връща еднаква структура:
//   { code, category, status, resourceUrl, responseStatus, responseContentType,
//     durationMs, summaryKey, summaryParams, safeDetails }
// `summaryKey` е ключ за превод — не се записва готов текст на един език.
//
// Двигателят е разделен на ПЛАН и ИЗПЪЛНЕНИЕ, за да може одитът да продължи
// сървърно между заявките: планът се записва в D1 като чакащи проверки, а всяко
// „drive" изпълнява толкова, колкото се събират в бюджета за време.

import {
  analyseMarkdown, analyseSitemap, detectLeakage, duplicateLinks, extractMetadata,
  groupForAgent, isValidHreflang, parseContentSignal, parseLinkHeader, parseRobots,
  parseSitemap, robotsAllows, safeHeaders, validateJsonLd,
} from "./parsers.js";
import { AGENT_PAGES, ROUTES, compareOpenApiWithRouter, internalRoutes, isNeverPublic, publicRoutes } from "./inventory.js";
import { codeSlug } from "../../app/lib/slug.js";

export const STATUS = { PASSED: "passed", WARNING: "warning", FAILED: "failed", NOT_APPLICABLE: "not_applicable" };
export const GROUPS = ["api", "agents", "seo", "sitemap", "robots", "metadata", "structured_data", "social", "i18n_seo", "procedures"];

const AGENT_UA = "EuroFundingAdminValidator/1.0 (+https://euro-funds.eu/docs/api)";
const BROWSER_UA = "Mozilla/5.0 (compatible; EuroFundingAdminValidator/1.0)";

// ---------------------------------------------------------------------------
// Мрежов probe
// ---------------------------------------------------------------------------

/** Едно измерено извличане. Никога не хвърля — грешките стават резултат. */
export async function probe(url, { method = "GET", accept = null, ua = BROWSER_UA, maxBytes = 400_000, fetchImpl = fetch } = {}) {
  const started = Date.now();
  const headers = { "user-agent": ua };
  if (accept) headers.accept = accept;
  try {
    const res = await fetchImpl(url, { method, headers, redirect: "manual" });
    let body = "";
    if (method !== "HEAD") {
      const text = await res.text();
      body = text.length > maxBytes ? text.slice(0, maxBytes) : text;
    }
    return {
      ok: true,
      url,
      method,
      status: res.status,
      contentType: res.headers.get("content-type") || null,
      headers: safeHeaders(res.headers),
      body,
      bytes: body.length,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, url, method, status: 0, contentType: null, headers: {}, body: "", bytes: 0, durationMs: Date.now() - started, error: String((e && e.message) || e).slice(0, 200) };
  }
}

const result = (code, category, status, summaryKey, extra = {}) => ({
  code, category, status, summaryKey,
  resourceUrl: extra.resourceUrl || null,
  responseStatus: extra.responseStatus == null ? null : extra.responseStatus,
  responseContentType: extra.responseContentType || null,
  durationMs: extra.durationMs == null ? null : extra.durationMs,
  summaryParams: extra.summaryParams || {},
  safeDetails: extra.safeDetails || {},
});

const fromProbe = (p) => ({ resourceUrl: p.url, responseStatus: p.status, responseContentType: p.contentType, durationMs: p.durationMs });
const ctIs = (ct, expected) => String(ct || "").toLowerCase().split(";")[0].trim() === expected;

// ---------------------------------------------------------------------------
// План
// ---------------------------------------------------------------------------

/**
 * Изгражда списък от проверки за избраните групи. `context` идва от D1
 * (примерни процедури, брой процедури) — така планът е конкретен и стабилен.
 */
export function buildPlan(groups, context = {}) {
  const want = new Set(groups && groups.length ? groups : GROUPS);
  const plan = [];
  const add = (code, category, params = {}) => plan.push({ code, category, params });
  const sample = context.sampleProcedurePaths || [];

  if (want.has("api")) {
    add("api.health", "api");
    add("api.openapi", "api");
    add("api.openapi.router_match", "api");
    add("api.catalog", "api");
    add("api.catalog.head", "api");
    add("api.catalog.targets", "api");
    add("api.docs", "api");
    add("api.cors", "api");
    add("api.oauth.metadata", "api");
    add("api.oauth.openid", "api");
    add("api.oauth.protected_resource", "api");
    add("api.oauth.jwks", "api");
    add("api.no_private_exposure", "api");
    for (const r of publicRoutes().filter((x) => x.probe)) add(`api.endpoint:${r.id}`, "api", { routeId: r.id });
  }

  if (want.has("agents")) {
    add("agents.link_headers.html", "agents");
    add("agents.link_headers.head", "agents");
    add("agents.link_headers.markdown", "agents");
    add("agents.link_headers.targets", "agents");
    for (const p of AGENT_PAGES) add(`agents.markdown:${p.path}`, "agents", { path: p.path, typeKey: p.typeKey });
    if (sample[0]) add(`agents.markdown:${sample[0]}`, "agents", { path: sample[0], typeKey: "page.procedureDetail" });
    add("agents.llms_txt", "agents");
    add("agents.html_default", "agents");
  }

  if (want.has("sitemap")) {
    add("seo.sitemap", "sitemap");
    add("seo.sitemap.xsl", "sitemap");
    add("seo.sitemap.coverage", "sitemap");
  }

  if (want.has("robots")) {
    add("seo.robots", "robots");
    add("seo.robots.policy", "robots");
    add("seo.robots.content_signal", "robots");
  }

  if (want.has("metadata")) {
    for (const p of (context.seoPages || [])) add(`seo.metadata:${p.path}`, "metadata", { path: p.path, typeKey: p.typeKey });
    for (const p of sample.slice(0, 3)) add(`seo.metadata:${p}`, "metadata", { path: p, typeKey: "page.procedureDetail" });
    add("seo.metadata.unique_titles", "metadata");
  }

  if (want.has("structured_data")) {
    for (const p of sample.slice(0, 3)) add(`seo.structured_data:${p}`, "structured_data", { path: p });
    add("seo.structured_data:/", "structured_data", { path: "/" });
  }

  if (want.has("social")) {
    add("seo.social:/", "social", { path: "/" });
    if (sample[0]) add(`seo.social:${sample[0]}`, "social", { path: sample[0] });
    add("seo.social.image", "social");
  }

  if (want.has("i18n_seo")) {
    add("seo.hreflang:/", "i18n_seo", { path: "/" });
    add("seo.hreflang.targets", "i18n_seo");
    add("seo.hreflang.locale_pages", "i18n_seo");
  }

  if (want.has("procedures")) {
    add("seo.procedures.coverage", "procedures");
    add("seo.procedures.language", "procedures");
    for (const p of sample.slice(0, 3)) add(`agents.procedure_fields:${p}`, "procedures", { path: p });
  }

  if (want.has("seo")) {
    add("seo.performance.compression", "seo");
    add("seo.canonical_host", "seo");
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Изпълнение
// ---------------------------------------------------------------------------

/**
 * Изпълнява една проверка. `ctx` = { origin, env, fetchImpl, db }.
 * Никога не хвърля — всяка грешка става `failed` резултат.
 */
export async function executeCheck(check, ctx) {
  try {
    const handler = HANDLERS[check.code.split(":")[0]] || HANDLERS[check.code];
    if (!handler) return result(check.code, check.category, STATUS.NOT_APPLICABLE, "check.unknown");
    return await handler(check, ctx);
  } catch (e) {
    return result(check.code, check.category, STATUS.FAILED, "check.exception", {
      summaryParams: { message: String((e && e.message) || e).slice(0, 160) },
    });
  }
}

const HANDLERS = {};
const H = (code, fn) => { HANDLERS[code] = fn; };

// --- API -------------------------------------------------------------------

H("api.health", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/api/health`, { fetchImpl: ctx.fetchImpl });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "api.health.unreachable", { ...fromProbe(p) });
  let body = null;
  try { body = JSON.parse(p.body); } catch { return result(c.code, c.category, STATUS.FAILED, "api.health.invalidJson", { ...fromProbe(p) }); }
  if (!ctIs(p.contentType, "application/json")) return result(c.code, c.category, STATUS.WARNING, "api.health.contentType", { ...fromProbe(p) });
  const status = body.status === "pass" ? STATUS.PASSED : body.status === "warn" ? STATUS.WARNING : STATUS.FAILED;
  return result(c.code, c.category, status, "api.health.ok", {
    ...fromProbe(p),
    summaryParams: { version: body.version, procedures: body.procedures, countries: body.countries },
    safeDetails: { version: body.version, database: body.database, procedures: body.procedures, countries: body.countries, dataSnapshot: body.dataSnapshot, latencyMs: body.latencyMs },
  });
});

H("api.openapi", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/openapi.json`, { fetchImpl: ctx.fetchImpl, maxBytes: 800_000 });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "api.openapi.unreachable", { ...fromProbe(p) });
  let doc;
  try { doc = JSON.parse(p.body); } catch { return result(c.code, c.category, STATUS.FAILED, "api.openapi.invalidJson", { ...fromProbe(p) }); }
  const problems = [];
  if (!ctIs(p.contentType, "application/openapi+json") && !ctIs(p.contentType, "application/json")) problems.push("content_type");
  if (!/^3\.1/.test(String(doc.openapi || ""))) problems.push("version");
  const servers = (doc.servers || []).map((s) => s.url);
  if (!servers.includes(ctx.origin)) problems.push("server_url");
  const ops = Object.values(doc.paths || {}).flatMap((i) => Object.keys(i || {}).filter((m) => /^(get|post|put|patch|delete)$/i.test(m)));
  if (!ops.length) problems.push("no_operations");
  const schemas = Object.keys((doc.components && doc.components.schemas) || {});
  if (!schemas.length) problems.push("no_schemas");
  if (!(doc.components && doc.components.securitySchemes)) problems.push("no_security_schemes");
  const leaked = Object.keys(doc.paths || {}).filter(isNeverPublic);
  if (leaked.length) problems.push("private_paths");
  if (detectLeakage(p.body).length) problems.push("secrets_in_document");

  const status = leaked.length || problems.includes("secrets_in_document") || problems.includes("version") ? STATUS.FAILED
    : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "api.openapi.problems" : "api.openapi.ok", {
    ...fromProbe(p),
    summaryParams: { operations: ops.length, schemas: schemas.length, problems: problems.length },
    safeDetails: {
      openapiVersion: doc.openapi, infoVersion: doc.info && doc.info.version, bytes: p.bytes,
      operations: ops.length, schemas: schemas.length, tags: (doc.tags || []).length,
      servers, problems, leakedPaths: leaked,
    },
  });
});

H("api.openapi.router_match", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/openapi.json`, { fetchImpl: ctx.fetchImpl, maxBytes: 800_000 });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "api.openapi.unreachable", { ...fromProbe(p) });
  let doc;
  try { doc = JSON.parse(p.body); } catch { return result(c.code, c.category, STATUS.FAILED, "api.openapi.invalidJson", { ...fromProbe(p) }); }
  const cmp = compareOpenApiWithRouter(doc);
  const status = cmp.leakedPrivatePaths.length ? STATUS.FAILED
    : (cmp.missingFromSpec.length || cmp.orphanedInSpec.length || cmp.duplicateOperationIds.length) ? STATUS.WARNING
      : STATUS.PASSED;
  return result(c.code, c.category, status, "api.openapi.routerMatch", {
    ...fromProbe(p),
    summaryParams: { documented: cmp.documentedCount, missing: cmp.missingFromSpec.length, orphaned: cmp.orphanedInSpec.length },
    safeDetails: cmp,
  });
});

H("api.catalog", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/.well-known/api-catalog`, { fetchImpl: ctx.fetchImpl });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "api.catalog.unreachable", { ...fromProbe(p) });
  if (!ctIs(p.contentType, "application/linkset+json")) {
    return result(c.code, c.category, STATUS.FAILED, "api.catalog.contentType", { ...fromProbe(p), summaryParams: { expected: "application/linkset+json", actual: p.contentType } });
  }
  let doc;
  try { doc = JSON.parse(p.body); } catch { return result(c.code, c.category, STATUS.FAILED, "api.catalog.invalidJson", { ...fromProbe(p) }); }
  if (!Array.isArray(doc.linkset) || !doc.linkset.length) {
    return result(c.code, c.category, STATUS.FAILED, "api.catalog.noLinkset", { ...fromProbe(p) });
  }
  const anchors = doc.linkset.map((e) => e.anchor).filter(Boolean);
  const rels = {};
  for (const e of doc.linkset) for (const [k, v] of Object.entries(e)) if (k !== "anchor" && Array.isArray(v)) rels[k] = (rels[k] || 0) + v.length;
  const privateAdvertised = doc.linkset.flatMap((e) =>
    Object.entries(e).filter(([k]) => k !== "anchor").flatMap(([, v]) => (Array.isArray(v) ? v : [])).map((l) => l.href)
  ).filter((href) => { try { return isNeverPublic(new URL(href).pathname); } catch { return false; } });

  const missing = ["service-desc", "service-doc", "status"].filter((r) => !rels[r]);
  const status = privateAdvertised.length ? STATUS.FAILED : missing.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, missing.length ? "api.catalog.missingRels" : "api.catalog.ok", {
    ...fromProbe(p),
    summaryParams: { entries: doc.linkset.length, anchors: anchors.length, missing: missing.join(", ") },
    safeDetails: { entries: doc.linkset.length, anchors, relations: rels, missingRelations: missing, privateAdvertised, linkset: doc.linkset },
  });
});

H("api.catalog.head", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/.well-known/api-catalog`, { method: "HEAD", fetchImpl: ctx.fetchImpl });
  if (p.status !== 200) return result(c.code, c.category, STATUS.WARNING, "api.catalog.headStatus", { ...fromProbe(p) });
  const ok = ctIs(p.contentType, "application/linkset+json");
  return result(c.code, c.category, ok ? STATUS.PASSED : STATUS.WARNING, ok ? "api.catalog.headOk" : "api.catalog.headContentType", {
    ...fromProbe(p), safeDetails: { headers: p.headers },
  });
});

H("api.catalog.targets", async (c, ctx) => {
  const cat = await probe(`${ctx.origin}/.well-known/api-catalog`, { fetchImpl: ctx.fetchImpl });
  if (cat.status !== 200) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "api.catalog.unreachable", { ...fromProbe(cat) });
  let doc; try { doc = JSON.parse(cat.body); } catch { return result(c.code, c.category, STATUS.NOT_APPLICABLE, "api.catalog.invalidJson", { ...fromProbe(cat) }); }
  const targets = [];
  for (const e of doc.linkset || []) {
    for (const [rel, arr] of Object.entries(e)) {
      if (rel === "anchor" || !Array.isArray(arr)) continue;
      for (const l of arr) if (l && l.href) targets.push({ rel, href: l.href, type: l.type || null });
    }
  }
  const checked = [];
  for (const t of targets.slice(0, 12)) {
    const r = await probe(t.href, { method: "GET", fetchImpl: ctx.fetchImpl, maxBytes: 2000 });
    checked.push({ ...t, status: r.status, contentType: r.contentType, ok: r.status >= 200 && r.status < 400 });
  }
  const broken = checked.filter((t) => !t.ok);
  return result(c.code, c.category, broken.length ? STATUS.FAILED : STATUS.PASSED, broken.length ? "api.catalog.brokenTargets" : "api.catalog.targetsOk", {
    resourceUrl: cat.url, summaryParams: { checked: checked.length, broken: broken.length }, safeDetails: { targets: checked },
  });
});

H("api.docs", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/docs/api`, { fetchImpl: ctx.fetchImpl });
  const ok = p.status === 200 && ctIs(p.contentType, "text/html");
  const md = await probe(`${ctx.origin}/docs/api`, { accept: "text/markdown", ua: AGENT_UA, fetchImpl: ctx.fetchImpl });
  const mdOk = md.status === 200 && ctIs(md.contentType, "text/markdown");
  return result(c.code, c.category, ok ? (mdOk ? STATUS.PASSED : STATUS.WARNING) : STATUS.FAILED, ok ? "api.docs.ok" : "api.docs.unreachable", {
    ...fromProbe(p), safeDetails: { htmlStatus: p.status, htmlBytes: p.bytes, markdownStatus: md.status, markdownContentType: md.contentType },
  });
});

H("api.cors", async (c, ctx) => {
  const checks = [];
  for (const path of ["/openapi.json", "/.well-known/api-catalog", "/api/health"]) {
    const p = await probe(`${ctx.origin}${path}`, { fetchImpl: ctx.fetchImpl, maxBytes: 500 });
    checks.push({ path, allowOrigin: p.headers["access-control-allow-origin"] || null, status: p.status });
  }
  const missing = checks.filter((x) => !x.allowOrigin);
  return result(c.code, c.category, missing.length ? STATUS.WARNING : STATUS.PASSED, missing.length ? "api.cors.partial" : "api.cors.ok", {
    summaryParams: { withCors: checks.length - missing.length, total: checks.length }, safeDetails: { checks },
  });
});

const oauthDoc = async (c, ctx, path, requiredFields, summaryKey) => {
  const p = await probe(`${ctx.origin}${path}`, { fetchImpl: ctx.fetchImpl });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "oauth.unreachable", { ...fromProbe(p) });
  let doc; try { doc = JSON.parse(p.body); } catch { return result(c.code, c.category, STATUS.FAILED, "oauth.invalidJson", { ...fromProbe(p) }); }
  const missing = requiredFields.filter((f) => !doc[f]);
  const problems = [...missing.map((m) => `missing_${m}`)];
  // Издателят ТРЯБВА да съвпада с хоста — иначе метаданните лъжат за самоличност.
  if (doc.issuer && doc.issuer !== ctx.origin) problems.push("issuer_mismatch");
  for (const f of ["authorization_endpoint", "token_endpoint", "jwks_uri", "userinfo_endpoint"]) {
    if (doc[f] && !String(doc[f]).startsWith(ctx.origin)) problems.push(`foreign_${f}`);
  }
  if (detectLeakage(p.body).length) problems.push("secret_exposure");
  const status = problems.some((x) => x.startsWith("missing_") || x === "issuer_mismatch" || x === "secret_exposure") ? STATUS.FAILED
    : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, summaryKey, {
    ...fromProbe(p),
    summaryParams: { issuer: doc.issuer || "—", problems: problems.length },
    safeDetails: {
      issuer: doc.issuer || null, authorization_endpoint: doc.authorization_endpoint || null,
      token_endpoint: doc.token_endpoint || null, jwks_uri: doc.jwks_uri || null,
      userinfo_endpoint: doc.userinfo_endpoint || null, revocation_endpoint: doc.revocation_endpoint || null,
      grant_types_supported: doc.grant_types_supported || null, scopes_supported: doc.scopes_supported || null,
      code_challenge_methods_supported: doc.code_challenge_methods_supported || null,
      token_endpoint_auth_methods_supported: doc.token_endpoint_auth_methods_supported || null,
      registration_endpoint: doc.registration_endpoint || null,
      resource: doc.resource || null, authorization_servers: doc.authorization_servers || null,
      problems,
    },
  });
};

H("api.oauth.metadata", (c, ctx) => oauthDoc(c, ctx, "/.well-known/oauth-authorization-server", ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri", "grant_types_supported"], "oauth.metadata"));
H("api.oauth.openid", (c, ctx) => oauthDoc(c, ctx, "/.well-known/openid-configuration", ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri", "id_token_signing_alg_values_supported"], "oauth.openid"));
H("api.oauth.protected_resource", (c, ctx) => oauthDoc(c, ctx, "/.well-known/oauth-protected-resource", ["resource", "authorization_servers"], "oauth.protectedResource"));

H("api.oauth.jwks", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/.well-known/jwks.json`, { fetchImpl: ctx.fetchImpl });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "oauth.unreachable", { ...fromProbe(p) });
  let doc; try { doc = JSON.parse(p.body); } catch { return result(c.code, c.category, STATUS.FAILED, "oauth.invalidJson", { ...fromProbe(p) }); }
  const keys = doc.keys || [];
  const problems = [];
  if (!keys.length) problems.push("no_keys");
  // Критично: частният компонент „d" НИКОГА не бива да е публикуван.
  if (keys.some((k) => k.d)) problems.push("private_key_exposed");
  if (keys.some((k) => !k.kid)) problems.push("missing_kid");
  const status = problems.includes("private_key_exposed") ? STATUS.FAILED : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, "oauth.jwks", {
    ...fromProbe(p),
    summaryParams: { keys: keys.length },
    safeDetails: { keyCount: keys.length, algorithms: [...new Set(keys.map((k) => k.alg).filter(Boolean))], curves: [...new Set(keys.map((k) => k.crv).filter(Boolean))], problems },
  });
});

H("api.no_private_exposure", async (c, ctx) => {
  // Админ маршрутите трябва да са недостъпни без сесия (401/403), не 200.
  const findings = [];
  for (const r of internalRoutes().filter((x) => x.method === "GET").slice(0, 6)) {
    const p = await probe(`${ctx.origin}${r.path}`, { fetchImpl: ctx.fetchImpl, maxBytes: 1500 });
    const exposed = p.status === 200 && !/unauthorized|forbidden/i.test(p.body);
    findings.push({ path: r.path, status: p.status, exposed });
  }
  const bad = findings.filter((f) => f.exposed);
  return result(c.code, c.category, bad.length ? STATUS.FAILED : STATUS.PASSED, bad.length ? "api.private.exposed" : "api.private.protected", {
    summaryParams: { checked: findings.length, exposed: bad.length }, safeDetails: { findings },
  });
});

H("api.endpoint", async (c, ctx) => {
  const route = ROUTES.find((r) => r.id === c.params.routeId);
  if (!route || !route.probe) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "api.endpoint.noProbe");
  const p = await probe(`${ctx.origin}${route.probe}`, { fetchImpl: ctx.fetchImpl, maxBytes: 120_000 });
  const problems = [];
  if (p.status !== 200) problems.push("status");
  if (!ctIs(p.contentType, route.contentType)) problems.push("content_type");
  let body = null;
  if (ctIs(p.contentType, "application/json")) {
    try { body = JSON.parse(p.body); } catch { problems.push("invalid_json"); }
    if (body && body.ok === false) problems.push("not_ok");
  }
  const leaks = detectLeakage(p.body);
  if (leaks.length) problems.push("leakage");
  const status = problems.includes("status") || problems.includes("invalid_json") || problems.includes("leakage") ? STATUS.FAILED
    : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "api.endpoint.problems" : "api.endpoint.ok", {
    ...fromProbe(p),
    summaryParams: { path: route.path, ms: p.durationMs },
    safeDetails: { routeId: route.id, method: route.method, path: route.path, probe: route.probe, bytes: p.bytes, cacheControl: p.headers["cache-control"] || null, problems, leaks },
  });
});

// --- Агенти ----------------------------------------------------------------

const REQUIRED_RELS = ["api-catalog", "service-desc", "service-doc"];

async function linkHeaderCheck(c, ctx, { method = "GET", accept = null, ua = BROWSER_UA }) {
  const p = await probe(`${ctx.origin}/`, { method, accept, ua, fetchImpl: ctx.fetchImpl, maxBytes: 2000 });
  const links = parseLinkHeader(p.headers.link);
  const rels = [...new Set(links.map((l) => l.rel))];
  const missing = REQUIRED_RELS.filter((r) => !rels.includes(r));
  const dups = duplicateLinks(links);
  const status = !links.length ? STATUS.FAILED : missing.length ? STATUS.WARNING : dups.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, links.length ? (missing.length ? "agents.link.missing" : "agents.link.ok") : "agents.link.none", {
    ...fromProbe(p),
    summaryParams: { relations: rels.length, missing: missing.join(", ") },
    safeDetails: { method, accept, relations: rels, links, missing, duplicates: dups },
  });
}

H("agents.link_headers.html", (c, ctx) => linkHeaderCheck(c, ctx, { accept: "text/html" }));
H("agents.link_headers.head", (c, ctx) => linkHeaderCheck(c, ctx, { method: "HEAD", accept: "text/html" }));
H("agents.link_headers.markdown", (c, ctx) => linkHeaderCheck(c, ctx, { accept: "text/markdown", ua: AGENT_UA }));

H("agents.link_headers.targets", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/`, { accept: "text/html", fetchImpl: ctx.fetchImpl, maxBytes: 1000 });
  const links = parseLinkHeader(p.headers.link);
  const checked = [];
  for (const l of links.slice(0, 12)) {
    const r = await probe(l.target, { fetchImpl: ctx.fetchImpl, maxBytes: 1500, accept: l.type && l.type.includes("markdown") ? "text/markdown" : null, ua: l.type && l.type.includes("markdown") ? AGENT_UA : BROWSER_UA });
    const declared = String(l.type || "").split(";")[0].trim();
    const actual = String(r.contentType || "").split(";")[0].trim();
    checked.push({ rel: l.rel, target: l.target, declaredType: l.type, responseStatus: r.status, responseContentType: r.contentType, typeMatches: !declared || declared === actual, ok: r.status >= 200 && r.status < 400 });
  }
  const broken = checked.filter((t) => !t.ok);
  const mismatched = checked.filter((t) => t.ok && !t.typeMatches);
  const status = broken.length ? STATUS.FAILED : mismatched.length ? STATUS.WARNING : checked.length ? STATUS.PASSED : STATUS.NOT_APPLICABLE;
  return result(c.code, c.category, status, broken.length ? "agents.link.broken" : mismatched.length ? "agents.link.typeMismatch" : "agents.link.targetsOk", {
    resourceUrl: `${ctx.origin}/`, summaryParams: { checked: checked.length, broken: broken.length, mismatched: mismatched.length }, safeDetails: { targets: checked },
  });
});

H("agents.markdown", async (c, ctx) => {
  const path = c.params.path;
  const url = `${ctx.origin}${path}`;
  const html = await probe(url, { accept: "text/html", fetchImpl: ctx.fetchImpl, maxBytes: 200_000 });
  const md = await probe(url, { accept: "text/markdown", ua: AGENT_UA, fetchImpl: ctx.fetchImpl, maxBytes: 200_000 });

  const htmlOk = html.status === 200 && ctIs(html.contentType, "text/html");
  const mdIsMarkdown = md.status === 200 && ctIs(md.contentType, "text/markdown");
  const analysis = mdIsMarkdown ? analyseMarkdown(md.body) : null;
  const leaks = mdIsMarkdown ? detectLeakage(md.body) : [];
  const tokens = md.headers["x-markdown-tokens"] ? Number(md.headers["x-markdown-tokens"]) : null;
  const originalTokens = md.headers["x-original-tokens"] ? Number(md.headers["x-original-tokens"]) : null;
  const vary = String(md.headers.vary || "");

  const problems = [];
  if (!htmlOk) problems.push("html_default");
  if (!mdIsMarkdown) problems.push("no_markdown");
  if (analysis && !analysis.meaningful) problems.push("spa_shell");
  if (analysis && analysis.links === 0) problems.push("no_links");
  if (mdIsMarkdown && !/accept/i.test(vary)) problems.push("vary");
  if (mdIsMarkdown && tokens == null) problems.push("no_token_header");
  if (leaks.length) problems.push("leakage");

  const status = leaks.length || problems.includes("html_default") ? STATUS.FAILED
    : problems.includes("no_markdown") || problems.includes("spa_shell") ? STATUS.FAILED
      : problems.length ? STATUS.WARNING : STATUS.PASSED;

  // Спестени токени спрямо HTML: изчисляваме само ако Cloudflare не е дал
  // x-original-tokens — и го обозначаваме като оценка, не като официална стойност.
  const htmlTokensEstimate = htmlOk ? Math.ceil(html.bytes / 4) : null;
  const reduction = tokens && (originalTokens || htmlTokensEstimate)
    ? Math.round((1 - tokens / (originalTokens || htmlTokensEstimate)) * 1000) / 10 : null;

  return result(c.code, c.category, status, problems.length ? "agents.markdown.problems" : "agents.markdown.ok", {
    resourceUrl: url, responseStatus: md.status, responseContentType: md.contentType, durationMs: md.durationMs,
    summaryParams: { path, tokens: tokens == null ? "—" : tokens },
    safeDetails: {
      path, typeKey: c.params.typeKey || null,
      htmlStatus: html.status, htmlContentType: html.contentType, htmlBytes: html.bytes,
      markdownStatus: md.status, markdownContentType: md.contentType, markdownBytes: md.bytes,
      vary: md.headers.vary || null, cacheControl: md.headers["cache-control"] || null,
      tokens, originalTokens, reductionPercent: reduction,
      reductionIsEstimate: originalTokens == null,
      analysis, problems, leaks,
    },
  });
});

H("agents.llms_txt", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/llms.txt`, { fetchImpl: ctx.fetchImpl });
  if (p.status === 404) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "agents.llms.absent", { ...fromProbe(p) });
  if (p.status !== 200) return result(c.code, c.category, STATUS.WARNING, "agents.llms.unreachable", { ...fromProbe(p) });
  const a = analyseMarkdown(p.body);
  const hasSummary = /^>\s+/m.test(p.body);
  const status = a.headings && a.links && hasSummary ? STATUS.PASSED : STATUS.WARNING;
  return result(c.code, c.category, status, "agents.llms.ok", {
    ...fromProbe(p),
    summaryParams: { links: a.links },
    // llms.txt НЕ е официален стандарт — интерфейсът го обозначава като експериментален.
    safeDetails: { official: false, standard: "llmstxt.org", headings: a.headings, links: a.links, hasSummary, bytes: p.bytes },
  });
});

H("agents.html_default", async (c, ctx) => {
  // Регресия: браузърска заявка НЕ бива да получава markdown.
  const checks = [];
  for (const path of ["/", "/procedures", "/about"]) {
    const p = await probe(`${ctx.origin}${path}`, { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", fetchImpl: ctx.fetchImpl, maxBytes: 1500 });
    checks.push({ path, status: p.status, contentType: p.contentType, isHtml: ctIs(p.contentType, "text/html") });
  }
  const bad = checks.filter((x) => !x.isHtml);
  return result(c.code, c.category, bad.length ? STATUS.FAILED : STATUS.PASSED, bad.length ? "agents.htmlDefault.broken" : "agents.htmlDefault.ok", {
    summaryParams: { checked: checks.length, broken: bad.length }, safeDetails: { checks },
  });
});

H("agents.procedure_fields", async (c, ctx) => {
  const url = `${ctx.origin}${c.params.path}`;
  const md = await probe(url, { accept: "text/markdown", ua: AGENT_UA, fetchImpl: ctx.fetchImpl, maxBytes: 200_000 });
  if (!ctIs(md.contentType, "text/markdown")) return result(c.code, c.category, STATUS.FAILED, "procedures.noMarkdown", { ...fromProbe(md) });
  const body = md.body;
  const fields = {
    title: /^# .+/m.test(body),
    identifier: /Идентификатор/i.test(body),
    country: /Държава/i.test(body),
    program: /Програма/i.test(body),
    status: /Статус/i.test(body),
    deadline: /Краен срок/i.test(body),
    eligible: /Допустими кандидати/i.test(body),
    budget: /Бюджет/i.test(body),
    documents: /## Документи/i.test(body),
    officialSource: /## Официален източник/i.test(body),
    lastUpdate: /Последна промяна/i.test(body),
    aiDisclaimer: /не заменят официалната документация/i.test(body),
  };
  const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);
  const essential = ["title", "identifier", "status", "officialSource", "aiDisclaimer"];
  const missingEssential = missing.filter((m) => essential.includes(m));
  const leaks = detectLeakage(body);
  const status = leaks.length || missingEssential.length ? STATUS.FAILED : missing.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, missing.length ? "procedures.missingFields" : "procedures.complete", {
    ...fromProbe(md),
    summaryParams: { path: c.params.path, missing: missing.length },
    safeDetails: { path: c.params.path, fields, missing, missingEssential, leaks },
  });
});

// --- Sitemap ---------------------------------------------------------------

H("seo.sitemap", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/sitemap.xml`, { fetchImpl: ctx.fetchImpl, maxBytes: 3_000_000 });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "sitemap.unreachable", { ...fromProbe(p) });
  const parsed = parseSitemap(p.body);
  const a = analyseSitemap(parsed, { origin: ctx.origin, privateMatcher: isNeverPublic });
  const problems = [];
  if (!ctIs(p.contentType, "application/xml") && !ctIs(p.contentType, "text/xml")) problems.push("content_type");
  if (!parsed.hasXmlDeclaration) problems.push("xml_declaration");
  if (!parsed.hasNamespace) problems.push("namespace");
  if (!a.total) problems.push("empty");
  if (a.duplicates.length) problems.push("duplicates");
  if (a.invalid.length) problems.push("invalid_urls");
  if (a.wrongHost.length) problems.push("wrong_host");
  if (a.privateUrls.length) problems.push("private_urls");
  if (a.withQuery.length) problems.push("query_urls");
  if (a.badLastmod.length) problems.push("bad_lastmod");
  if (a.overLimit) problems.push("over_limit");

  const critical = ["empty", "private_urls", "wrong_host", "namespace"];
  const status = problems.some((x) => critical.includes(x)) ? STATUS.FAILED : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "sitemap.problems" : "sitemap.ok", {
    ...fromProbe(p),
    summaryParams: { total: a.total, problems: problems.length },
    safeDetails: {
      total: a.total, unique: a.unique, byType: a.byType, withLastmod: a.withLastmod, newestLastmod: a.newestLastmod,
      duplicates: a.duplicates.slice(0, 20), duplicateCount: a.duplicates.length,
      invalid: a.invalid.slice(0, 20), invalidCount: a.invalid.length,
      wrongHost: a.wrongHost.slice(0, 20), privateUrls: a.privateUrls.slice(0, 20),
      withQuery: a.withQuery.slice(0, 20), badLastmod: a.badLastmod.slice(0, 20),
      hasStylesheet: parsed.hasStylesheet, bytes: parsed.bytes, contentType: p.contentType, problems,
    },
  });
});

H("seo.sitemap.xsl", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/sitemap.xsl`, { fetchImpl: ctx.fetchImpl, maxBytes: 8000 });
  // XSLT се сервира валидно и като application/xml — решава съдържанието.
  const ok = p.status === 200 && (/xsl/i.test(String(p.contentType || "")) || /<xsl:stylesheet/i.test(p.body));
  return result(c.code, c.category, ok ? STATUS.PASSED : p.status === 404 ? STATUS.NOT_APPLICABLE : STATUS.WARNING, ok ? "sitemap.xsl.ok" : "sitemap.xsl.missing", { ...fromProbe(p) });
});

H("seo.sitemap.coverage", async (c, ctx) => {
  // Сравнява процедурите в D1 с тези в sitemap-а — реални числа, не оценки.
  const p = await probe(`${ctx.origin}/sitemap.xml`, { fetchImpl: ctx.fetchImpl, maxBytes: 3_000_000 });
  if (p.status !== 200) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "sitemap.unreachable", { ...fromProbe(p) });
  const parsed = parseSitemap(p.body);
  const inSitemap = new Set(parsed.entries.map((e) => { try { return new URL(e.loc).pathname; } catch { return ""; } }).filter((x) => /^\/procedures\/[^/]+$/.test(x)));
  const rows = ctx.db ? await ctx.db.procedureSlugs() : [];
  // Sitemap-ът публикува КАНОНИЧНИЯ слъг (codeSlug), а не суровия id — иначе
  // процедури с „:" или кирилица в id-то биха изглеждали като липсващи.
  const missing = rows.filter((r) => !inSitemap.has(`/procedures/${codeSlug(r.slug)}`));
  const status = !rows.length ? STATUS.NOT_APPLICABLE : missing.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, missing.length ? "sitemap.coverage.missing" : "sitemap.coverage.ok", {
    resourceUrl: p.url,
    summaryParams: { total: rows.length, inSitemap: rows.length - missing.length, missing: missing.length },
    safeDetails: { databaseProcedures: rows.length, sitemapProcedures: inSitemap.size, missing: missing.slice(0, 25).map((m) => codeSlug(m.slug)), missingCount: missing.length },
  });
});

// --- robots ----------------------------------------------------------------

H("seo.robots", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/robots.txt`, { fetchImpl: ctx.fetchImpl, maxBytes: 20_000 });
  if (p.status !== 200) return result(c.code, c.category, STATUS.FAILED, "robots.unreachable", { ...fromProbe(p) });
  const parsed = parseRobots(p.body);
  const problems = [];
  if (!ctIs(p.contentType, "text/plain")) problems.push("content_type");
  if (!parsed.sitemaps.length) problems.push("no_sitemap");
  if (parsed.sitemaps.some((s) => !s.startsWith(ctx.origin))) problems.push("foreign_sitemap");
  if (parsed.unknown.length) problems.push("unknown_directives");
  const status = problems.includes("no_sitemap") ? STATUS.WARNING : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "robots.problems" : "robots.ok", {
    ...fromProbe(p),
    summaryParams: { groups: parsed.groups.length, sitemaps: parsed.sitemaps.length },
    safeDetails: { groups: parsed.groups, sitemaps: parsed.sitemaps, unknown: parsed.unknown, contentType: p.contentType, problems },
  });
});

const CRAWLERS = [
  { id: "generic", ua: "*", kind: "search" },
  { id: "Googlebot", ua: "Googlebot", kind: "search" },
  { id: "Bingbot", ua: "Bingbot", kind: "search" },
  { id: "GPTBot", ua: "GPTBot", kind: "ai" },
  { id: "ClaudeBot", ua: "ClaudeBot", kind: "ai" },
  { id: "PerplexityBot", ua: "PerplexityBot", kind: "ai" },
  { id: "facebookexternalhit", ua: "facebookexternalhit", kind: "social" },
  { id: "Twitterbot", ua: "Twitterbot", kind: "social" },
];

H("seo.robots.policy", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/robots.txt`, { fetchImpl: ctx.fetchImpl, maxBytes: 20_000 });
  if (p.status !== 200) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "robots.unreachable", { ...fromProbe(p) });
  const parsed = parseRobots(p.body);
  const mustAllow = ["/", "/procedures", "/procedures/example-slug", "/about", "/sources", "/sitemap.xml"];
  const mustBlock = ["/admin", "/profile", "/saved", "/login"];
  const rows = [];
  for (const crawler of CRAWLERS) {
    const g = groupForAgent(parsed, crawler.ua);
    const allowed = mustAllow.filter((path) => robotsAllows(g, path));
    const blocked = mustBlock.filter((path) => !robotsAllows(g, path));
    rows.push({
      crawler: crawler.id, kind: crawler.kind, hasOwnGroup: !!(g && g.agents.some((a) => a.toLowerCase() === crawler.ua.toLowerCase())),
      publicAllowed: allowed.length, publicTotal: mustAllow.length,
      privateBlocked: blocked.length, privateTotal: mustBlock.length,
      contentSignal: g && g.contentSignal ? parseContentSignal(g.contentSignal) : null,
      blockedPublicPaths: mustAllow.filter((path) => !robotsAllows(g, path)),
      exposedPrivatePaths: mustBlock.filter((path) => robotsAllows(g, path)),
    });
  }
  const blockingPublic = rows.filter((r) => r.blockedPublicPaths.length);
  const exposingPrivate = rows.filter((r) => r.exposedPrivatePaths.length);
  const status = blockingPublic.length ? STATUS.FAILED : exposingPrivate.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, blockingPublic.length ? "robots.blocksPublic" : exposingPrivate.length ? "robots.exposesPrivate" : "robots.policyOk", {
    resourceUrl: p.url,
    summaryParams: { crawlers: rows.length, blocking: blockingPublic.length },
    safeDetails: { crawlers: rows },
  });
});

H("seo.robots.content_signal", async (c, ctx) => {
  const p = await probe(`${ctx.origin}/robots.txt`, { fetchImpl: ctx.fetchImpl, maxBytes: 20_000 });
  if (p.status !== 200) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "robots.unreachable", { ...fromProbe(p) });
  const parsed = parseRobots(p.body);
  const withSignal = parsed.groups.filter((g) => g.contentSignal);
  if (!withSignal.length) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "robots.noContentSignal", { resourceUrl: p.url, safeDetails: { declared: false } });
  const signals = withSignal.map((g) => ({ agents: g.agents, signal: parseContentSignal(g.contentSignal), raw: g.contentSignal }));
  const known = ["search", "ai-input", "ai-train"];
  const incomplete = signals.filter((s) => known.some((k) => !(k in s.signal)));
  return result(c.code, c.category, incomplete.length ? STATUS.WARNING : STATUS.PASSED, "robots.contentSignal", {
    resourceUrl: p.url, summaryParams: { groups: signals.length }, safeDetails: { declared: true, signals, incomplete: incomplete.length },
  });
});

// --- Метаданни / structured data / social / hreflang -----------------------

async function fetchMeta(ctx, path) {
  const p = await probe(`${ctx.origin}${path}`, { accept: "text/html", fetchImpl: ctx.fetchImpl, maxBytes: 400_000 });
  return { p, meta: p.status === 200 ? extractMetadata(p.body) : null };
}

H("seo.metadata", async (c, ctx) => {
  const path = c.params.path;
  const { p, meta } = await fetchMeta(ctx, path);
  if (!meta) return result(c.code, c.category, STATUS.FAILED, "metadata.unreachable", { ...fromProbe(p) });
  const problems = [];
  if (!meta.title || meta.title.length < 10) problems.push("title");
  if (meta.title && meta.title.length > 70) problems.push("title_long");
  if (!meta.description || meta.description.length < 50) problems.push("description");
  if (meta.description && meta.description.length > 300) problems.push("description_long");
  if (meta.canonicalCount !== 1) problems.push(meta.canonicalCount === 0 ? "canonical_missing" : "canonical_multiple");
  if (meta.canonical && !meta.canonical.startsWith(ctx.origin)) problems.push("canonical_host");
  if (meta.canonical && /[?&](utm_|fbclid|gclid)/.test(meta.canonical)) problems.push("canonical_tracking");
  if (meta.h1Count === 0) problems.push("h1_missing");
  if (meta.h1Count > 1) problems.push("h1_multiple");
  if (!meta.og.title) problems.push("og_title");
  if (!meta.og.description) problems.push("og_description");
  if (!meta.og.image) problems.push("og_image");
  if (!meta.twitter.card) problems.push("twitter_card");
  if (!meta.lang) problems.push("lang");
  if (/noindex/i.test(meta.robots || "")) problems.push("noindex");

  const critical = ["canonical_missing", "canonical_host", "noindex", "title"];
  const status = problems.some((x) => critical.includes(x)) ? STATUS.FAILED : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "metadata.problems" : "metadata.ok", {
    ...fromProbe(p),
    summaryParams: { path, problems: problems.length },
    safeDetails: {
      path, typeKey: c.params.typeKey || null, title: meta.title, titleLength: meta.title ? meta.title.length : 0,
      description: meta.description, descriptionLength: meta.description ? meta.description.length : 0,
      canonical: meta.canonical, canonicalCount: meta.canonicalCount, robots: meta.robots, lang: meta.lang,
      h1: meta.h1, h1Count: meta.h1Count, og: meta.og, twitter: meta.twitter,
      structuredDataTypes: meta.jsonLd.map((b) => b.type).filter(Boolean),
      hreflangCount: meta.alternates.length, problems,
    },
  });
});

H("seo.metadata.unique_titles", async (c, ctx) => {
  const paths = (ctx.sampleProcedurePaths || []).slice(0, 6);
  if (!paths.length) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "metadata.noSamples");
  const titles = [];
  for (const path of paths) {
    const { p, meta } = await fetchMeta(ctx, path);
    if (meta) titles.push({ path, title: meta.title, status: p.status });
  }
  const counts = new Map();
  for (const t of titles) counts.set(t.title, (counts.get(t.title) || 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  return result(c.code, c.category, dups.length ? STATUS.WARNING : STATUS.PASSED, dups.length ? "metadata.duplicateTitles" : "metadata.uniqueTitles", {
    summaryParams: { checked: titles.length, duplicates: dups.length }, safeDetails: { titles, duplicates: dups.map(([t, n]) => ({ title: t, count: n })) },
  });
});

H("seo.structured_data", async (c, ctx) => {
  const path = c.params.path;
  const { p, meta } = await fetchMeta(ctx, path);
  if (!meta) return result(c.code, c.category, STATUS.FAILED, "metadata.unreachable", { ...fromProbe(p) });
  if (!meta.jsonLd.length) {
    return result(c.code, c.category, STATUS.WARNING, "structured.none", { ...fromProbe(p), summaryParams: { path }, safeDetails: { path, blocks: 0, types: [] } });
  }
  const validated = meta.jsonLd.map((b) => validateJsonLd(b, { origin: ctx.origin }));
  const invalid = validated.filter((v) => v.problems.length);
  const status = validated.some((v) => v.problems.includes("invalid_json") || v.problems.includes("context")) ? STATUS.FAILED
    : invalid.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, invalid.length ? "structured.problems" : "structured.ok", {
    ...fromProbe(p),
    summaryParams: { path, blocks: meta.jsonLd.length, problems: invalid.length },
    safeDetails: { path, blocks: meta.jsonLd.length, types: validated.map((v) => v.type), validated },
  });
});

H("seo.social", async (c, ctx) => {
  const path = c.params.path;
  const { p, meta } = await fetchMeta(ctx, path);
  if (!meta) return result(c.code, c.category, STATUS.FAILED, "metadata.unreachable", { ...fromProbe(p) });
  const problems = [];
  for (const f of ["title", "description", "type", "url", "image"]) if (!meta.og[f]) problems.push(`og_${f}`);
  if (!meta.twitter.card) problems.push("twitter_card");
  if (meta.og.url && !meta.og.url.startsWith(ctx.origin)) problems.push("og_url_host");
  const status = problems.length > 2 ? STATUS.FAILED : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "social.problems" : "social.ok", {
    ...fromProbe(p),
    summaryParams: { path, problems: problems.length },
    safeDetails: { path, og: meta.og, twitter: meta.twitter, problems },
  });
});

H("seo.social.image", async (c, ctx) => {
  const { meta } = await fetchMeta(ctx, "/");
  const src = meta && meta.og.image;
  if (!src) return result(c.code, c.category, STATUS.FAILED, "social.noImage");
  const p = await probe(src, { method: "HEAD", fetchImpl: ctx.fetchImpl });
  const ok = p.status === 200;
  // HEAD невинаги връща content-length — тогава размерът е неизвестен, не нула.
  const bytes = p.headers["content-length"] ? Number(p.headers["content-length"]) : null;
  const problems = [];
  if (!ok) problems.push("unreachable");
  if (bytes && bytes > 5 * 1024 * 1024) problems.push("too_large");
  if (!/image\//.test(String(p.contentType || ""))) problems.push("content_type");
  return result(c.code, c.category, ok ? (problems.length ? STATUS.WARNING : STATUS.PASSED) : STATUS.FAILED, "social.image", {
    ...fromProbe(p), summaryParams: { bytes: bytes == null ? "неизвестен" : bytes }, safeDetails: { url: src, bytes, contentType: p.contentType, problems },
  });
});

H("seo.hreflang", async (c, ctx) => {
  const path = c.params.path;
  const { p, meta } = await fetchMeta(ctx, path);
  if (!meta) return result(c.code, c.category, STATUS.FAILED, "metadata.unreachable", { ...fromProbe(p) });
  const alts = meta.alternates;
  if (!alts.length) return result(c.code, c.category, STATUS.WARNING, "hreflang.none", { ...fromProbe(p), safeDetails: { path, alternates: [] } });
  const invalidCodes = alts.filter((a) => !isValidHreflang(a.hreflang)).map((a) => a.hreflang);
  const hasDefault = alts.some((a) => a.hreflang === "x-default");
  const foreignHost = alts.filter((a) => !a.href.startsWith(ctx.origin)).map((a) => a.href);
  const problems = [];
  if (invalidCodes.length) problems.push("invalid_codes");
  if (!hasDefault) problems.push("no_x_default");
  if (foreignHost.length) problems.push("foreign_host");
  const status = invalidCodes.length || foreignHost.length ? STATUS.FAILED : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "hreflang.problems" : "hreflang.ok", {
    ...fromProbe(p),
    summaryParams: { path, count: alts.length },
    safeDetails: { path, alternates: alts, invalidCodes, hasDefault, foreignHost, problems, pageLang: meta.lang },
  });
});

H("seo.hreflang.targets", async (c, ctx) => {
  const { meta } = await fetchMeta(ctx, "/");
  const alts = (meta && meta.alternates) || [];
  if (!alts.length) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "hreflang.none");
  const checked = [];
  for (const a of alts.slice(0, 8)) {
    const r = await probe(a.href, { accept: "text/html", fetchImpl: ctx.fetchImpl, maxBytes: 200_000 });
    const m = r.status === 200 ? extractMetadata(r.body) : null;
    // Реципрочност: целевата страница трябва да сочи обратно към същия набор.
    const reciprocal = m ? m.alternates.some((x) => x.hreflang === "x-default" || x.href.startsWith(ctx.origin)) : false;
    checked.push({ hreflang: a.hreflang, href: a.href, status: r.status, lang: m ? m.lang : null, reciprocal, ok: r.status === 200 });
  }
  const broken = checked.filter((x) => !x.ok);
  const noReciprocal = checked.filter((x) => x.ok && !x.reciprocal);
  const status = broken.length ? STATUS.FAILED : noReciprocal.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, broken.length ? "hreflang.broken" : noReciprocal.length ? "hreflang.noReciprocal" : "hreflang.targetsOk", {
    summaryParams: { checked: checked.length, broken: broken.length }, safeDetails: { targets: checked },
  });
});

H("seo.hreflang.locale_pages", async (c, ctx) => {
  const rows = [];
  for (const loc of ["bg", "en", "de"]) {
    const r = await probe(`${ctx.origin}/${loc}`, { accept: "text/html", fetchImpl: ctx.fetchImpl, maxBytes: 200_000 });
    const m = r.status === 200 ? extractMetadata(r.body) : null;
    rows.push({ locale: loc, status: r.status, htmlLang: m ? m.lang : null, title: m ? m.title : null, canonical: m ? m.canonical : null, langMatches: m ? m.lang === loc : false });
  }
  const missing = rows.filter((r) => r.status !== 200);
  const mismatched = rows.filter((r) => r.status === 200 && !r.langMatches);
  const status = missing.length ? STATUS.FAILED : mismatched.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, missing.length ? "hreflang.localeMissing" : mismatched.length ? "hreflang.langMismatch" : "hreflang.localeOk", {
    summaryParams: { locales: rows.length, mismatched: mismatched.length }, safeDetails: { locales: rows },
  });
});

// --- Общи SEO / производителност -------------------------------------------

H("seo.performance.compression", async (c, ctx) => {
  // Реални измервания на отговора; полевите Core Web Vitals НЕ се измислят.
  const rows = [];
  for (const path of ["/", "/procedures", "/sitemap.xml"]) {
    const p = await probe(`${ctx.origin}${path}`, { accept: "text/html", fetchImpl: ctx.fetchImpl, maxBytes: 3_000_000 });
    rows.push({
      path, status: p.status, bytes: p.bytes, ttfbMs: p.durationMs,
      contentEncoding: p.headers["content-encoding"] || null,
      cacheControl: p.headers["cache-control"] || null,
      cfCacheStatus: p.headers["cf-cache-status"] || null,
    });
  }
  const slow = rows.filter((r) => r.ttfbMs > 1500);
  return result(c.code, c.category, slow.length ? STATUS.WARNING : STATUS.PASSED, "performance.measured", {
    summaryParams: { pages: rows.length, slow: slow.length },
    // fieldDataAvailable=false → интерфейсът показва „няма полеви данни", а не измислени стойности.
    safeDetails: { measurements: rows, fieldDataAvailable: false, labDataAvailable: false },
  });
});

H("seo.canonical_host", async (c, ctx) => {
  const rows = [];
  for (const path of ["/", "/procedures", "/about"]) {
    const { p, meta } = await fetchMeta(ctx, path);
    rows.push({ path, status: p.status, canonical: meta ? meta.canonical : null, ok: !!(meta && meta.canonical && meta.canonical.startsWith(ctx.origin)) });
  }
  const bad = rows.filter((r) => !r.ok);
  return result(c.code, c.category, bad.length ? STATUS.FAILED : STATUS.PASSED, bad.length ? "canonical.wrongHost" : "canonical.ok", {
    summaryParams: { checked: rows.length, bad: bad.length }, safeDetails: { pages: rows, expectedOrigin: ctx.origin },
  });
});

// --- Процедури (от D1, не от мрежата) --------------------------------------

H("seo.procedures.language", async (c, ctx) => {
  // Регресия v2.48.1: страниците обявяваха `lang="bg"` дори при съдържание на
  // езика на официалния източник. Проверява се срещу реалния HTML.
  if (!ctx.db || !ctx.db.procedureLanguages) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "procedures.noDatabase");
  const rows = await ctx.db.procedureLanguages(6);
  if (!rows.length) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "procedures.noSamples");
  const checked = [];
  for (const r of rows) {
    // Адресът е каноничният слъг, не суровият id (id-тата съдържат „:" и точки).
    const p = await probe(`${ctx.origin}/procedures/${codeSlug(r.slug)}`, { accept: "text/html", fetchImpl: ctx.fetchImpl, maxBytes: 120_000 });
    if (p.status !== 200) { checked.push({ slug: codeSlug(r.slug), expected: r.language, actual: null, status: p.status, ok: false }); continue; }
    const meta = extractMetadata(p.body);
    const actual = String(meta.lang || "").toLowerCase();
    const expected = String(r.language || "bg").toLowerCase();
    checked.push({ slug: codeSlug(r.slug), expected, actual, status: p.status, ok: actual === expected });
  }
  const wrong = checked.filter((x) => !x.ok);
  return result(c.code, c.category, wrong.length ? STATUS.WARNING : STATUS.PASSED, wrong.length ? "procedures.langMismatch" : "procedures.langOk", {
    summaryParams: { checked: checked.length, wrong: wrong.length },
    safeDetails: { pages: checked, mismatched: wrong },
  });
});

H("seo.procedures.coverage", async (c, ctx) => {
  if (!ctx.db) return result(c.code, c.category, STATUS.NOT_APPLICABLE, "procedures.noDatabase");
  const stats = await ctx.db.procedureSeoStats();
  const problems = [];
  if (stats.duplicateSlugs > 0) problems.push("duplicate_slugs");
  if (stats.duplicateTitles > 0) problems.push("duplicate_titles");
  if (stats.withoutOfficialUrl > 0) problems.push("missing_official_url");
  if (stats.expiredButOpen > 0) problems.push("expired_open");
  const status = stats.duplicateSlugs > 0 ? STATUS.FAILED : problems.length ? STATUS.WARNING : STATUS.PASSED;
  return result(c.code, c.category, status, problems.length ? "procedures.problems" : "procedures.ok", {
    summaryParams: { total: stats.total, problems: problems.length },
    safeDetails: { ...stats, problems },
  });
});

