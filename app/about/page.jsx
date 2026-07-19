"use client";

// „Относно системата" (/about): реално покритие, дневна AI обработка и модели.
// Всички статистики идват от последния успешен snapshot (/api/public/platform-statistics)
// и от публичната AI конфигурация — нищо не се измисля и не се смята при page load.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import AppHeader from "../components/AppHeader.jsx";
import Icon from "../components/Icon.jsx";
import { FlagImg } from "../components/country/CountrySelector.jsx";
import { useCountry } from "../components/country/CountryProvider.jsx";
import EuropeGeoMap from "../components/country/EuropeGeoMap.jsx";
import { useSession } from "../hooks/useSession.js";
import { pathForTab } from "../lib/routes.js";
import { getCountry } from "../lib/country/countries.js";
import { intlLocale } from "../lib/project-utils.js";

const SECTIONS = [["about-system", "navAbout"], ["how-we-use-ai", "navHowWeUse"], ["how-ai-works", "navHowWorks"]];

// Картата е географска (EuropeGeoMap — локален оптимизиран SVG).

export default function AboutPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const session = useSession();
  const { setCountry } = useCountry();
  const navigateTab = useCallback((k) => router.push(pathForTab(k)), [router]);
  const [stats, setStats] = useState(null);
  const [aiCfg, setAiCfg] = useState(null);
  const [phase, setPhase] = useState("loading");
  const [activeSec, setActiveSec] = useState("about-system");
  const [selected, setSelected] = useState(null); // избрана държава на картата
  const [copied, setCopied] = useState(false);
  const uiLang = i18n.language;
  const nf = useMemo(() => new Intl.NumberFormat(intlLocale()), [uiLang]);
  const cf = useMemo(() => new Intl.NumberFormat(intlLocale(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }), [uiLang]);
  const df = useMemo(() => new Intl.DateTimeFormat(intlLocale(), { day: "2-digit", month: "long", year: "numeric" }), [uiLang]);

  const load = useCallback(() => {
    setPhase("loading");
    Promise.all([
      fetch("/api/public/platform-statistics").then((r) => (r.ok ? r.json() : Promise.reject(new Error()))),
      fetch("/api/ai/public-configuration").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([s, a]) => { setStats(s); setAiCfg(a); setPhase("ready"); }).catch(() => setPhase("error"));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Активна секция (IntersectionObserver) + hash навигация.
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActiveSec(e.target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    for (const [id] of SECTIONS) { const el = document.getElementById(id); if (el) obs.observe(el); }
    return () => obs.disconnect();
  }, [phase]);
  useEffect(() => {
    const goHash = () => {
      const id = window.location.hash.slice(1);
      if (id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
    };
    goHash();
    window.addEventListener("hashchange", goHash);
    return () => window.removeEventListener("hashchange", goHash);
  }, [phase]);
  const goSection = (id) => {
    history.pushState(null, "", "#" + id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSec(id);
  };

  const share = async () => {
    const url = window.location.origin + "/about";
    try {
      if (navigator.share) await navigator.share({ title: "Европроекти", url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* отказ от потребителя */ }
  };

  const countries = stats?.countries || [];
  const summary = stats?.summary || null;
  const cName = (c) => (uiLang === "bg" ? c.nameBg : c.englishName);
  const byCode = useMemo(() => Object.fromEntries(countries.map((c) => [c.code, c])), [countries]);
  const sel = selected ? byCode[selected] : null;
  const topActive = [...countries].filter((c) => c.activeProcedures > 0).sort((a, b) => b.activeProcedures - a.activeProcedures).slice(0, 5);
  const topBudget = [...countries].filter((c) => c.publishedBudgetEur > 0).sort((a, b) => b.publishedBudgetEur - a.publishedBudgetEur).slice(0, 5);
  const maxActive = topActive.length ? topActive[0].activeProcedures : 1;
  const chartRows = [...countries].sort((a, b) => b.totalProcedures - a.totalProcedures || b.activeSources - a.activeSources);
  const sortedCountries = chartRows;
  const [tableExpanded, setTableExpanded] = useState(false);
  const tableRows = tableExpanded ? sortedCountries : sortedCountries.slice(0, 10);
  const [showAllChart, setShowAllChart] = useState(false);
  const visibleChart = showAllChart ? chartRows : chartRows.slice(0, 10);
  const maxTotal = Math.max(1, ...chartRows.map((c) => c.totalProcedures));
  // Компактен бюджет за реда (напр. €12M); "—" при липса на структурирани данни.
  const cfc = useMemo(() => new Intl.NumberFormat(intlLocale(), { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }), [uiLang]);
  const daily = aiCfg?.dailyReview;
  const sysAI = aiCfg?.systemAI;
  const agents = aiCfg?.agents || null;

  const pickCountry = (code) => {
    setCountry(code);
    router.push(pathForTab("procedures"));
  };

  return (
    <>
      <AppHeader tab={null} onTab={navigateTab} savedCount={0} session={session} />
      <main id="main" className="container page about-page">
        {/* Hero */}
        <section className="ab-hero">
          <span className="ai-badge"><Icon name="sparkle" size={14} aria-hidden="true" /> {t("about.heroBadge")}</span>
          <h1>{t("about.heroTitle")}</h1>
          <p className="ab-lead">{t("about.heroLead")}</p>
          {summary && (
            <>
              <p className="ab-statusline">
                <strong>{nf.format(summary.countries)}</strong> {t("about.statCountries")} · <strong>{nf.format(summary.activeSources)}</strong> {t("about.statSources")} · <strong>{nf.format(summary.totalProcedures)}</strong> {t("about.statProcedures")} · {t("about.statLastUpdate")}: <strong>{stats.generatedAt ? df.format(new Date(stats.generatedAt)) : "—"}</strong>
              </p>
              <p className="ab-count-note">{t("about.countsNote")}</p>
            </>
          )}
          <div className="ab-cta">
            <a className="btn btn-primary" href="/procedures">{t("about.ctaProcedures")} <Icon name="arrowRight" size={15} /></a>
            <a className="btn" href="/sources">{t("about.ctaSources")}</a>
            <button className="btn btn-ghost" onClick={share}><Icon name="external" size={15} /> {copied ? t("about.copied") : t("about.share")}</button>
          </div>
        </section>

        {/* Sticky локална навигация */}
        <nav className="ab-nav" aria-label={t("about.navAbout")}>
          {SECTIONS.map(([id, key]) => (
            <button key={id} className="ab-nav-item" aria-current={activeSec === id ? "location" : undefined} onClick={() => goSection(id)}>
              {t("about." + key)}
            </button>
          ))}
        </nav>

        {phase === "loading" && <div className="state ov-empty ab-skeleton" aria-hidden="true"><p className="prose">{t("common.loading")}</p></div>}
        {phase === "error" && (
          <div className="state ov-empty"><Icon name="alert" size={26} /><h3>{t("about.loadError")}</h3><button className="btn btn-primary" onClick={load}>{t("about.retry")}</button></div>
        )}

        {phase === "ready" && !summary && (
          <div className="state ov-empty"><Icon name="info" size={26} /><h3>{t("about.emptySnapshot")}</h3></div>
        )}

        {phase === "ready" && summary && (
          <>
            {/* ================= Секция 1: Относно системата ================= */}
            <section id="about-system" className="ab-section">
              <h2>{t("about.navAbout")}</h2>
              <p className="ab-sub">{t("about.aboutSub")}</p>
              <p className="chart-note"><Icon name="info" size={13} /> {t("about.partialNote")}</p>

              <div className="ab-map-grid">
                <div>
                  <h3 className="ab-h3">{t("about.mapTitle")}</h3>
                  <EuropeGeoMap
                    countries={countries}
                    selected={selected}
                    onSelect={(code) => setSelected(selected === code ? null : code)}
                    labelFor={(c) => `${cName(c)}: ${nf.format(c.totalProcedures)} ${t("about.statProcedures")}`}
                  />
                  <div className="euro-legend" aria-hidden="true">
                    <span className="lg-title">{t("about.legendTitle")}:</span>
                    <span className="lg t0">{t("about.legendNone")}</span>
                    <span className="lg t1">{t("about.legendFew")}</span>
                    <span className="lg t2">{t("about.legendSome")}</span>
                    <span className="lg t3">{t("about.legendMany")}</span>
                    <span className="lg t4">{t("about.legendLots")}</span>
                  </div>

                  {/* Панел за избраната държава (не hover-only) */}
                  {sel && (
                    <div className="euro-panel" role="region" aria-live="polite">
                      <div className="euro-panel-head">
                        <FlagImg country={getCountry(sel.code)} size={22} />
                        <strong>{cName(sel)}</strong>
                        <span className="row-sub">{sel.nativeName}</span>
                      </div>
                      {sel.enabled && sel.totalProcedures > 0 ? (
                        <dl className="sys-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                          <div><dt>{t("about.activeProcedures")}</dt><dd>{nf.format(sel.activeProcedures)}</dd></div>
                          <div><dt>{t("about.totalProcedures")}</dt><dd>{nf.format(sel.totalProcedures)}</dd></div>
                          <div><dt>{t("about.newLast30")}</dt><dd>{nf.format(sel.newLast30Days)}</dd></div>
                          <div><dt>{t("about.updatedLast30")}</dt><dd>{nf.format(sel.updatedLast30Days)}</dd></div>
                          <div><dt>{t("about.publishedBudget")}</dt><dd>{sel.publishedBudgetEur != null ? cf.format(sel.publishedBudgetEur) : t("about.budgetNoData")}</dd></div>
                          <div><dt>{t("about.sources")}</dt><dd>{nf.format(sel.activeSources)}</dd></div>
                          <div><dt>{t("about.lastSync")}</dt><dd>{sel.lastSuccessfulSyncAt ? df.format(new Date(sel.lastSuccessfulSyncAt)) : "—"}</dd></div>
                          <div><dt>{t("about.coverage")}</dt><dd>{sel.coverageStatus}</dd></div>
                        </dl>
                      ) : (
                        <p className="prose"><Icon name="info" size={14} /> {t("about.notReadyTitle")} · {t("about.coverage")}: {sel.ingestionStatus}</p>
                      )}
                      <button className="btn btn-primary" onClick={() => pickCountry(sel.code)}>{t("about.viewCountry", { country: cName(sel) })}</button>
                    </div>
                  )}

                  {/* Таблица с данни по държави: 10 реда + „Виж повече" */}
                  <div className="euro-data-table">
                    <h4 className="ab-h4">{t("about.dataTable")}</h4>
                    <div className="table-scroll">
                      <table className="admin-table">
                        <thead><tr><th>{t("country.label")}</th><th>{t("about.activeProcedures")}</th><th>{t("about.totalProcedures")}</th><th>{t("about.publishedBudget")}</th><th>{t("about.sources")}</th><th>{t("about.lastSync")}</th></tr></thead>
                        <tbody>
                          {tableRows.map((c) => (
                            <tr key={c.code}>
                              <td><img className="country-flag" src={`/flags/${c.code.toLowerCase()}.svg`} alt="" aria-hidden="true" width={18} height={12} /> {cName(c)}</td>
                              <td>{nf.format(c.activeProcedures)}</td>
                              <td>{nf.format(c.totalProcedures)}</td>
                              <td>{c.publishedBudgetEur != null
                                ? <span title={`${t("about.exactLabel")}: ${cf.format(c.publishedBudgetEur)}${c.budgetProcedureCount != null ? ` · ${t("about.budgetOfProcs", { v: nf.format(c.budgetProcedureCount), t: nf.format(c.totalProcedures) })}` : ""}`}>{cfc.format(c.publishedBudgetEur)}{c.budgetCoveragePercent != null ? <span className="ab-cov-sub">{nf.format(c.budgetProcedureCount)}/{nf.format(c.totalProcedures)} · {nf.format(c.budgetCoveragePercent)}%</span> : null}</span>
                                : <span className="ab-nobudget">{t(`about.budgetStatus.${c.budgetStatus}`) || t("about.budgetNoData")}</span>}</td>
                              <td>{nf.format(c.activeSources)}</td>
                              <td>{c.lastSuccessfulSyncAt ? df.format(new Date(c.lastSuccessfulSyncAt)) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {sortedCountries.length > 10 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setTableExpanded((v) => !v)} aria-expanded={tableExpanded}>
                        {tableExpanded ? t("about.showLess") : `${t("about.showMore")} (${sortedCountries.length - 10})`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary панел */}
                <aside className="ab-summary">
                  <h3 className="ab-h3">{t("about.summaryTitle")}</h3>
                  <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
                    <div><dt>{t("about.summaryCountries")}</dt><dd>{nf.format(summary.countries)}</dd></div>
                    <div><dt>{t("about.summaryWithSources")}</dt><dd>{nf.format(summary.countriesWithActiveSources)}</dd></div>
                    <div><dt>{t("about.totalProcedures")}</dt><dd>{nf.format(summary.totalProcedures)}</dd></div>
                    <div><dt>{t("about.activeProcedures")}</dt><dd>{nf.format(summary.activeProcedures)}</dd></div>
                    <div><dt>{t("about.summaryDocs")}</dt><dd>{nf.format(summary.proceduresWithDocuments)}</dd></div>
                    <div><dt>{t("about.knownBudget")}</dt><dd title={t("about.budgetTooltip")}>{summary.publishedBudgetEur != null ? cf.format(summary.publishedBudgetEur) : t("about.budgetNoData")}</dd></div>
                    <div><dt>{t("about.sources")}</dt><dd>{nf.format(summary.activeSources)}</dd></div>
                    <div><dt>{t("about.statLastUpdate")}</dt><dd>{stats.generatedAt ? df.format(new Date(stats.generatedAt)) : "—"}</dd></div>
                  </dl>
                  {/* Бюджетно покритие: честна база + progress лента */}
                  {summary.budget && (
                    <div className="ab-budget-cov">
                      <p className="chart-note" style={{ margin: "6px 0" }}>{t("about.budgetBasedOn", { v: nf.format(summary.budget.validatedBudgetProcedures), t: nf.format(summary.budget.totalProcedures) })}</p>
                      {summary.budget.budgetCoveragePercent != null && (
                        <>
                          <div className="cov-head"><span>{t("about.budgetCoverage")}</span><b>{t("about.budgetCoverageOf", { p: nf.format(summary.budget.budgetCoveragePercent) })}</b></div>
                          <div className="cov-bar" role="progressbar" aria-valuenow={summary.budget.budgetCoveragePercent} aria-valuemin={0} aria-valuemax={100} aria-label={t("about.budgetCoverage")}>
                            <span style={{ width: summary.budget.budgetCoveragePercent + "%" }} />
                          </div>
                        </>
                      )}
                      <p className="chart-note" style={{ marginTop: 6 }}><Icon name="info" size={13} /> {t("about.budgetTooltip")}</p>
                    </div>
                  )}
                  {summary.documentCoveragePercent != null && (
                    <p className="row-sub" style={{ marginTop: 4 }}>{t("about.docCoverage")}: {nf.format(summary.proceduresWithDocuments)} / {nf.format(summary.totalProcedures)} · {nf.format(summary.documentCoveragePercent)}%</p>
                  )}

                  <h4 className="ab-h4">{t("about.topByActive")}</h4>
                  {topActive.length === 0 ? <p className="row-sub">—</p> : topActive.map((c) => (
                    <div className="ab-top-row" key={c.code}>
                      <FlagImg country={getCountry(c.code)} size={18} />
                      <span className="ab-top-name">{cName(c)}</span>
                      <span className="ab-top-n">{nf.format(c.activeProcedures)}</span>
                      <span className="ab-top-bar"><span style={{ width: Math.max(6, (c.activeProcedures / maxActive) * 100) + "%" }} /></span>
                    </div>
                  ))}

                  <h4 className="ab-h4">{t("about.topByBudget")}</h4>
                  {topBudget.length === 0 ? <p className="row-sub">{t("about.budgetNoData")}</p> : topBudget.map((c) => (
                    <div className="ab-top-row" key={c.code}>
                      <FlagImg country={getCountry(c.code)} size={18} />
                      <span className="ab-top-name">{cName(c)}</span>
                      <span className="ab-top-n">{cf.format(c.publishedBudgetEur)}</span>
                    </div>
                  ))}
                  <p className="ab-big-disclaimer"><Icon name="info" size={13} /> {t("about.bigDisclaimer")}</p>
                </aside>
              </div>
            </section>

            {/* ================= Секция 2: Как използваме AI ================= */}
            <section id="how-we-use-ai" className="ab-section">
              <h2>{t("about.navHowWeUse")}</h2>
              <p className="ab-sub">{t("about.howWeUseSub")}</p>

              <h3 className="ab-h3">{t("about.dailyChartTitle")}</h3>
              <div className="ab-chart" role="img" aria-label={t("about.dailyChartTitle")}>
                {visibleChart.map((c) => (
                  <div className="ab-chart-row" key={c.code}>
                    <span className="ab-chart-label"><FlagImg country={getCountry(c.code)} size={16} /> {c.code}</span>
                    <span className="ab-chart-bar">
                      {c.totalProcedures > 0 ? (
                        <span className="seg ok" style={{ width: Math.max(4, (c.totalProcedures / maxTotal) * 100) + "%" }} title={`${cName(c)}: ${nf.format(c.totalProcedures)} ${t("about.statProcedures")}`} />
                      ) : <span className="seg none" />}
                    </span>
                    <span className="ab-chart-n">
                      {c.totalProcedures > 0
                        ? `${nf.format(c.totalProcedures)} / ${c.publishedBudgetEur != null ? cfc.format(c.publishedBudgetEur) : "—"}`
                        : t("country.comingSoon")}
                    </span>
                  </div>
                ))}
              </div>
              <button className="btn btn-ghost" onClick={() => setShowAllChart((v) => !v)}>{showAllChart ? t("about.top10") : t("about.allCountries")}</button>

              {/* AI агенти в системата — реална конфигурация от D1 */}
              <h3 className="ab-h3" style={{ marginTop: 24 }}>{t("about.agentsTitle")}</h3>
              <p className="ab-sub">{t("about.agentsSub")}</p>
              <AgentsGrid agents={agents} t={t} df={df} nf={nf} />

              <p className="ab-ai-note"><Icon name="info" size={14} /> {t("about.aiSequenceNote")}</p>
              <p className="ab-ai-note"><Icon name="sparkle" size={14} /> {t("about.aiPipelineNote")}</p>

              <h3 className="ab-h3" style={{ marginTop: 22 }}>{t("about.pipelineTitle")}</h3>
              <ol className="ab-pipeline">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <li key={n}><span className="ab-step-n">{n}</span> {t(`about.step${n}t`)}</li>
                ))}
              </ol>

              <div className="ov-since" style={{ marginTop: 14 }}>
                <Icon name="info" size={18} />
                <p>{t("about.trustNote")} <a href="/sources">{t("about.seeSources")}</a></p>
              </div>
            </section>

            {/* ================= Секция 3: Как AI работи ================= */}
            <section id="how-ai-works" className="ab-section">
              <h2>{t("about.navHowWorks")}</h2>
              <p className="ab-sub">{t("about.howWorksSub")}</p>

              {/* Компактно обобщение на моделите (реална конфигурация) */}
              <ModelOverview agents={agents} t={t} />
              <p className="ab-ai-note" style={{ marginTop: 8 }}><Icon name="info" size={14} /> {t("about.recDisclaimer")}</p>

              <h3 className="ab-h3">{t("about.archTitle")}</h3>
              <ol className="ab-arch">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <li key={n}><strong>{t(`about.arch${n}t`)}</strong><span>{t(`about.arch${n}d`)}</span></li>
                ))}
              </ol>

              <div className="ab-3col">
                <div className="prof-card"><h4 className="ab-h4">{t("about.canTitle")}</h4><ul className="ab-list">{[1, 2, 3, 4, 5, 6, 7].map((n) => <li key={n}><Icon name="check" size={13} /> {t(`about.can${n}`)}</li>)}</ul></div>
                <div className="prof-card"><h4 className="ab-h4">{t("about.cantTitle")}</h4><ul className="ab-list">{[1, 2, 3, 4, 5, 6].map((n) => <li key={n}><Icon name="close" size={13} /> {t(`about.cant${n}`)}</li>)}</ul></div>
                <div className="prof-card"><h4 className="ab-h4">{t("about.qualityTitle")}</h4><ul className="ab-list">{[1, 2, 3, 4, 5, 6, 7].map((n) => <li key={n}><Icon name="sparkle" size={13} /> {t(`about.q${n}`)}</li>)}</ul></div>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

// ---------- Публични AI агент карти (реална конфигурация от D1) ----------
const AGENT_ICON = { daily_review: "sparkle", procedure_analysis: "document", document_analysis: "document", budget_analysis: "euro", recommendation: "users", future_chat: "sparkle" };
const STATUS_TONE = { active: "green", upcoming: "neutral", temporarily_unavailable: "amber", needs_configuration: "amber", last_run_failed: "red" };

// Публична безопасна дейност от metrics (per purpose етикети).
function metricsLine(purpose, m, t, nf) {
  if (!m) return null;
  const parts = [];
  const num = (v) => nf.format(v);
  const proc = m.processed != null ? m.processed : m.entities;
  if (purpose === "daily_review") {
    if (m.countries != null) parts.push(`${num(m.countries)} ${t("about.mCountries")}`);
    if (m.entities != null) parts.push(`${num(m.entities)} ${t("about.mProcedures")}`);
    if (m.changes) parts.push(`${num(m.changes)} ${t("about.mChanges")}`);
  } else if (purpose === "procedure_analysis") {
    if (proc != null) parts.push(`${num(proc)} ${t("about.mProcedures")}`);
    if (m.changes) parts.push(`${num(m.changes)} ${t("about.mChanges")}`);
    if (m.requiresReview) parts.push(`${num(m.requiresReview)} ${t("about.mReview")}`);
  } else if (purpose === "document_analysis") {
    if (proc != null) parts.push(`${num(proc)} ${t("about.mDocuments")}`);
    if (m.changes) parts.push(`${num(m.changes)} ${t("about.mChanges")}`);
  } else if (purpose === "budget_analysis") {
    if (proc != null) parts.push(`${num(proc)} ${t("about.mBudgets")}`);
    if (m.changes) parts.push(`${num(m.changes)} ${t("about.mChanges")}`);
  } else if (purpose === "recommendation") {
    if (proc != null) parts.push(`${num(proc)} ${t("about.mRecommendations")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function PublicAIAgentCard({ a, t, df, nf }) {
  const meta = t(`about.agents.${a.purpose}`, { returnObjects: true }) || {};
  const resp = Array.isArray(meta.resp) ? meta.resp : [];
  const statusLabel = t(`about.agentStatus.${a.status}`) || a.status;
  const activity = metricsLine(a.purpose, a.metrics, t, nf);
  return (
    <article className="ai-agent-card">
      <div className="aac-head">
        <span className="aac-ico" aria-hidden="true"><Icon name={AGENT_ICON[a.purpose] || "sparkle"} size={18} /></span>
        <h4 className="aac-name">{meta.name || a.purpose}</h4>
      </div>
      <div className="aac-badges">
        <span className="badge neutral">{a.provider}</span>
        <span className={"badge " + (STATUS_TONE[a.status] || "neutral")}>{statusLabel}</span>
        {a.purpose === "daily_review" && <span className="badge amber">{t("about.agentManaged")}</span>}
      </div>
      <div className="aac-model">
        <span className="aac-model-name">{a.modelDisplayName}</span>
        <span className="aac-model-id mono">{a.modelId}</span>
      </div>
      {meta.desc && <p className="aac-desc">{meta.desc}</p>}
      {resp.length > 0 && (
        <ul className="aac-resp">{resp.slice(0, 6).map((r, i) => <li key={i}><Icon name="check" size={12} aria-hidden="true" /> {r}</li>)}</ul>
      )}
      {a.purpose === "future_chat" ? (
        <p className="aac-upcoming">{t("about.agentUpcomingNote")}</p>
      ) : (
        <div className="aac-exec">
          <span>{t("about.agentAutomatic")}: {a.automatic ? "✓" : "—"}</span>
          <span>{a.purpose === "daily_review" ? t("about.agentScheduleDaily") : t("about.agentScheduleNightly")}</span>
          <span>{t("about.lastRun")}: {a.lastSuccessfulRunAt ? df.format(new Date(a.lastSuccessfulRunAt)) : "—"}</span>
        </div>
      )}
      {a.purpose !== "future_chat" && (
        <p className="aac-activity">{activity || t("about.agentNoRun")}</p>
      )}
      {a.purpose === "recommendation" && <p className="aac-disclaimer">{t("about.recDisclaimer")}</p>}
    </article>
  );
}

function AgentsGrid({ agents, t, df, nf }) {
  if (agents == null) return <div className="ai-agents-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="ai-agent-card skel" aria-hidden="true" />)}</div>;
  if (agents.length === 0) return <p className="prose" style={{ color: "var(--faint)" }}>{t("about.agentsUnavailable")}</p>;
  return (
    <div className="ai-agents-grid">
      {agents.map((a) => <PublicAIAgentCard key={a.purpose} a={a} t={t} df={df} nf={nf} />)}
    </div>
  );
}

// Компактно обобщение на моделите (collapsible технически детайли).
function ModelOverview({ agents, t }) {
  const [open, setOpen] = useState(false);
  if (!agents || agents.length === 0) return null;
  return (
    <div className="ab-model-overview">
      <h3 className="ab-h3">{t("about.modelOverviewTitle")}</h3>
      <div className="mo-rows">
        {agents.map((a) => {
          const meta = t(`about.agents.${a.purpose}`, { returnObjects: true }) || {};
          return (
            <div className="mo-row" key={a.purpose}>
              <span className="mo-agent">{meta.name || a.purpose}</span>
              <span className="mo-model">{a.modelDisplayName} <span className="role-chip">{a.provider}</span></span>
              <span className={"badge " + (STATUS_TONE[a.status] || "neutral")}>{t(`about.agentStatus.${a.status}`)}</span>
              {open && <span className="mo-id mono">{a.modelId}</span>}
            </div>
          );
        })}
      </div>
      <button className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t("about.modelOverviewToggle")}</button>
    </div>
  );
}
