"use client";

// Администраторски таб „SEO & Discovery".
//
// Всички числа идват от D1 или от валидация срещу продукцията. Където няма
// реални данни (напр. полеви Core Web Vitals), това се казва изрично вместо да
// се показва измислена стойност.

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import { useUiTr } from "../lib/i18n/ui-translate.js";
import {
  AUDIT_GROUPS, AuditProgress, Card, CheckTable, ConfirmModal, EmptyState, FormattedDate,
  InfoGrid, ReadinessScore, RunHistory, SignalList, StatusChip, SummaryCard, UrlValue,
  downloadReport, indexChecks, useDiscovery,
} from "./discovery-ui.jsx";
import { summaryText } from "./discovery-summaries.js";

const SEO_CATEGORIES = ["seo", "sitemap", "robots", "metadata", "structured_data", "social", "i18n_seo", "procedures"];

const AI_STANDARDS = {
  "agents.markdown": "Content negotiation",
  "agents.html_default": "HTTP",
  "agents.link_headers.html": "RFC 8288",
  "api.catalog": "RFC 9727",
  "api.openapi": "OpenAPI 3.1",
  "api.health": "RFC 9727 status",
  "seo.sitemap": "sitemaps.org 0.9",
  "seo.robots": "RFC 9309",
  "seo.robots.content_signal": "contentsignals.org",
  "seo.canonical_host": "RFC 6596",
  "seo.structured_data": "schema.org",
  "agents.procedure_fields": "—",
  "api.oauth.metadata": "RFC 8414",
  "api.no_private_exposure": "—",
  "agents.llms_txt": "llmstxt.org",
};

