// Админ API за таблата „API & Agents" и „SEO & Discovery".
//
// Всички отговори са no-store и изискват вече проверена админ сесия (проверката
// се прави в worker/handlers.js преди да се стигне дотук). Нищо, което излиза
// оттук, не съдържа тайни — всяко safeDetails минава през redactObject.
//
// Одитът се изпълнява НА ПАРЧЕТА: планът се записва като чакащи проверки в D1,
// а всяко „drive" изпълнява толкова, колкото се събират в бюджета. Затова
// презареждане на страницата не спира одита — истината е в базата.

import { json, nowISO, uuid } from "../util.js";
import { redactObject, safeBodyPreview, safeHeaders } from "./parsers.js";
import { GROUPS, STATUS, buildPlan, executeCheck, probe } from "./validation.js";
import { AGENT_PAGES, DISCOVERY_RESOURCES, ROUTES, SEO_PAGES, internalRoutes, protectedRoutes, publicRoutes } from "./inventory.js";
import { APP_VERSION } from "../../app/lib/version.js";
import { BUILD_ID } from "../../app/lib/build-info.js";

const NO_STORE = { "cache-control": "no-store, no-cache, must-revalidate", pragma: "no-cache" };
const ok = (data) => json({ ok: true, ...data }, 200, NO_STORE);
const fail = (code, status = 400, extra = {}) => json({ ok: false, error: code, ...extra }, status, NO_STORE);

const DRIVE_BUDGET_MS = 18_000;
const RUN_STALE_MS = 10 * 60 * 1000;
const MIN_RUN_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Достъп до D1 за валидатора
// ---------------------------------------------------------------------------

function makeDbAdapter(env) {
  return {
    async procedureSlugs() {
      const { results } = await env.DB.prepare(
        "SELECT id AS slug, country_code FROM projects ORDER BY last_updated DESC LIMIT 2000"
      ).all().catch(() => ({ results: [] }));
      return results || [];
    },
    async procedureSeoStats() {
      const one = async (sql) => {
        try { const r = await env.DB.prepare(sql).first(); return r ? Number(Object.values(r)[0]) || 0 : 0; } catch { return 0; }
      };
      const [total, withoutOfficialUrl, withoutProgram, expiredButOpen, duplicateTitles, countries] = await Promise.all([
        one("SELECT COUNT(*) FROM projects"),
        one("SELECT COUNT(*) FROM projects WHERE official_url IS NULL OR official_url = ''"),
        one("SELECT COUNT(*) FROM projects WHERE program IS NULL OR program = ''"),
        one("SELECT COUNT(*) FROM projects WHERE deadline_date IS NOT NULL AND deadline_date < date('now') AND status IN ('open','closing_soon')"),
        one("SELECT COUNT(*) FROM (SELECT name FROM projects GROUP BY name HAVING COUNT(*) > 1)"),
        one("SELECT COUNT(DISTINCT country_code) FROM projects"),
      ]);
      // Дублирани slug-ове не са възможни (id е PRIMARY KEY), но проверката се
      // прави явно, за да не се крие бъдеща регресия зад предположение.
      const duplicateSlugs = await one("SELECT COUNT(*) FROM (SELECT id FROM projects GROUP BY id HAVING COUNT(*) > 1)");
      const withDocuments = await one("SELECT COUNT(DISTINCT project_id) FROM documents");
      return { total, withoutOfficialUrl, withoutProgram, expiredButOpen, duplicateTitles, duplicateSlugs, countries, withDocuments };
    },
  };
}

async function sampleProcedurePaths(env, limit = 4) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM projects WHERE id IS NOT NULL ORDER BY last_updated DESC LIMIT ?1"
  ).bind(limit).all().catch(() => ({ results: [] }));
  return (results || []).map((r) => `/procedures/${r.id}`);
}

// ---------------------------------------------------------------------------
// Сигнали с дедупликация
// ---------------------------------------------------------------------------

