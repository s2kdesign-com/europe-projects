"use client";

// Обзор на всички държави за страницата /sources: обща информация, общ брой
// обхванати държави и източници, плюс мрежа с всяка държава (знаме + брой източници).
// Клик върху държава сменя избраната държава (CountryContext) — панелът отдолу се
// презарежда за нея. Данните идват от /api/countries (source_count на живо от D1).

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCountry } from "./CountryProvider.jsx";
import { FlagImg } from "./CountrySelector.jsx";
import { getCountry } from "../../lib/country/countries.js";

export default function SourcesOverview() {
  const { t, i18n } = useTranslation();
  const uiLang = i18n.language;
  const { selectedCountry, setCountry } = useCountry();
  const [rows, setRows] = useState(null);
  const [pstats, setPstats] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/countries")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => { if (alive && Array.isArray(d.countries)) setRows(d.countries); })
      .catch(() => { if (alive) setRows([]); });
    fetch("/api/public/platform-statistics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && d.summary) setPstats(d.summary); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const nf = useMemo(() => new Intl.NumberFormat(uiLang === "bg" ? "bg-BG" : "en-US"), [uiLang]);
  const cf = useMemo(() => new Intl.NumberFormat(uiLang === "bg" ? "bg-BG" : "en-US", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }), [uiLang]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .map((c) => ({ code: c.code, sources: c.active_source_count ?? c.source_count ?? 0 }))
      .sort((a, b) => b.sources - a.sources || a.code.localeCompare(b.code));
  }, [rows]);

  const totalCountries = sorted.filter((c) => c.sources > 0).length;
  const totalSources = sorted.reduce((s, c) => s + c.sources, 0);
  const nameOf = (code) => {
    const c = getCountry(code);
    return uiLang === "bg" ? c.nameBg : c.english;
  };
  const sourcesLabel = (n) => (n === 1 ? t("country.sourcesCountOne") : t("country.sourcesCountLabel", { count: n }));

  return (
    <section className="sources-overview">
      <p className="so-lead">{t("country.sourcesOverviewLead")}</p>

      <div className="so-stats">
        <div className="so-stat">
          <span className="so-stat-num">{rows ? totalCountries : "—"}</span>
          <span className="so-stat-label">{t("country.sourcesStatCountries")}</span>
        </div>
        <div className="so-stat">
          <span className="so-stat-num">{rows ? totalSources : "—"}</span>
          <span className="so-stat-label">{t("country.sourcesStatSources")}</span>
        </div>
        <div className="so-stat">
          <span className="so-stat-num">{pstats ? nf.format(pstats.totalProcedures) : "—"}</span>
          <span className="so-stat-label">{t("country.sourcesStatProcedures")}</span>
        </div>
        <div className="so-stat">
          <span className="so-stat-num">{pstats && pstats.publishedBudgetEur != null ? cf.format(pstats.publishedBudgetEur) : "—"}</span>
          <span className="so-stat-label">{t("country.sourcesStatBudget")}</span>
        </div>
      </div>

      <h2 className="so-grid-title">{t("country.sourcesByCountry")}</h2>
      <div className="so-grid">
        {sorted.map((c) => (
          <button
            key={c.code}
            type="button"
            className={"so-chip" + (c.code === selectedCountry ? " is-current" : "") + (c.sources === 0 ? " is-empty" : "")}
            onClick={() => setCountry(c.code)}
            aria-pressed={c.code === selectedCountry}
          >
            <FlagImg country={getCountry(c.code)} size={22} />
            <span className="so-chip-name">{nameOf(c.code)}</span>
            <span className="so-chip-count">{sourcesLabel(c.sources)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