export default function SeoDiscoveryTab() {
  const tl = useUiTr();
  const { data, error, busy, progress, startAudit, stopAudit, reload } = useDiscovery("seo");
  const [confirm, setConfirm] = useState(false);
  const [procData, setProcData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/discovery/procedures", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json()).then((d) => setProcData(d.ok ? d : null)).catch(() => setProcData(null));
  }, []);

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

  const seoChecks = checks.filter((c) => SEO_CATEGORIES.includes(c.category));
  const sitemap = idx.get("seo.sitemap");
  const coverage = idx.get("seo.sitemap.coverage");
  const robots = idx.get("seo.robots");
  const policy = idx.get("seo.robots.policy");
  const signal = idx.get("seo.robots.content_signal");
  const metaChecks = idx.all("seo.metadata").filter((c) => c.code.startsWith("seo.metadata:"));
  const sdChecks = idx.all("seo.structured_data").filter((c) => c.code.startsWith("seo.structured_data:"));
  const socialChecks = idx.all("seo.social").filter((c) => c.code.startsWith("seo.social:"));
  const hreflang = idx.get("seo.hreflang:/");
  const perf = idx.get("seo.performance.compression");
  const sm = (sitemap && sitemap.safeDetails) || {};

  const withCanonical = metaChecks.filter((c) => (c.safeDetails || {}).canonicalCount === 1).length;
  const withStructured = metaChecks.filter((c) => ((c.safeDetails || {}).structuredDataTypes || []).length).length;
  const validMeta = metaChecks.filter((c) => c.status === "passed").length;
  const warnings = seoChecks.filter((c) => c.status === "warning").length;
  const critical = seoChecks.filter((c) => c.status === "failed").length;

  return (
    <>
      <ConfirmModal
        open={confirm} tl={tl}
        titleKey="Пълен SEO одит"
        textKey="Одитът чете sitemap-а, robots.txt и десетки публични страници от продукцията и записва резултата. Не се променя съдържание. Продължавате ли?"
        confirmKey="Стартирай одита"
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); startAudit(AUDIT_GROUPS.seo); }}
      />

      <AuditProgress progress={progress} tl={tl} onStop={stopAudit} />

      <Card titleKey="Обобщение" tl={tl}
        actions={<>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setConfirm(true)}>
            <Icon name="refresh" size={14} /> {tl(busy ? "Изпълнява се…" : "Пълен SEO одит")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={reload}>{tl("Обнови")}</button>
          <button type="button" className="btn btn-ghost" disabled={!seoChecks.length}
            onClick={() => downloadReport("seo-audit", { run: lastRun, checks: seoChecks })}>{tl("Изтегли отчета")}</button>
        </>}>
        <ReadinessScore checks={seoChecks} tl={tl} busy={busy} onRun={() => setConfirm(true)} />
        <div className="disc-sum-grid">
          <SummaryCard tl={tl} titleKey="Адреси в sitemap" status={idx.status("seo.sitemap")} value={sm.total == null ? "—" : sm.total} checkedAt={lastRun && lastRun.completedAt} />
          <SummaryCard tl={tl} titleKey="Адреси на процедури" status={idx.status("seo.sitemap.coverage")} value={(sm.byType && sm.byType.procedure) || "—"} checkedAt={lastRun && lastRun.completedAt} />
          <SummaryCard tl={tl} titleKey="Индексируеми публични страници" status={idx.rollup(["seo.metadata:*"])} value={metaChecks.length ? metaChecks.filter((c) => !/noindex/i.test((c.safeDetails || {}).robots || "")).length : "—"} checkedAt={lastRun && lastRun.completedAt} />
          <SummaryCard tl={tl} titleKey="Страници с валиден каноничен адрес" status={idx.status("seo.canonical_host")} value={metaChecks.length ? `${withCanonical}/${metaChecks.length}` : "—"} checkedAt={lastRun && lastRun.completedAt} />
          <SummaryCard tl={tl} titleKey="Страници със структурирани данни" status={idx.rollup(["seo.structured_data:*"])} value={metaChecks.length ? `${withStructured}/${metaChecks.length}` : "—"} checkedAt={lastRun && lastRun.completedAt} />
          <SummaryCard tl={tl} titleKey="Страници с пълни метаданни" status={idx.rollup(["seo.metadata:*"])} value={metaChecks.length ? `${validMeta}/${metaChecks.length}` : "—"} checkedAt={lastRun && lastRun.completedAt} />
          <SummaryCard tl={tl} titleKey="Предупреждения" status={warnings ? "warning" : seoChecks.length ? "passed" : "unknown"} value={seoChecks.length ? warnings : "—"} />
          <SummaryCard tl={tl} titleKey="Критични проблеми" status={critical ? "failed" : seoChecks.length ? "passed" : "unknown"} value={seoChecks.length ? critical : "—"} />
          <SummaryCard tl={tl} titleKey="Последен SEO одит" status={lastRun ? (lastRun.overallStatus || "unknown") : "unknown"}
            value={lastRun ? <FormattedDate value={lastRun.completedAt} /> : tl("Няма")} />
        </div>
      </Card>

      {/* --- Sitemap --------------------------------------------------------- */}
      <Card titleKey="Динамичен XML sitemap" tl={tl}
        actions={<>
          <a className="btn btn-ghost" href={cfg.sitemapUrl} target="_blank" rel="noopener noreferrer">{tl("Отвори")}</a>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["sitemap"])}>{tl("Валидирай")}</button>
        </>}>
        {!sitemap ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се прочете sitemap-ът от продукцията." /> : (
          <>
            <InfoGrid tl={tl} rows={[
              ["Адрес", <UrlValue href={cfg.sitemapUrl} key="u" />],
              ["Начин на генериране", tl("Динамично от Worker-а")],
              ["Източник на данни", tl("Cloudflare D1 (процедури + програмни страници)")],
              ["Кеш", "s-maxage=3600"],
              ["Тип съдържание", sitemap.responseContentType, true],
              ["Общо адреси", sm.total],
              ["Уникални адреси", sm.unique],
              ["Адреси на процедури", (sm.byType || {}).procedure || 0],
              ["Програмни страници", (sm.byType || {}).programLanding || 0],
              ["Статични адреси", (sm.byType || {}).static || 0],
              ["С lastmod", sm.withLastmod],
              ["Най-нов lastmod", sm.newestLastmod],
              ["Дублирани адреси", sm.duplicateCount || 0],
              ["Невалидни адреси", sm.invalidCount || 0],
              ["Адреси към друг хост", (sm.wrongHost || []).length],
              ["Частни маршрути", (sm.privateUrls || []).length],
              ["Адреси с query", (sm.withQuery || []).length],
              ["XSL изглед", <StatusChip status={idx.status("seo.sitemap.xsl")} tl={tl} key="x" />],
              ["Размер", sm.bytes ? `${Math.round(sm.bytes / 1024)} KB` : "—"],
              ["Последна валидация", <FormattedDate value={sitemap.completedAt} key="d" />],
            ]} />
            {coverage && (
              <p className="chart-note"><Icon name={coverage.status === "passed" ? "check" : "alert"} size={13} /> {st(coverage)}</p>
            )}
            {!!(sm.duplicates || []).length && <ListBlock tl={tl} titleKey="Дублирани адреси" items={sm.duplicates} />}
            {!!(sm.invalid || []).length && <ListBlock tl={tl} titleKey="Невалидни адреси" items={sm.invalid} />}
            {!!(sm.privateUrls || []).length && <ListBlock tl={tl} titleKey="Частни маршрути в sitemap" items={sm.privateUrls} />}
          </>
        )}
      </Card>

      {/* --- robots ---------------------------------------------------------- */}
      <Card titleKey="Robots и политика за обхождане" tl={tl}
        actions={<>
          <a className="btn btn-ghost" href={cfg.robotsUrl} target="_blank" rel="noopener noreferrer">{tl("Отвори")}</a>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["robots"])}>{tl("Валидирай")}</button>
        </>}>
        {!robots ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се прочете robots.txt от продукцията." /> : (
          <>
            <InfoGrid tl={tl} rows={[
              ["Адрес", <UrlValue href={cfg.robotsUrl} key="u" />],
              ["Тип съдържание", robots.responseContentType, true],
              ["Групи правила", ((robots.safeDetails || {}).groups || []).length],
              ["Sitemap препратки", ((robots.safeDetails || {}).sitemaps || []).join(", "), true],
              ["Неразпознати директиви", ((robots.safeDetails || {}).unknown || []).length || tl("няма")],
              ["Content Signals", signal && signal.status !== "not_applicable"
                ? Object.entries(((signal.safeDetails || {}).signals || [{}])[0].signal || {}).map(([k, v]) => `${k}=${v}`).join(", ")
                : tl("не са декларирани"), true],
            ]} />
            {policy && policy.safeDetails && policy.safeDetails.crawlers && (
              <div className="table-scroll">
                <table className="admin-table">
                  <thead><tr>
                    <th>{tl("Обхождащ агент")}</th><th>{tl("Вид")}</th><th>{tl("Собствена група")}</th>
                    <th>{tl("Публично съдържание")}</th><th>{tl("Частни маршрути")}</th><th>Content-Signal</th><th>{tl("Статус")}</th>
                  </tr></thead>
                  <tbody>
                    {policy.safeDetails.crawlers.map((c) => (
                      <tr key={c.crawler}>
                        <td className="mono">{c.crawler}</td>
                        <td>{tl(c.kind === "ai" ? "AI агент" : c.kind === "social" ? "Социален" : "Търсачка")}</td>
                        <td>{c.hasOwnGroup ? tl("да") : tl("наследява *")}</td>
                        <td>{c.publicAllowed}/{c.publicTotal}</td>
                        <td>{c.privateBlocked}/{c.privateTotal}</td>
                        <td className="mono">{c.contentSignal ? Object.entries(c.contentSignal).map(([k, v]) => `${k}=${v}`).join(", ") : "—"}</td>
                        <td><StatusChip status={c.blockedPublicPaths.length ? "failed" : c.exposedPrivatePaths.length ? "warning" : "passed"} tl={tl} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="chart-note"><Icon name="info" size={13} /> {tl("Политиката за AI агенти се променя само изрично — тук не се блокира и не се разрешава автоматично нищо.")}</p>
          </>
        )}
      </Card>

      {/* --- Метаданни ------------------------------------------------------- */}
      <MetadataTable checks={metaChecks} tl={tl} st={st} busy={busy} onValidate={() => startAudit(["metadata"])} origin={cfg.origin} />

      {/* --- Procedure SEO --------------------------------------------------- */}
      <ProcedureSeo data={procData} coverage={coverage} tl={tl} origin={cfg.origin} />

      {/* --- Структурирани данни --------------------------------------------- */}
      <Card titleKey="Структурирани данни" tl={tl}
        actions={<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["structured_data"])}>{tl("Валидирай структурираните данни")}</button>}>
        {!sdChecks.length ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се прочетат JSON-LD блоковете от продукцията." /> : (
          <div className="table-scroll">
            <table className="admin-table">
              <thead><tr><th>{tl("Страница")}</th><th>{tl("Тип схема")}</th><th>{tl("Блокове")}</th><th>{tl("Проблеми")}</th><th>{tl("Статус")}</th><th className="nowrap">{tl("Проверено")}</th></tr></thead>
              <tbody>
                {sdChecks.map((c) => {
                  const d = c.safeDetails || {};
                  return (
                    <tr key={c.code}>
                      <td className="mono">{d.path}</td>
                      <td>{(d.types || []).filter(Boolean).join(", ") || tl("няма")}</td>
                      <td>{d.blocks || 0}</td>
                      <td>{(d.validated || []).flatMap((v) => v.problems).join(", ") || tl("няма")}</td>
                      <td><StatusChip status={c.status} tl={tl} /></td>
                      <td className="nowrap"><FormattedDate value={c.completedAt} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="chart-note"><Icon name="info" size={13} /> {tl("Използват се само схеми, които отговарят на реалното съдържание — не се добавят типове само заради SEO.")}</p>
      </Card>

      {/* --- Социални метаданни ---------------------------------------------- */}
      <Card titleKey="Социални визитки" tl={tl}
        actions={<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["social"])}>{tl("Валидирай")}</button>}>
        {!socialChecks.length ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се прочетат og: и twitter: таговете от продукцията." /> : (
          <>
            {socialChecks.map((c) => <SocialPreview key={c.code} check={c} tl={tl} />)}
            <p className="chart-note"><Icon name="info" size={13} /> {tl("Прегледите са приблизителни — реалният изглед се определя от съответната платформа.")}</p>
          </>
        )}
      </Card>

      {/* --- Многоезичност ---------------------------------------------------- */}
      <Card titleKey="Многоезично SEO" tl={tl}
        actions={<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => startAudit(["i18n_seo"])}>{tl("Валидирай")}</button>}>
        {!hreflang ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се проверят езиковите алтернативи." /> : (
          <>
            <InfoGrid tl={tl} rows={[
              ["Езици на интерфейса", "25 + bg"],
              ["Индексируеми езици", "bg, en, de"],
              ["hreflang връзки на началната страница", ((hreflang.safeDetails || {}).alternates || []).length],
              ["x-default", (hreflang.safeDetails || {}).hasDefault ? tl("да") : tl("не")],
              ["Невалидни езикови кодове", ((hreflang.safeDetails || {}).invalidCodes || []).join(", ") || tl("няма")],
              ["Езикови цели към друг хост", ((hreflang.safeDetails || {}).foreignHost || []).length || tl("няма")],
              ["Реципрочност", <StatusChip status={idx.status("seo.hreflang.targets")} tl={tl} key="r" />],
              ["Езикови страници /bg /en /de", <StatusChip status={idx.status("seo.hreflang.locale_pages")} tl={tl} key="l" />],
              ["Държава ≠ език", tl("Спазено — изборът на държава не сменя езика")],
            ]} />
            {localeTable(idx.get("seo.hreflang.locale_pages"), tl)}
          </>
        )}
      </Card>

      {/* --- Производителност -------------------------------------------------- */}
      <Card titleKey="Техническо SEO и производителност" tl={tl}>
        {!perf ? <EmptyState tl={tl} titleKey="Още няма измервания" textKey="Пуснете одит, за да се измерят реалните отговори." /> : (
          <>
            <div className="table-scroll">
              <table className="admin-table">
                <thead><tr><th>{tl("Страница")}</th><th className="nowrap">TTFB</th><th className="nowrap">{tl("Размер")}</th><th>{tl("Компресия")}</th><th>Cache-Control</th><th>CF cache</th></tr></thead>
                <tbody>
                  {((perf.safeDetails || {}).measurements || []).map((m) => (
                    <tr key={m.path}>
                      <td className="mono">{m.path}</td>
                      <td className="nowrap">{m.ttfbMs} ms</td>
                      <td className="nowrap">{Math.round(m.bytes / 1024)} KB</td>
                      <td className="mono">{m.contentEncoding || tl("не се обявява")}</td>
                      <td className="mono">{m.cacheControl || "—"}</td>
                      <td className="mono">{m.cfCacheStatus || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <InfoGrid tl={tl} rows={[
              ["LCP, CLS, INP (полеви данни)", tl("Няма налични — не е свързан източник на полеви данни")],
              ["Лабораторни измервания", tl("Няма налични")],
              ["Измерено от одита", tl("TTFB и размер на отговора — реални стойности")],
            ]} />
            <p className="chart-note"><Icon name="alert" size={13} /> {tl("Core Web Vitals не се показват, защото няма свързан източник на полеви данни. Стойности не се измислят.")}</p>
          </>
        )}
      </Card>

      {/* --- AI агенти -------------------------------------------------------- */}
      <Card titleKey="Оптимизация за AI агенти и обхождащи" tl={tl}
        note={tl("Този раздел е за ВЪНШНИ агенти и обхождащи, които четат публичната платформа. Вътрешните AI модели на системата се управляват в раздел „AI модели“.")}>
        <CheckTable
          checks={checks.filter((c) => AI_STANDARDS[c.code.split(":")[0]] !== undefined)}
          tl={tl} summaryText={st} standards={AI_STANDARDS}
        />
      </Card>

      <Card titleKey="Всички проверки от последния одит" tl={tl}>
        <CheckTable checks={seoChecks} tl={tl} summaryText={st} />
      </Card>

      <Card titleKey="Отворени сигнали" tl={tl}>
        <SignalList signals={(data.signals || []).filter((s) => SEO_CATEGORIES.includes(s.category))} tl={tl} summaryText={st} />
      </Card>

      <Card titleKey="История на валидациите" tl={tl}>
        <RunHistory history={data.history} tl={tl} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

function ListBlock({ tl, titleKey, items }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="disc-list">
      <button type="button" className="log-expand" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {tl(titleKey)} ({items.length}) <Icon name="chevronRight" size={12} style={{ transform: open ? "rotate(90deg)" : "none" }} />
      </button>
      {open && <ul>{items.slice(0, 50).map((u) => <li key={u} className="mono">{u}</li>)}</ul>}
    </div>
  );
}

function MetadataTable({ checks, tl, st, busy, onValidate, origin }) {
  const [flt, setFlt] = useState("all");
  const rows = checks.filter((c) => {
    if (flt === "errors") return c.status === "failed";
    if (flt === "warnings") return c.status === "warning";
    if (flt === "noindex") return /noindex/i.test((c.safeDetails || {}).robots || "");
    return true;
  });
  return (
    <Card titleKey="Одит на метаданните" tl={tl}
      actions={<>
        <select value={flt} onChange={(e) => setFlt(e.target.value)} aria-label={tl("Филтър")}>
          <option value="all">{tl("Всички")}</option>
          <option value="errors">{tl("Само грешки")}</option>
          <option value="warnings">{tl("Само предупреждения")}</option>
          <option value="noindex">{tl("Неиндексируеми")}</option>
        </select>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onValidate}>{tl("Валидирай")}</button>
      </>}>
      {!checks.length ? <EmptyState tl={tl} titleKey="Още няма валидация" textKey="Пуснете одит, за да се прочетат метаданните от продукцията." /> : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{tl("Адрес")}</th><th>{tl("Вид страница")}</th><th>{tl("Език")}</th><th>{tl("Заглавие")}</th>
                <th>{tl("Описание")}</th><th>{tl("Каноничен")}</th><th>robots</th><th>OG</th><th>Twitter</th>
                <th>{tl("Структурирани данни")}</th><th>H1</th><th>{tl("Статус")}</th><th className="nowrap">{tl("Проверено")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const d = c.safeDetails || {};
                const yes = (v) => v ? <span className="disc-chip st-pass">{tl("да")}</span> : <span className="disc-chip st-fail">{tl("не")}</span>;
                return (
                  <tr key={c.code}>
                    <td><UrlValue href={`${origin}${d.path || ""}`} label={d.path} /></td>
                    <td>{tl(pageTypeLabel(d.typeKey))}</td>
                    <td className="mono">{d.lang || "—"}</td>
                    <td title={d.title || ""}>{d.titleLength ? `${d.titleLength} ${tl("зн.")}` : tl("липсва")}</td>
                    <td title={d.description || ""}>{d.descriptionLength ? `${d.descriptionLength} ${tl("зн.")}` : tl("липсва")}</td>
                    <td>{d.canonicalCount === 1 ? yes(true) : <span className="disc-chip st-fail">{d.canonicalCount || 0}</span>}</td>
                    <td className="mono">{d.robots || "—"}</td>
                    <td>{yes(!!(d.og && d.og.title && d.og.image))}</td>
                    <td>{yes(!!(d.twitter && d.twitter.card))}</td>
                    <td>{(d.structuredDataTypes || []).join(", ") || tl("няма")}</td>
                    <td>{d.h1Count === 1 ? yes(true) : <span className="disc-chip st-warn">{d.h1Count || 0}</span>}</td>
                    <td><StatusChip status={c.status} tl={tl} /> <span className="disc-hint">{st(c)}</span></td>
                    <td className="nowrap"><FormattedDate value={c.completedAt} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function pageTypeLabel(typeKey) {
  const map = {
    "page.home": "Начална", "page.procedureIndex": "Списък процедури", "page.procedureDetail": "Процедура",
    "page.programIndex": "Програми", "page.about": "За платформата", "page.sources": "Източници",
    "page.calendar": "Календар", "page.changelog": "Промени", "page.policy": "Правна", "page.apiDocs": "API документация",
  };
  return map[typeKey] || "Страница";
}

function ProcedureSeo({ data, coverage, tl, origin }) {
  const [flt, setFlt] = useState("all");
  if (!data) return <Card titleKey="SEO на процедурите" tl={tl}><EmptyState tl={tl} titleKey="Зареждане…" textKey="Данните за процедурите се четат от базата." /></Card>;
  const s = data.stats || {};
  const cov = (coverage && coverage.safeDetails) || {};
  const rows = (data.procedures || []).filter((p) => {
    if (flt === "noOfficial") return !p.officialUrl;
    if (flt === "expired") return p.expiredButOpen;
    return true;
  });
  return (
    <Card titleKey="SEO на процедурите" tl={tl}
      actions={<select value={flt} onChange={(e) => setFlt(e.target.value)} aria-label={tl("Филтър")}>
        <option value="all">{tl("Всички")}</option>
        <option value="noOfficial">{tl("Без официален източник")}</option>
        <option value="expired">{tl("Изтекли, но отворени")}</option>
      </select>}>
      <InfoGrid tl={tl} rows={[
        ["Общо публични процедури", s.total],
        ["Процедури в sitemap", cov.sitemapProcedures == null ? "—" : cov.sitemapProcedures],
        ["Липсващи в sitemap", cov.missingCount == null ? "—" : cov.missingCount],
        ["Без официален източник", s.withoutOfficialUrl],
        ["Без програма", s.withoutProgram],
        ["Дублирани идентификатори", s.duplicateSlugs],
        ["Дублирани заглавия", s.duplicateTitles],
        ["Изтекли, но още отворени", s.expiredButOpen],
        ["С документи", s.withDocuments],
        ["Обхванати държави", s.countries],
      ]} />
      {!!(cov.missing || []).length && <ListBlock tl={tl} titleKey="Липсващи в sitemap" items={cov.missing} />}
      <div className="table-scroll">
        <table className="admin-table">
          <thead><tr>
            <th>{tl("Процедура")}</th><th>{tl("Държава")}</th><th>{tl("Идентификатор")}</th><th>{tl("Каноничен")}</th>
            <th>{tl("Статус")}</th><th className="nowrap">{tl("Краен срок")}</th><th>{tl("Документи")}</th>
            <th>{tl("Официален източник")}</th><th className="nowrap">{tl("Обновена")}</th><th>{tl("Действия")}</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 60).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="mono">{p.country}</td>
                <td className="mono">{p.id}</td>
                <td><UrlValue href={p.canonical} /></td>
                <td>{p.expiredButOpen ? <span className="disc-chip st-warn">{tl("изтекъл срок")}</span> : <span className="disc-chip st-pass">{p.status}</span>}</td>
                <td className="nowrap">{p.deadlineDate || "—"}</td>
                <td>{p.documents}</td>
                <td>{p.officialUrl ? <UrlValue href={p.officialUrl} label={hostOf(p.officialUrl)} /> : <span className="disc-chip st-warn">{tl("липсва")}</span>}</td>
                <td className="nowrap">{p.lastUpdated || "—"}</td>
                <td><a className="btn btn-ghost btn-xs" href={p.canonical} target="_blank" rel="noopener noreferrer">{tl("Отвори")}</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="chart-note"><Icon name="info" size={13} /> {tl("Съдържанието на официалните източници не може да се променя от този екран — то идва само от автоматичната синхронизация.")}</p>
    </Card>
  );
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

function SocialPreview({ check, tl }) {
  const d = check.safeDetails || {};
  const og = d.og || {};
  return (
    <div className="disc-social">
      <div className="disc-social-meta">
        <InfoGrid tl={tl} rows={[
          ["Страница", <span className="mono" key="p">{d.path}</span>],
          ["og:title", og.title],
          ["og:description", og.description],
          ["og:type", og.type, true],
          ["og:url", og.url, true],
          ["og:image", og.image, true],
          ["og:locale", og.locale, true],
          ["twitter:card", (d.twitter || {}).card, true],
          ["Липсващи полета", (d.problems || []).join(", ") || tl("няма")],
          ["Статус", <StatusChip status={check.status} tl={tl} key="s" />],
        ]} />
      </div>
      <div className="disc-social-cards">
        <span className="disc-hint">{tl("Приблизителен изглед")}</span>
        {["Facebook", "LinkedIn", "X"].map((net) => (
          <div key={net} className="disc-social-card">
            <div className="disc-social-net">{net}</div>
            {og.image && <div className="disc-social-img" style={{ backgroundImage: `url(${og.image})` }} />}
            <div className="disc-social-body">
              <strong>{og.title || tl("Няма заглавие")}</strong>
              <p>{og.description || tl("Няма описание")}</p>
              <span className="mono">{hostOf(og.url || "")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function localeTable(check, tl) {
  if (!check || !check.safeDetails || !check.safeDetails.locales) return null;
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead><tr><th>{tl("Език")}</th><th className="nowrap">{tl("Отговор")}</th><th>html lang</th><th>{tl("Съответства")}</th><th>{tl("Каноничен")}</th></tr></thead>
        <tbody>
          {check.safeDetails.locales.map((l) => (
            <tr key={l.locale}>
              <td className="mono">{l.locale}</td>
              <td className="nowrap">{l.status}</td>
              <td className="mono">{l.htmlLang || "—"}</td>
              <td><StatusChip status={l.langMatches ? "passed" : "warning"} tl={tl} /></td>
              <td className="mono">{l.canonical || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