// Кои проверки пораждат сигнал и колко сериозен е той.
const SIGNAL_RULES = {
  "seo.sitemap": { severity: "high" },
  "seo.sitemap.coverage": { severity: "warning" },
  "seo.robots.policy": { severity: "critical", onlyIf: (r) => r.summaryKey === "robots.blocksPublic" },
  "api.openapi": { severity: "high" },
  "api.openapi.router_match": { severity: "warning" },
  "api.catalog": { severity: "high" },
  "api.catalog.targets": { severity: "warning" },
  "api.no_private_exposure": { severity: "critical" },
  "api.oauth.metadata": { severity: "high" },
  "api.oauth.openid": { severity: "high" },
  "api.oauth.jwks": { severity: "critical" },
  "agents.link_headers.html": { severity: "warning" },
  "agents.markdown": { severity: "warning" },
  "agents.html_default": { severity: "critical" },
  "seo.canonical_host": { severity: "high" },
  "seo.structured_data": { severity: "warning" },
  "agents.procedure_fields": { severity: "warning" },
};

function signalRuleFor(code) {
  return SIGNAL_RULES[code] || SIGNAL_RULES[code.split(":")[0]] || null;
}

/**
 * Създава/обновява сигнал само при РЕАЛЕН нов проблем. Повторно засичане вдига
 * брояча вместо да пълни списъка с дубликати; преминаване в passed затваря
 * сигнала.
 */
export async function syncSignal(env, runId, r) {
  const rule = signalRuleFor(r.code);
  if (!rule) return null;
  if (rule.onlyIf && !rule.onlyIf(r)) return null;

  const key = `${r.code}|${r.resourceUrl || ""}`;
  const now = nowISO();
  const existing = await env.DB.prepare("SELECT id, state, occurrences FROM discovery_signals WHERE signal_key = ?1").bind(key).first().catch(() => null);

  if (r.status === STATUS.PASSED || r.status === STATUS.NOT_APPLICABLE) {
    if (existing && existing.state === "open") {
      await env.DB.prepare("UPDATE discovery_signals SET state='resolved', resolved_at=?1, last_seen_at=?1, last_run_id=?2 WHERE id=?3")
        .bind(now, runId, existing.id).run().catch(() => {});
      return { action: "resolved", key };
    }
    return null;
  }

  const severity = r.status === STATUS.FAILED ? rule.severity : "info";
  if (existing) {
    await env.DB.prepare(
      "UPDATE discovery_signals SET state='open', severity=?1, occurrences=occurrences+1, last_seen_at=?2, resolved_at=NULL, last_run_id=?3, summary_key=?4, summary_params_json=?5, safe_details_json=?6 WHERE id=?7"
    ).bind(severity, now, runId, r.summaryKey, JSON.stringify(r.summaryParams || {}), JSON.stringify(redactObject(r.safeDetails || {})), existing.id).run().catch(() => {});
    return { action: "updated", key };
  }
  await env.DB.prepare(
    "INSERT INTO discovery_signals (id, signal_key, category, check_code, resource_url, severity, state, summary_key, summary_params_json, safe_details_json, occurrences, first_seen_at, last_seen_at, last_run_id) VALUES (?1,?2,?3,?4,?5,?6,'open',?7,?8,?9,1,?10,?10,?11)"
  ).bind(uuid(), key, r.category, r.code, r.resourceUrl || null, severity, r.summaryKey, JSON.stringify(r.summaryParams || {}), JSON.stringify(redactObject(r.safeDetails || {})), now, runId).run().catch(() => {});
  return { action: "created", key };
}

// ---------------------------------------------------------------------------
// Изпълнение на одит
// ---------------------------------------------------------------------------

