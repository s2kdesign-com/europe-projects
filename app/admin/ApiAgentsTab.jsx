"use client";

// Администраторски таб „API & Agents".
//
// Всяка стойност идва от реален източник: конфигурацията на приложението
// (инвентара на маршрутите), D1 или последната валидация срещу ПРОДУКЦИЯТА.
// Където няма валидация, се показва „Няма валидация" — никога измислен успех.

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useUiTr } from "../lib/i18n/ui-translate.js";
import {
  AUDIT_GROUPS, AuditProgress, Card, CheckTable, ConfirmModal, EmptyState, FormattedDate,
  InfoGrid, ReadinessScore, RunHistory, SignalList, StatusChip, SummaryCard, UrlValue,
  downloadReport, indexChecks, useDiscovery,
} from "./discovery-ui.jsx";
import { summaryText } from "./discovery-summaries.js";

const STANDARDS = {
  "api.catalog": "RFC 9727",
  "api.catalog.head": "RFC 9727",
  "api.catalog.targets": "RFC 9727",
  "api.openapi": "OpenAPI 3.1",
  "api.openapi.router_match": "OpenAPI 3.1",
  "api.oauth.metadata": "RFC 8414",
  "api.oauth.openid": "OpenID Connect Discovery 1.0",
  "api.oauth.protected_resource": "RFC 9728",
  "api.oauth.jwks": "RFC 7517",
  "agents.link_headers.html": "RFC 8288",
  "agents.link_headers.head": "RFC 8288",
  "agents.link_headers.markdown": "RFC 8288",
  "agents.link_headers.targets": "RFC 8288",
  "agents.markdown": "Content negotiation",
  "agents.llms_txt": "llmstxt.org",
  "api.health": "RFC 9727 status",
};

