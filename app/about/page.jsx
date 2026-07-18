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
import { useSession } from "../hooks/useSession.js";
import { pathForTab } from "../lib/routes.js";
import { getCountry } from "../lib/country/countries.js";
import { intlLocale } from "../lib/project-utils.js";

const SECTIONS = [["about-system", "navAbout"], ["how-we-use-ai", "navHowWeUse"], ["how-ai-works", "navHowWorks"]];

// Приблизителна tile карта на Европа (grid cartogram, НЕ географска карта).
const TILES = {
  SE: [5, 1], FI: [6, 1],
  DK: [4, 2], EE: [6, 2],
  IE: [1, 3], NL: [3, 3], DE: [4, 3], PL: [5, 3], LV: [6, 3],
  BE: [3, 4], LU: [4, 4], CZ: [5, 4], LT: [6, 4],
  FR: [2, 5], AT: [4, 5], SK: [5, 5], RO: [6, 5],
  PT: [1, 6], ES: [2, 6], IT: [3, 6], SI: [4, 6], HU: [5, 6], BG: [6, 6],
  MT: [3, 7], HR: [4, 7], GR: [5, 7], CY: [6, 7],
};
// Последователна синя скала (не червено/зелено).
function tileClass(n, enabled) {
  if (!enabled || n == null || n === 0) return "t0";
  if (n < 10) return "t1";
  if (n < 30) return "t2";
  if (n < 100) return "t3";
  return "t4";
}

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
  const chartRows = [...countries].sort((a, b) => (b.activeSources + b.totalProcedures) - (a.activeSources + a.totalProcedures));
  const [showAllChart, setShowAllChart] = useState(false);
  const visibleChart = showAllChart ? chartRows : chartRows.slice(0, 10);
  const maxSources = Math.max(1, ...chartRows.map((c) => c.activeSources));
  const daily = aiCfg?.dailyReview;
  const sysAI = aiCfg?.systemAI;

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
            <p className="ab-statusline">
              <strong>{nf.format(summary.countries)}</strong> {t("about.statCountries")} · <strong>{nf.format(summary.activeSources)}</strong> {t("about.statSources")} · <strong>{nf.format(summary.totalProcedures)}</strong> {t("about.statProcedures")} · {t("about.statLastUpdate")}: <strong>{stats.generatedAt ? df.format(new Date(stats.generatedAt)) : "—"}</strong>
            </p>
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
                  <p className="row-sub">{t("about.mapNote")}</p>
                  <div className="euro-map" role="group" aria-label={t("about.mapTitle")}>
                    {countries.map((c) => {
                      const pos = TILES[c.code];
                      if (!pos) return null;
                      const cls = tileClass(c.totalProcedures, c.enabled);
                      return (
                        <button
                          key={c.code}
                          className={"euro-tile " + cls + (selected === c.code ? " is-selected" : "")}
                          style={{ gridColumn: pos[0], gridRow: pos[1] }}
                          aria-label={`${cName(c)}: ${nf.format(c.totalProcedures)} ${t("about.statProcedures")}`}
                          aria-expanded={selected === c.code}
                          onClick={() => setSelected(selected === c.code ? null : c.code)}
                        >
                          <span className="euro-tile-code">{c.code}</span>
                        </button>
                      );
                    })}
                  </div>
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

                  {/* Текстова алтернатива на картата */}
                  <details className="euro-table-details">
                    <summary>{t("about.dataTable")}</summary>
                    <div className="table-scroll">
                      <table className="admin-table">
                        <thead><tr><th>{t("country.label")}</th><th>{t("about.activeProcedures")}</th><th>{t("about.totalProcedures")}</th><th>{t("about.publishedBudget")}</th><th>{t("about.sources")}</th><th>{t("about.lastSync")}</th></tr></thead>
                        <tbody>
                          {countries.map((c) => (
                            <tr key={c.code}>
                              <td>{c.code} · {cName(c)}</td>
                              <td>{nf.format(c.activeProcedures)}</td>
                              <td>{nf.format(c.totalProcedures)}</td>
                              <td>{c.publishedBudgetEur != null ? cf.format(c.publishedBudgetEur) : "—"}</td>
                              <td>{nf.format(c.activeSources)}</td>
                              <td>{c.lastSuccessfulSyncAt ? df.format(new Date(c.lastSuccessfulSyncAt)) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
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
                    <div><dt>{t("about.publishedBudget")}</dt><dd>{summary.publishedBudgetEur != null ? cf.format(summary.publishedBudgetEur) : t("about.budgetNoData")}</dd></div>
                    <div><dt>{t("about.sources")}</dt><dd>{nf.format(summary.activeSources)}</dd></div>
                    <div><dt>{t("about.statLastUpdate")}</dt><dd>{stats.generatedAt ? df.format(new Date(stats.generatedAt)) : "—"}</dd></div>
                  </dl>
                  {summary.publishedBudgetEur != null && (
                    <p className="chart-note"><Icon name="info" size={13} /> {t("about.budgetDisclaimer", { count: nf.format(summary.budgetProcedureCount) })}</p>
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
                      {c.activeSources > 0 ? (
                        <>
                          <span className="seg ok" style={{ width: Math.max(4, ((c.activeSources) / maxSources) * 100) + "%" }} title={`${cName(c)}: ${c.activeSources} ${t("about.chartActive")}`} />
                        </>
                      ) : <span className="seg none" />}
                    </span>
                    <span className="ab-chart-n">{c.activeSources > 0 ? nf.format(c.activeSources) : t("country.comingSoon")}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-ghost" onClick={() => setShowAllChart((v) => !v)}>{showAllChart ? t("about.top10") : t("about.allCountries")}</button>

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

              <div className="ab-model-cards">
                <div className="prof-card ab-model-card">
                  <h3 className="prof-section-title">{t("about.dailyCardTitle")}</h3>
                  <p className="ab-model-name">{daily ? `${daily.actualModel || daily.model}` : "Claude Opus 4.8"} <span className="role-chip">{daily?.provider || "Anthropic"}</span></p>
                  <p className="prose">{t("about.dailyCardDesc")}</p>
                  <dl className="sys-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                    <div><dt>{t("about.lastRun")}</dt><dd>{daily?.lastSuccessfulRunAt ? df.format(new Date(daily.lastSuccessfulRunAt)) : "—"}</dd></div>
                    <div><dt>{t("about.countriesInRun")}</dt><dd>{daily?.countriesReviewed != null ? nf.format(daily.countriesReviewed) : "—"}</dd></div>
                  </dl>
                </div>
                <div className="prof-card ab-model-card">
                  <h3 className="prof-section-title">{t("about.systemCardTitle")}</h3>
                  <p className="ab-model-name">{sysAI?.model || "GPT-5.6"} <span className="role-chip">{sysAI?.provider || "OpenAI"}</span></p>
                  <p className="prose">{t("about.systemCardDesc")}</p>
                  <dl className="sys-grid" style={{ gridTemplateColumns: "1fr" }}>
                    <div><dt>{t("about.status")}</dt><dd>{sysAI?.status === "active" ? <span className="badge green">OK</span> : <span className="badge neutral">{t("country.comingSoon")}</span>}</dd></div>
                  </dl>
                </div>
              </div>

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