async function createRun(env, url, { groups, userId, triggerType = "manual" }) {
  const running = await env.DB.prepare(
    "SELECT id, started_at FROM agent_readiness_runs WHERE status='running' ORDER BY started_at DESC LIMIT 1"
  ).first().catch(() => null);
  if (running) {
    const age = Date.now() - new Date(running.started_at).getTime();
    // Едновременни пълни одити са забранени; заседнал одит се освобождава.
    if (age < RUN_STALE_MS) return { error: "run_in_progress", runId: running.id };
    await env.DB.prepare("UPDATE agent_readiness_runs SET status='failed', completed_at=?1 WHERE id=?2").bind(nowISO(), running.id).run().catch(() => {});
  }
  const last = await env.DB.prepare("SELECT started_at FROM agent_readiness_runs ORDER BY started_at DESC LIMIT 1").first().catch(() => null);
  if (last && Date.now() - new Date(last.started_at).getTime() < MIN_RUN_INTERVAL_MS) return { error: "rate_limited" };

  const selected = (groups || []).filter((g) => GROUPS.includes(g));
  const paths = await sampleProcedurePaths(env);
  const plan = buildPlan(selected.length ? selected : GROUPS, { sampleProcedurePaths: paths, seoPages: SEO_PAGES });

  const runId = uuid();
  const now = nowISO();
  await env.DB.prepare(
    "INSERT INTO agent_readiness_runs (id, trigger_type, triggered_by_user_id, environment, origin, groups_json, started_at, status, total_checks, application_version, build_id) VALUES (?1,?2,?3,'production',?4,?5,?6,'running',?7,?8,?9)"
  ).bind(runId, triggerType, userId || null, url.origin, JSON.stringify(selected.length ? selected : GROUPS), now, plan.length, APP_VERSION, BUILD_ID || null).run();

  for (let i = 0; i < plan.length; i++) {
    const c = plan[i];
    await env.DB.prepare(
      "INSERT INTO agent_readiness_check_results (run_id, sequence, category, check_code, params_json, status, created_at) VALUES (?1,?2,?3,?4,?5,'pending',?6)"
    ).bind(runId, i, c.category, c.code, JSON.stringify(c.params || {}), now).run();
  }
  return { runId, total: plan.length };
}

/** Изпълнява чакащи проверки в рамките на бюджета. Връща прогреса. */
async function driveRun(env, url, runId, { budgetMs = DRIVE_BUDGET_MS, fetchImpl } = {}) {
  const run = await env.DB.prepare("SELECT * FROM agent_readiness_runs WHERE id=?1").bind(runId).first();
  if (!run) return { error: "not_found" };
  if (run.status !== "running") return { done: true, run };

  const ctx = {
    origin: run.origin || url.origin,
    env,
    fetchImpl: fetchImpl || fetch,
    db: makeDbAdapter(env),
    sampleProcedurePaths: await sampleProcedurePaths(env),
  };

  const started = Date.now();
  let executed = 0;
  while (Date.now() - started < budgetMs) {
    const next = await env.DB.prepare(
      "SELECT id, sequence, category, check_code, params_json FROM agent_readiness_check_results WHERE run_id=?1 AND status='pending' ORDER BY sequence LIMIT 1"
    ).bind(runId).first().catch(() => null);
    if (!next) break;

    let params = {};
    try { params = JSON.parse(next.params_json || "{}"); } catch { params = {}; }
    await env.DB.prepare("UPDATE agent_readiness_runs SET current_category=?1, current_resource=?2 WHERE id=?3")
      .bind(next.category, params.path || next.check_code, runId).run().catch(() => {});

    const r = await executeCheck({ code: next.check_code, category: next.category, params }, ctx);
    // Всичко, което се записва, минава през редакция.
    const safeDetails = JSON.stringify(redactObject(r.safeDetails || {})).slice(0, 60_000);
    await env.DB.prepare(
      "UPDATE agent_readiness_check_results SET status=?1, resource_url=?2, response_status=?3, response_content_type=?4, duration_ms=?5, summary_key=?6, summary_params_json=?7, safe_details_json=?8, completed_at=?9 WHERE id=?10"
    ).bind(
      r.status, r.resourceUrl || null, r.responseStatus, r.responseContentType || null, r.durationMs,
      r.summaryKey, JSON.stringify(r.summaryParams || {}), safeDetails, nowISO(), next.id
    ).run();

    await syncSignal(env, runId, r).catch(() => {});
    executed++;
  }

  const counts = await env.DB.prepare(
    "SELECT status, COUNT(*) AS n FROM agent_readiness_check_results WHERE run_id=?1 GROUP BY status"
  ).bind(runId).all().catch(() => ({ results: [] }));
  const map = Object.fromEntries((counts.results || []).map((r) => [r.status, r.n]));
  const pending = map.pending || 0;
  const passed = map.passed || 0;
  const warning = map.warning || 0;
  const failed = map.failed || 0;
  const skipped = map.not_applicable || 0;

  if (pending === 0) {
    const overall = failed ? "failed" : warning ? "warning" : "passed";
    const duration = Date.now() - new Date(run.started_at).getTime();
    await env.DB.prepare(
      "UPDATE agent_readiness_runs SET status='completed', completed_at=?1, overall_status=?2, passed_checks=?3, warning_checks=?4, failed_checks=?5, skipped_checks=?6, duration_ms=?7, current_category=NULL, current_resource=NULL, report_json=?8 WHERE id=?9"
    ).bind(nowISO(), overall, passed, warning, failed, skipped, duration, JSON.stringify({ passed, warning, failed, skipped }), runId).run();
  } else {
    await env.DB.prepare(
      "UPDATE agent_readiness_runs SET passed_checks=?1, warning_checks=?2, failed_checks=?3, skipped_checks=?4 WHERE id=?5"
    ).bind(passed, warning, failed, skipped, runId).run().catch(() => {});
  }
  return { executed, pending, passed, warning, failed, skipped, done: pending === 0 };
}