export default function ApiAgentsTab() {
  const tl = useUiTr();
  const { data, error, busy, progress, startAudit, stopAudit, reload } = useDiscovery("api");
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(null);

  // Новият масив при всяко рендиране обезсмисляше useMemo-то отдолу — затова
  // и самият списък е мемоизиран (react-hooks/exhaustive-deps).
  const checks = useMemo(
    () => (progress && progress.checks) || (data && data.checks) || [],
    [progress, data]
  );
  const idx = useMemo(() => indexChecks(checks), [checks]);
  const cfg = data && data.config;
  const lastRun = data && data.lastRun;
  const st = useCallback((res) => summaryText(res, tl), [tl]);

  if (error) return <section className="prof-card"><p className="chart-note"><Icon name="alert" size={14} /> {tl("Данните не могат да бъдат заредени")}: {error}</p></section>;
  if (!cfg) return <section className="prof-card"><p>{tl("Зареждане…")}</p></section>;

  const agentChecks = checks.filter((c) => c.category === "api" || c.category === "agents");
  const mdChecks = idx.all("agents.markdown");
  const catalog = idx.get("api.catalog");
  const openapi = idx.get("api.openapi");
  const routerMatch = idx.get("api.openapi.router_match");
  const linkHtml = idx.get("agents.link_headers.html");
  const linkTargets = idx.get("agents.link_headers.targets");
  const oauthMeta = idx.get("api.oauth.metadata");
  const oauthOidc = idx.get("api.oauth.openid");
  const jwks = idx.get("api.oauth.jwks");
  const protectedRes = idx.get("api.oauth.protected_resource");
  const health = idx.get("api.health");

  return (
    <>
      <ConfirmModal
        open={confirm} tl={tl}
        titleKey="Пълен одит на API и агенти"
        textKey="Одитът изпраща десетки заявки към продукционния сайт и записва резултата. Не се променят публични данни. Продължавате ли?"
        confirmKey="Стартирай одита"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); startAudit(AUDIT_GROUPS.api); }}
      />

      <AuditProgress progress={progress} tl={tl} onStop={stopAudit} />

      {/* --- Обобщение ------------------------------------------------------ */}
      <Card
        titleKey="Готовност за агенти" tl={tl}
        actions={
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirm(true)}>
              <Icon name="refresh" size={14} /> {tl(busy ? "Изпълнява се…" : "Пълен одит на API и агенти")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reload}>{tl("Обнови")}</button>
            <button type="button" className="btn btn-ghost" disabled={!checks.length}
              onClick={() => downloadReport("api-agents-audit", { run: lastRun, checks: agentChecks })}>
              {tl("Изтегли отчета")}
            </button>
          </>
        }
      >
        <ReadinessScore checks={agentChecks} tl={tl} busy={busy} onRun={() => setConfirm(true)} />
        <div className="disc-sum-grid">
          <SummaryCard tl={tl} titleKey="Публично API" status={idx.rollup(["api.health", "api.endpoint:*"])}
            value={cfg.counts.publicRoutes} hint={tl("публични маршрута")} checkedAt={idx.checkedAt("api.health", "api.endpoint:*")} />
          <SummaryCard tl={tl} titleKey="OpenAPI" status={idx.rollup(["api.openapi", "api.openapi.router_match"])}
            value={openapi && openapi.safeDetails.openapiVersion ? openapi.safeDetails.openapiVersion : "—"} checkedAt={idx.checkedAt("api.openapi", "api.openapi.router_match")} />
          <SummaryCard tl={tl} titleKey="API каталог" status={idx.rollup(["api.catalog", "api.catalog.targets", "api.catalog.head"])}
            value={catalog ? (catalog.safeDetails.entries || 0) : "—"} hint={catalog ? tl("записа в linkset") : null} checkedAt={idx.checkedAt("api.catalog", "api.catalog.targets", "api.catalog.head")} />
          <SummaryCard tl={tl} titleKey="Markdown за агенти" status={idx.rollup(["agents.markdown*", "agents.html_default"])}
            value={mdChecks.length ? `${mdChecks.filter((c) => c.status === "passed").length}/${mdChecks.length}` : "—"} hint={mdChecks.length ? tl("страници с markdown") : null} checkedAt={idx.checkedAt("agents.markdown*", "agents.html_default")} />
          <SummaryCard tl={tl} titleKey="Link заглавки" status={idx.rollup(["agents.link_headers.html", "agents.link_headers.targets"])}
            value={linkHtml ? (linkHtml.safeDetails.relations || []).length : "—"} hint={linkHtml ? tl("открити релации") : null} checkedAt={idx.checkedAt("agents.link_headers.html", "agents.link_headers.targets")} />
          <SummaryCard tl={tl} titleKey="OAuth/OIDC откриване" status={idx.rollup(["api.oauth.metadata", "api.oauth.openid", "api.oauth.jwks"])}
            value={oauthMeta && oauthMeta.safeDetails.issuer ? tl("Собствен издател") : "—"} checkedAt={idx.checkedAt("api.oauth.metadata", "api.oauth.openid", "api.oauth.jwks")} />
          <SummaryCard tl={tl} titleKey="Страници за агенти" status={idx.rollup(["agents.markdown*"])}
            value={`${cfg.agentPages.length}`} checkedAt={idx.checkedAt("agents.markdown*")} />
          <SummaryCard tl={tl} titleKey="Последна пълна валидация"
            status={lastRun ? (lastRun.overallStatus || "unknown") : "unknown"}
            value={lastRun ? <FormattedDate value={lastRun.completedAt} /> : tl("Няма")}
            hint={lastRun ? `${tl("версия")} ${lastRun.version || "—"}` : null} />
        </div>
      </Card>

      {/* --- Публично API --------------------------------------------------- */}
      <PublicApiCard cfg={cfg} health={health} checks={checks} tl={tl} lastRun={lastRun} st={st} />

      <EndpointTable cfg={cfg} checks={checks} tl={tl} onTest={setDrawer} st={st} />

      {drawer && <EndpointDrawer routeId={drawer} tl={tl} onClose={() => setDrawer(null)} />}

      {/* --- OpenAPI -------------------------------------------------------- */}
      <Card titleKey="OpenAPI спецификация" tl={tl}
        actions={<>
          <a className="btn btn-ghost" href={cfg.openapiUrl} target="_blank" rel="noopener noreferrer">{tl("Отвори документа")}</a>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["api"])}>{tl("Валидирай спрямо реалните маршрути")}</button>
        </>}>
        {!openapi ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се провери документът срещу продукцията." /> : (
          <>
            <InfoGrid tl={tl} rows={[
              ["Адрес", <UrlValue href={cfg.openapiUrl} key="u" />],
              ["Версия на OpenAPI", openapi.safeDetails.openapiVersion],
              ["Версия на API", openapi.safeDetails.infoVersion],
              ["Размер", openapi.safeDetails.bytes ? `${Math.round(openapi.safeDetails.bytes / 1024)} KB` : "—"],
              ["Операции", openapi.safeDetails.operations],
              ["Схеми", openapi.safeDetails.schemas],
              ["Групи (tags)", openapi.safeDetails.tags],
              ["Сървъри", (openapi.safeDetails.servers || []).join(", "), true],
              ["Статус", <StatusChip status={openapi.status} tl={tl} key="s" />],
              ["Последна валидация", <FormattedDate value={openapi.completedAt} key="d" />],
            ]} />
            {routerMatch && (
              <>
                <h3 className="disc-sub">{tl("Сравнение с реалния рутер")}</h3>
                <InfoGrid tl={tl} rows={[
                  ["Документирани операции", routerMatch.safeDetails.documentedCount],
                  ["Публични, но недокументирани", (routerMatch.safeDetails.undocumentedPublic || []).join(", ") || tl("няма")],
                  ["Липсват в описанието", (routerMatch.safeDetails.missingFromSpec || []).join(", ") || tl("няма")],
                  ["Описани, но липсват в рутера", (routerMatch.safeDetails.orphanedInSpec || []).join(", ") || tl("няма")],
                  ["Повтарящи се operationId", (routerMatch.safeDetails.duplicateOperationIds || []).join(", ") || tl("няма")],
                  ["Изтекли частни маршрути", (routerMatch.safeDetails.leakedPrivatePaths || []).join(", ") || tl("няма")],
                ]} />
              </>
            )}
            <p className="chart-note"><Icon name="info" size={13} /> {st(openapi)}</p>
          </>
        )}
      </Card>

      {/* --- API каталог ---------------------------------------------------- */}
      <Card titleKey="API каталог (RFC 9727)" tl={tl}
        actions={<>
          <a className="btn btn-ghost" href={cfg.catalogUrl} target="_blank" rel="noopener noreferrer">{tl("Отвори каталога")}</a>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["api"])}>{tl("Валидирай каталога")}</button>
        </>}>
        {!catalog ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се провери каталогът." /> : (
          <>
            <InfoGrid tl={tl} rows={[
              ["Адрес", <UrlValue href={cfg.catalogUrl} key="u" />],
              ["Тип съдържание", catalog.responseContentType, true],
              ["Записи в linkset", catalog.safeDetails.entries],
              ["Анкери", (catalog.safeDetails.anchors || []).join(", "), true],
              ["service-desc", (catalog.safeDetails.relations || {})["service-desc"] || 0],
              ["service-doc", (catalog.safeDetails.relations || {})["service-doc"] || 0],
              ["status", (catalog.safeDetails.relations || {}).status || 0],
              ["GET проверка", <StatusChip status={catalog.status} tl={tl} key="g" />],
              ["HEAD проверка", <StatusChip status={idx.status("api.catalog.head")} tl={tl} key="h" />],
              ["Рекламирани частни API", (catalog.safeDetails.privateAdvertised || []).length || tl("няма")],
              ["Последна успешна проверка", <FormattedDate value={catalog.completedAt} key="d" />],
            ]} />
            {linkTargetsTable(idx.get("api.catalog.targets"), tl)}
          </>
        )}
      </Card>

      {/* --- Link заглавки --------------------------------------------------- */}
      <Card titleKey="Link заглавки за откриване (RFC 8288)" tl={tl}
        actions={<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["agents"])}>{tl("Валидирай отново")}</button>}>
        {!linkHtml ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се прочетат заглавките от продукцията." /> : (
          <>
            <InfoGrid tl={tl} rows={[
              ["GET начална страница (HTML)", <StatusChip status={idx.status("agents.link_headers.html")} tl={tl} key="a" />],
              ["HEAD начална страница", <StatusChip status={idx.status("agents.link_headers.head")} tl={tl} key="b" />],
              ["Markdown отговор", <StatusChip status={idx.status("agents.link_headers.markdown")} tl={tl} key="c" />],
              ["Дублирани стойности", (linkHtml.safeDetails.duplicates || []).length || tl("няма")],
              ["Липсващи релации", (linkHtml.safeDetails.missing || []).join(", ") || tl("няма")],
            ]} />
            {linkTargetsTable(linkTargets, tl)}
          </>
        )}
      </Card>

      {/* --- Markdown за агенти ---------------------------------------------- */}
      <Card titleKey="Markdown за агенти" tl={tl}
        actions={<>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["agents"])}>{tl("Валидирай всички страници")}</button>
          <button type="button" className="btn btn-ghost" disabled={!mdChecks.length}
            onClick={() => downloadReport("markdown-agents", mdChecks)}>{tl("Изтегли отчета")}</button>
        </>}>
        <InfoGrid tl={tl} rows={[
          ["Реализация", tl("Cloudflare Worker (генерира се от D1)")],
          ["Настройка в Cloudflare", tl("Не може да се прочете с текущия API токен — проверете в таблото на Cloudflare")],
          ["Продукционен хост", cfg.origin.replace(/^https?:\/\//, ""), true],
          ["Поддържани страници", `${mdChecks.filter((c) => c.status === "passed").length} / ${mdChecks.length || cfg.agentPages.length}`],
          ["Неуспешни страници", mdChecks.filter((c) => c.status === "failed").length],
        ]} />
        {mdChecks.length ? <MarkdownTable checks={mdChecks} tl={tl} st={st} /> : <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се тества всяка страница срещу продукцията." />}
        <p className="chart-note"><Icon name="info" size={13} /> {tl("Намалението на токени е оценка спрямо размера на HTML отговора, освен ако Cloudflare не върне x-original-tokens.")}</p>
      </Card>

      {/* --- OAuth / OIDC ---------------------------------------------------- */}
      <OAuthCard tl={tl} meta={oauthMeta} oidc={oauthOidc} jwks={jwks} resource={protectedRes} origin={cfg.origin} />

      {/* --- Ресурси за откриване -------------------------------------------- */}
      <Card titleKey="Ресурси за откриване от агенти" tl={tl}>
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>{tl("Ресурс")}</th><th>{tl("Стандарт")}</th><th>{tl("Тип съдържание")}</th><th className="nowrap">{tl("Отговор")}</th><th className="nowrap">{tl("Време")}</th><th>{tl("Статус")}</th></tr></thead>
            <tbody>
              {cfg.discoveryResources.map((r) => {
                const c = resourceCheck(idx, r.id);
                return (
                  <tr key={r.id}>
                    <td><UrlValue href={r.url} /></td>
                    <td>
                      {r.standard}
                      {!r.official && <span className="disc-chip st-na" style={{ marginLeft: 6 }}>{tl("Експериментален ресурс")}</span>}
                    </td>
                    <td className="mono">{c ? c.responseContentType || "—" : "—"}</td>
                    <td className="nowrap">{c ? c.responseStatus || "—" : "—"}</td>
                    <td className="nowrap">{c && c.durationMs != null ? `${c.durationMs} ms` : "—"}</td>
                    <td><StatusChip status={c ? c.status : "unknown"} tl={tl} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* --- Всички проверки, сигнали, история -------------------------------- */}
      <Card titleKey="Всички проверки от последния одит" tl={tl}>
        <CheckTable checks={agentChecks} tl={tl} summaryText={st} standards={STANDARDS} />
      </Card>

      <Card titleKey="Отворени сигнали" tl={tl}>
        <SignalList signals={(data.signals || []).filter((s) => s.category === "api" || s.category === "agents")} tl={tl} summaryText={st} />
      </Card>

      <Card titleKey="История на валидациите" tl={tl}>
        <RunHistory history={data.history} tl={tl} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

function resourceCheck(idx, id) {
  const map = {
    markdown: "agents.markdown:/", apiCatalog: "api.catalog", openapi: "api.openapi", apiDocs: "api.docs",
    health: "api.health", sitemap: "seo.sitemap", robots: "seo.robots", llmsTxt: "agents.llms_txt",
    oauthMetadata: "api.oauth.metadata", openidConfiguration: "api.oauth.openid",
    protectedResource: "api.oauth.protected_resource", jwks: "api.oauth.jwks",
  };
  return idx.get(map[id] || id);
}

function linkTargetsTable(check, tl) {
  if (!check || !check.safeDetails || !check.safeDetails.targets) return null;
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead><tr><th>{tl("Релация")}</th><th>{tl("Цел")}</th><th>{tl("Обявен тип")}</th><th className="nowrap">{tl("Отговор")}</th><th>{tl("Реален тип")}</th><th>{tl("Валидна")}</th></tr></thead>
        <tbody>
          {check.safeDetails.targets.map((t, i) => (
            <tr key={`${t.rel}-${i}`}>
              <td className="mono">{t.rel}</td>
              <td><UrlValue href={t.target || t.href} /></td>
              <td className="mono">{t.declaredType || t.type || "—"}</td>
              <td className="nowrap">{t.responseStatus || t.status || "—"}</td>
              <td className="mono">{t.responseContentType || t.contentType || "—"}</td>
              <td><StatusChip status={t.ok ? (t.typeMatches === false ? "warning" : "passed") : "failed"} tl={tl} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownTable({ checks, tl, st }) {
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead>
          <tr>
            <th>{tl("Страница")}</th><th>HTML</th><th>Markdown</th><th>{tl("Смислено съдържание")}</th>
            <th className="nowrap">{tl("Токени")}</th><th className="nowrap">{tl("Намаление")}</th><th>{tl("Статус")}</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => {
            const d = c.safeDetails || {};
            const a = d.analysis || {};
            return (
              <tr key={c.code}>
                <td className="mono">{d.path || c.code}</td>
                <td>{d.htmlStatus === 200 ? <span className="disc-chip st-pass">200</span> : <span className="disc-chip st-fail">{d.htmlStatus || "—"}</span>}</td>
                <td>{String(d.markdownContentType || "").includes("markdown") ? <span className="disc-chip st-pass">text/markdown</span> : <span className="disc-chip st-fail">{d.markdownContentType || "—"}</span>}</td>
                <td>{a.meaningful == null ? "—" : a.meaningful
                  ? <span className="disc-chip st-pass">{a.headings} {tl("заглавия")} · {a.words} {tl("думи")}</span>
                  : <span className="disc-chip st-fail">{tl("празна SPA обвивка")}</span>}</td>
                <td className="nowrap">{d.tokens == null ? "—" : d.tokens}</td>
                <td className="nowrap">{d.reductionPercent == null ? "—" : `${d.reductionPercent}%${d.reductionIsEstimate ? "*" : ""}`}</td>
                <td><StatusChip status={c.status} tl={tl} /> <span className="disc-hint">{st(c)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PublicApiCard({ cfg, health, checks, tl, lastRun, st }) {
  const endpointChecks = checks.filter((c) => c.code.startsWith("api.endpoint:"));
  const times = endpointChecks.map((c) => c.durationMs).filter((x) => x != null);
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const errors = endpointChecks.filter((c) => c.status === "failed").length;
  const cors = checks.find((c) => c.code === "api.cors");
  return (
    <Card titleKey="Публично API" tl={tl}
      actions={<>
        <a className="btn btn-ghost" href={cfg.docsUrl} target="_blank" rel="noopener noreferrer">{tl("Документация")}</a>
        <a className="btn btn-ghost" href={cfg.openapiUrl} target="_blank" rel="noopener noreferrer">OpenAPI</a>
        <a className="btn btn-ghost" href={cfg.healthUrl} target="_blank" rel="noopener noreferrer">{tl("Статус")}</a>
      </>}>
      <InfoGrid tl={tl} rows={[
        ["Базов адрес", <UrlValue href={cfg.apiBaseUrl} key="a" />],
        ["Версия на приложението", cfg.appVersion],
        ["Build ID", cfg.buildId, true],
        ["Документирани публични маршрути", cfg.counts.documentedRoutes],
        ["Публични маршрути", cfg.counts.publicRoutes],
        ["Защитени маршрути", cfg.counts.protectedRoutes],
        ["Вътрешни (извън документацията)", cfg.counts.internalRoutes],
        ["OpenAPI", <UrlValue href={cfg.openapiUrl} key="o" />],
        ["Документация", <UrlValue href={cfg.docsUrl} key="d" />],
        ["Здравен статус", <UrlValue href={cfg.healthUrl} key="h" />],
        ["Последна успешна валидация", lastRun ? <FormattedDate value={lastRun.completedAt} key="l" /> : tl("Няма")],
        ["Средно време за отговор", avg == null ? "—" : `${avg} ms`],
        ["Грешки при последната валидация", endpointChecks.length ? `${errors} / ${endpointChecks.length}` : "—"],
        ["CORS", cors ? <StatusChip status={cors.status} tl={tl} key="c" /> : "—"],
        ["Ограничаване на честотата", tl("Няма конфигурирано на ниво приложение")],
        ["Кеширане", tl("Публичните отговори: 60–3600 s; личните: no-store")],
        ["База данни", health ? (health.safeDetails.database === "pass" ? tl("достъпна") : tl("недостъпна")) : "—"],
      ]} />
      {health && <p className="chart-note"><Icon name="info" size={13} /> {st(health)}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Таблица с публични endpoint-и + филтри
// ---------------------------------------------------------------------------

function EndpointTable({ cfg, checks, tl, onTest, st }) {
  const [q, setQ] = useState("");
  const [flt, setFlt] = useState("all");
  const [method, setMethod] = useState("all");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE = 15;

  const byRoute = useMemo(() => {
    const m = new Map();
    for (const c of checks) if (c.code.startsWith("api.endpoint:")) m.set(c.code.slice("api.endpoint:".length), c);
    return m;
  }, [checks]);

  // Вътрешните маршрути НЕ се показват като публични — виждат се само в брояча.
  const rows = useMemo(() => cfg.routes.filter((r) => r.kind !== "internal").filter((r) => {
    if (method !== "all" && r.method !== method) return false;
    if (group !== "all" && r.group !== group) return false;
    const c = byRoute.get(r.id);
    if (flt === "documented" && !r.openapi) return false;
    if (flt === "undocumented" && r.openapi) return false;
    if (flt === "public" && r.kind !== "public") return false;
    if (flt === "protected" && r.kind !== "protected") return false;
    if (flt === "cacheable" && /no-store/.test(r.cache)) return false;
    if (flt === "errors" && (!c || c.status !== "failed")) return false;
    if (q) {
      const hay = `${r.path} ${r.id} ${r.group} ${r.auth}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [cfg.routes, method, group, flt, q, byRoute]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const groups = [...new Set(cfg.routes.filter((r) => r.kind !== "internal").map((r) => r.group))];

  return (
    <Card titleKey="Публични операции" tl={tl}>
      <div className="disc-filters">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={tl("Търсене по път, operationId или група…")} aria-label={tl("Търсене")} />
        <select value={flt} onChange={(e) => { setFlt(e.target.value); setPage(0); }} aria-label={tl("Филтър")}>
          <option value="all">{tl("Всички")}</option>
          <option value="public">{tl("Само публични")}</option>
          <option value="protected">{tl("Само защитени")}</option>
          <option value="documented">{tl("Документирани")}</option>
          <option value="undocumented">{tl("Недокументирани")}</option>
          <option value="cacheable">{tl("Кешируеми")}</option>
          <option value="errors">{tl("Само грешки")}</option>
        </select>
        <select value={method} onChange={(e) => { setMethod(e.target.value); setPage(0); }} aria-label="HTTP">
          <option value="all">{tl("Всички методи")}</option>
          {["GET", "POST", "PUT", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={group} onChange={(e) => { setGroup(e.target.value); setPage(0); }} aria-label={tl("Група")}>
          <option value="all">{tl("Всички групи")}</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="disc-count">{rows.length}</span>
      </div>

      <div className="table-scroll">
        <table className="admin-table disc-endpoints">
          <thead>
            <tr>
              <th>{tl("Метод")}</th><th>{tl("Път")}</th><th>{tl("Достъп")}</th><th>{tl("Тип")}</th>
              <th>{tl("Кеш")}</th><th>OpenAPI</th><th className="nowrap">{tl("Време")}</th><th>{tl("Статус")}</th><th>{tl("Действия")}</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const c = byRoute.get(r.id);
              return (
                <tr key={r.id}>
                  <td><span className={`disc-method m-${r.method.toLowerCase()}`}>{r.method}</span></td>
                  <td className="mono">{r.path}<div className="disc-hint">{r.id}</div></td>
                  <td>{r.auth === "none" ? tl("публичен") : <span className="mono">{r.auth}</span>}</td>
                  <td className="mono">{r.contentType}</td>
                  <td className="mono">{r.cache}</td>
                  <td>{r.openapi ? <span className="disc-chip st-pass">{tl("да")}</span> : <span className="disc-chip st-na">{tl("не")}</span>}</td>
                  <td className="nowrap">{c && c.durationMs != null ? `${c.durationMs} ms` : "—"}</td>
                  <td><StatusChip status={c ? c.status : "unknown"} tl={tl} /></td>
                  <td>
                    {r.probe
                      ? <button type="button" className="btn btn-ghost btn-xs" onClick={() => onTest(r.id)}>{tl("Тествай")}</button>
                      : <span className="disc-hint">{tl("няма безопасна проба")}</span>}
                  </td>
                </tr>
              );
            })}
            {!view.length && <tr><td colSpan={9}>{tl("Няма маршрути по този филтър")}</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="admin-pager">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{tl("Предишна")}</button>
          <span>{page + 1} / {pages}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>{tl("Следваща")}</button>
        </div>
      )}
      <p className="chart-note"><Icon name="info" size={13} /> {tl("Административните и вътрешните маршрути умишлено не се показват тук и не се публикуват в OpenAPI или API каталога.")}</p>
    </Card>
  );
}

/** Безопасен изглед на реален отговор: заглавките и тялото са редактирани сървърно. */
function EndpointDrawer({ routeId, tl, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/discovery/endpoint-test", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ routeId }),
    })
      .then((r) => r.json())
      .then((d) => { if (alive) setState({ loading: false, data: d }); })
      .catch((e) => { if (alive) setState({ loading: false, error: String(e.message || e) }); });
    return () => { alive = false; };
  }, [routeId]);
  const d = state.data;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card disc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="disc-card-head">
          <h3>{tl("Отговор от продукцията")}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={tl("Затвори")}><Icon name="close" size={16} /></button>
        </div>
        {state.loading && <p>{tl("Зареждане…")}</p>}
        {state.error && <p className="chart-note">{state.error}</p>}
        {d && d.ok && (
          <>
            <InfoGrid tl={tl} rows={[
              ["Адрес", <span className="mono" key="u">{d.request.url}</span>],
              ["Метод", d.request.method],
              ["Заглавки на заявката", <span className="mono" key="h">{Object.entries(d.request.headers).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>],
              ["Код", d.response.status],
              ["Тип съдържание", d.response.contentType, true],
              ["Време", `${d.response.durationMs} ms`],
              ["Размер", `${d.response.bytes} B`],
              ["Cache-Control", d.response.cache.cacheControl, true],
              ["CF cache", d.response.cache.cfCacheStatus, true],
              ["Vary", d.response.cache.vary, true],
              ["CORS", d.response.cors.allowOrigin, true],
              ["Link", d.response.link, true],
              ["Очакван тип", d.route.expectedContentType, true],
            ]} />
            <h3 className="disc-sub">{tl("Тяло (съкратено и изчистено)")}</h3>
            <pre className="disc-json">{d.response.body.preview}{d.response.body.truncated ? "\n…" : ""}</pre>
            <p className="chart-note"><Icon name="alert" size={13} /> {tl("Бисквитки, токени и лични данни се премахват на сървъра, преди отговорът да стигне до браузъра.")}</p>
          </>
        )}
        {d && !d.ok && <p className="chart-note">{tl("Грешка")}: {d.error}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * OAuth/OIDC: интерфейсът разграничава ролите ясно и НЕ измисля възможности.
 * Показва се какво реално връща продукцията.
 */
function OAuthCard({ tl, meta, oidc, jwks, resource, origin }) {
  const d = (meta && meta.safeDetails) || {};
  const issuerIsSelf = d.issuer === origin;
  const hasAs = !!(meta && meta.status !== "not_applicable" && d.issuer);
  return (
    <Card titleKey="OAuth и OpenID Connect откриване" tl={tl}>
      <div className="disc-roles">
        <RoleRow tl={tl} label="Вход с Google (OAuth клиент)" value yes />
        <RoleRow tl={tl} label="Издава собствени токени за API" value={hasAs} yes={hasAs} />
        <RoleRow tl={tl} label="OAuth Authorization Server" value={hasAs && issuerIsSelf} yes={hasAs && issuerIsSelf} />
        <RoleRow tl={tl} label="OpenID Provider" value={!!(oidc && oidc.status !== "not_applicable" && (oidc.safeDetails || {}).issuer === origin)} yes={!!(oidc && (oidc.safeDetails || {}).issuer === origin)} />
      </div>
      {!hasAs ? (
        <EmptyState tl={tl} titleKey="Няма собствени discovery метаданни"
          textKey="Приложението е само клиент на Google за вход. Не се публикува фиктивен discovery документ." />
      ) : (
        <InfoGrid tl={tl} rows={[
          ["Издател (issuer)", d.issuer, true],
          ["Съвпада с продукционния хост", issuerIsSelf ? tl("да") : tl("НЕ — метаданните заблуждават")],
          ["Discovery адрес", <UrlValue href={`${origin}/.well-known/oauth-authorization-server`} key="u" />],
          ["OpenID конфигурация", <UrlValue href={`${origin}/.well-known/openid-configuration`} key="o" />],
          ["Метаданни на ресурса", <UrlValue href={`${origin}/.well-known/oauth-protected-resource`} key="r" />],
          ["authorization_endpoint", d.authorization_endpoint, true],
          ["token_endpoint", d.token_endpoint, true],
          ["jwks_uri", d.jwks_uri, true],
          ["userinfo_endpoint", d.userinfo_endpoint, true],
          ["grant_types_supported", (d.grant_types_supported || []).join(", "), true],
          ["scopes_supported", (d.scopes_supported || []).join(", "), true],
          ["PKCE", (d.code_challenge_methods_supported || []).join(", ") || tl("не се обявява"), true],
          ["Динамична регистрация", d.registration_endpoint ? d.registration_endpoint : tl("не се поддържа")],
          ["Публични ключове", jwks ? `${(jwks.safeDetails || {}).keyCount || 0} · ${((jwks.safeDetails || {}).algorithms || []).join(", ")}` : "—"],
          ["Ресурс", (resource && (resource.safeDetails || {}).resource) || "—", true],
          ["Последна валидация", <FormattedDate value={meta.completedAt} key="d" />],
          ["Статус", <StatusChip status={meta.status} tl={tl} key="s" />],
        ]} />
      )}
      <p className="chart-note"><Icon name="alert" size={13} /> {tl("Тук никога не се показват клиентски тайни, частни подписващи ключове, токени или сесийни данни.")}</p>
    </Card>
  );
}

function RoleRow({ tl, label, yes }) {
  return (
    <div className="disc-role">
      <span className={`disc-chip ${yes ? "st-pass" : "st-na"}`}>{yes ? tl("да") : tl("не")}</span>
      <span>{tl(label)}</span>
    </div>
  );
}