// ---------------------------------------------------------------------------
// Проекции към интерфейса
// ---------------------------------------------------------------------------

function runRow(r) {
  return {
    id: r.id, triggerType: r.trigger_type, environment: r.environment, origin: r.origin,
    groups: safeJson(r.groups_json, []), startedAt: r.started_at, completedAt: r.completed_at,
    status: r.status, overallStatus: r.overall_status,
    total: r.total_checks, passed: r.passed_checks, warning: r.warning_checks,
    failed: r.failed_checks, skipped: r.skipped_checks, durationMs: r.duration_ms,
    version: r.application_version, buildId: r.build_id,
    currentCategory: r.current_category, currentResource: r.current_resource,
  };
}
function checkRow(r) {
  return {
    code: r.check_code, category: r.category, status: r.status,
    resourceUrl: r.resource_url, responseStatus: r.response_status,
    responseContentType: r.response_content_type, durationMs: r.duration_ms,
    summaryKey: r.summary_key, summaryParams: safeJson(r.summary_params_json, {}),
    safeDetails: safeJson(r.safe_details_json, {}), completedAt: r.completed_at,
    params: safeJson(r.params_json, {}),
  };
}
const safeJson = (s, fb) => { try { return JSON.parse(s || ""); } catch { return fb; } };

async function latestCompletedRun(env) {
  return env.DB.prepare("SELECT * FROM agent_readiness_runs WHERE status='completed' ORDER BY started_at DESC LIMIT 1").first().catch(() => null);
}

/**
 * Бърз преглед за първоначално зареждане на таба: конфигурация (от кода) +
 * последния РЕАЛЕН одит (от D1). Без мрежови заявки — страницата се отваря
 * веднага, а стойностите са от последната валидация, с ясна дата.
 */
async function overview(env, url) {
  const last = await latestCompletedRun(env);
  const active = await env.DB.prepare("SELECT * FROM agent_readiness_runs WHERE status='running' ORDER BY started_at DESC LIMIT 1").first().catch(() => null);
  let checks = [];
  if (last) {
    const { results } = await env.DB.prepare(
      "SELECT * FROM agent_readiness_check_results WHERE run_id=?1 ORDER BY sequence"
    ).bind(last.id).all().catch(() => ({ results: [] }));
    checks = (results || []).map(checkRow);
  }
  const { results: history } = await env.DB.prepare(
    "SELECT * FROM agent_readiness_runs ORDER BY started_at DESC LIMIT 20"
  ).all().catch(() => ({ results: [] }));
  const { results: signals } = await env.DB.prepare(
    "SELECT * FROM discovery_signals WHERE state='open' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, last_seen_at DESC LIMIT 50"
  ).all().catch(() => ({ results: [] }));

  const origin = url.origin;
  return ok({
    config: {
      origin,
      appVersion: APP_VERSION,
      buildId: BUILD_ID || null,
      apiBaseUrl: `${origin}/api`,
      openapiUrl: `${origin}/openapi.json`,
      docsUrl: `${origin}/docs/api`,
      healthUrl: `${origin}/api/health`,
      catalogUrl: `${origin}/.well-known/api-catalog`,
      sitemapUrl: `${origin}/sitemap.xml`,
      robotsUrl: `${origin}/robots.txt`,
      counts: {
        publicRoutes: publicRoutes().length,
        protectedRoutes: protectedRoutes().length,
        internalRoutes: internalRoutes().length,
        documentedRoutes: ROUTES.filter((r) => r.openapi).length,
      },
      routes: ROUTES.map((r) => ({
        id: r.id, method: r.method, path: r.path, kind: r.kind, group: r.group,
        purposeKey: r.purposeKey, auth: r.auth, contentType: r.contentType,
        cache: r.cache, openapi: r.openapi, probe: r.probe || null,
      })),
      discoveryResources: DISCOVERY_RESOURCES.map((d) => ({ ...d, url: `${origin}${d.path}` })),
      agentPages: AGENT_PAGES,
      seoPages: SEO_PAGES,
      groups: GROUPS,
      // Cloudflare zone настройките (напр. вграденият Markdown for Agents) НЕ са
      // достъпни през наличния API токен — интерфейсът го казва честно.
      cloudflare: { zoneSettingsReadable: false, markdownForAgentsSource: "worker" },
    },
    lastRun: last ? runRow(last) : null,
    activeRun: active ? runRow(active) : null,
    checks,
    history: (history || []).map(runRow),
    signals: (signals || []).map((s) => ({
      id: s.id, key: s.signal_key, category: s.category, checkCode: s.check_code,
      resourceUrl: s.resource_url, severity: s.severity, state: s.state,
      summaryKey: s.summary_key, summaryParams: safeJson(s.summary_params_json, {}),
      occurrences: s.occurrences, firstSeenAt: s.first_seen_at, lastSeenAt: s.last_seen_at,
    })),
  });
}

/** Единично тестване на публичен endpoint от таблицата (безопасно). */
async function testEndpoint(env, url, body) {
  const routeId = String((body && body.routeId) || "");
  const route = ROUTES.find((r) => r.id === routeId);
  if (!route) return fail("unknown_route", 400);
  // Само публични, четящи маршрути — админ/вътрешните никога не се probe-ват оттук.
  if (route.kind !== "public" || route.method !== "GET" || !route.probe) return fail("route_not_testable", 400);

  const target = `${url.origin}${route.probe}`;
  const p = await probe(target, { maxBytes: 60_000 });
  const links = p.headers.link || null;
  return ok({
    request: { url: target, method: "GET", headers: { accept: "*/*", "user-agent": "EuroFundingAdminValidator/1.0" } },
    response: {
      status: p.status,
      contentType: p.contentType,
      durationMs: p.durationMs,
      bytes: p.bytes,
      cache: { cacheControl: p.headers["cache-control"] || null, cfCacheStatus: p.headers["cf-cache-status"] || null, age: p.headers.age || null, vary: p.headers.vary || null },
      cors: { allowOrigin: p.headers["access-control-allow-origin"] || null },
      link: links,
      headers: p.headers,
      body: safeBodyPreview(p.body, 2500),
      error: p.error || null,
    },
    route: { id: route.id, method: route.method, path: route.path, kind: route.kind, auth: route.auth, expectedContentType: route.contentType },
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {URL} url
 * @param {string} userId  вече проверен админ (виж worker/handlers.js)
 */
export async function handleDiscoveryAdmin(request, env, url, userId, readJson) {
  const p = url.pathname;
  const method = request.method;

  if (p === "/api/admin/discovery/overview" && method === "GET") return overview(env, url);

  if (p === "/api/admin/discovery/runs" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM agent_readiness_runs ORDER BY started_at DESC LIMIT 50").all().catch(() => ({ results: [] }));
    return ok({ runs: (results || []).map(runRow) });
  }

  if (p === "/api/admin/discovery/runs" && method === "POST") {
    const body = (await readJson(request)) || {};
    const created = await createRun(env, url, { groups: body.groups, userId, triggerType: body.triggerType === "revalidate" ? "revalidate" : "manual" });
    if (created.error) return fail(created.error, created.error === "run_in_progress" ? 409 : 429, { runId: created.runId || null });
    // Първо парче веднага, за да има видим прогрес още при отваряне.
    const progress = await driveRun(env, url, created.runId, { budgetMs: 6000 });
    return ok({ runId: created.runId, total: created.total, progress });
  }

  const driveMatch = /^\/api\/admin\/discovery\/runs\/([^/]+)\/drive$/.exec(p);
  if (driveMatch && method === "POST") {
    const progress = await driveRun(env, url, decodeURIComponent(driveMatch[1]));
    if (progress.error) return fail(progress.error, 404);
    return ok({ progress });
  }

  const stopMatch = /^\/api\/admin\/discovery\/runs\/([^/]+)\/stop$/.exec(p);
  if (stopMatch && method === "POST") {
    const runId = decodeURIComponent(stopMatch[1]);
    await env.DB.prepare("UPDATE agent_readiness_runs SET status='stopped', completed_at=?1 WHERE id=?2 AND status='running'").bind(nowISO(), runId).run().catch(() => {});
    await env.DB.prepare("UPDATE agent_readiness_check_results SET status='not_applicable', summary_key='check.stopped', completed_at=?1 WHERE run_id=?2 AND status='pending'").bind(nowISO(), runId).run().catch(() => {});
    return ok({ stopped: true, runId });
  }

  const runMatch = /^\/api\/admin\/discovery\/runs\/([^/]+)$/.exec(p);
  if (runMatch && method === "GET") {
    const runId = decodeURIComponent(runMatch[1]);
    const run = await env.DB.prepare("SELECT * FROM agent_readiness_runs WHERE id=?1").bind(runId).first().catch(() => null);
    if (!run) return fail("not_found", 404);
    const { results } = await env.DB.prepare("SELECT * FROM agent_readiness_check_results WHERE run_id=?1 ORDER BY sequence").bind(runId).all().catch(() => ({ results: [] }));
    return ok({ run: runRow(run), checks: (results || []).map(checkRow) });
  }

  if (p === "/api/admin/discovery/endpoint-test" && method === "POST") {
    return testEndpoint(env, url, (await readJson(request)) || {});
  }

  if (p === "/api/admin/discovery/signals" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM discovery_signals ORDER BY CASE state WHEN 'open' THEN 0 ELSE 1 END, CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, last_seen_at DESC LIMIT 100"
    ).all().catch(() => ({ results: [] }));
    return ok({
      signals: (results || []).map((s) => ({
        id: s.id, key: s.signal_key, category: s.category, checkCode: s.check_code, resourceUrl: s.resource_url,
        severity: s.severity, state: s.state, summaryKey: s.summary_key,
        summaryParams: safeJson(s.summary_params_json, {}), safeDetails: safeJson(s.safe_details_json, {}),
        occurrences: s.occurrences, firstSeenAt: s.first_seen_at, lastSeenAt: s.last_seen_at, resolvedAt: s.resolved_at,
      })),
    });
  }

  // Данни за секцията „Procedure SEO" — реални числа от D1.
  if (p === "/api/admin/discovery/procedures" && method === "GET") {
    const db = makeDbAdapter(env);
    const stats = await db.procedureSeoStats();
    const { results } = await env.DB.prepare(
      `SELECT id, name, country_code, program, status, deadline_date, official_url, link, last_updated,
              (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) AS doc_count
       FROM projects p ORDER BY last_updated DESC LIMIT 200`
    ).all().catch(() => ({ results: [] }));
    return ok({
      stats,
      procedures: (results || []).map((r) => ({
        id: r.id, name: r.name, country: r.country_code, program: r.program, status: r.status,
        deadlineDate: r.deadline_date, officialUrl: r.official_url || r.link || null,
        lastUpdated: r.last_updated, documents: r.doc_count,
        canonical: `${url.origin}/procedures/${r.id}`,
        expiredButOpen: !!(r.deadline_date && r.deadline_date < new Date().toISOString().slice(0, 10) && ["open", "closing_soon"].includes(r.status)),
      })),
    });
  }

  return null;
}

export { driveRun, createRun, makeDbAdapter };
