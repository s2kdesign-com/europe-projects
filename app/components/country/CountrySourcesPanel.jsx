"use client";

// Публичен панел „Официални източници" за избраната държава. Чете /api/sources?country=
// (само безопасни полета). Показва портали, управляващи органи, покритие и здраве.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../Icon.jsx";
import { useCountry } from "./CountryProvider.jsx";
import { FlagImg } from "./CountrySelector.jsx";
import { formatDate } from "../../lib/project-utils.js";

const HEALTH_TONE = { healthy: "on", unknown: "soon", degraded: "soon", failing: "soon", blocked: "soon" };

export default function CountrySourcesPanel({ compact = false }) {
  const { t, i18n } = useTranslation();
  const { selectedCountry, country } = useCountry();
  const [data, setData] = useState({ sources: [], meta: null });
  const [phase, setPhase] = useState("loading");
  const cLabel = country ? (i18n.language === "bg" ? country.nameBg : country.english) : selectedCountry;

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setPhase("loading");
    fetch("/api/sources?country=" + encodeURIComponent(selectedCountry), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http_" + r.status))))
      .then((d) => { if (alive) { setData({ sources: d.sources || [], meta: d.meta || null }); setPhase("ready"); } })
      .catch((e) => { if (alive && e.name !== "AbortError") setPhase("error"); });
    return () => { alive = false; controller.abort(); };
  }, [selectedCountry]);

  return (
    <section className={"sources-panel" + (compact ? " compact" : "")}>
      <div className="sources-head">
        <FlagImg country={country} size={24} />
        <h2>{t("country.sourcesFor", { country: cLabel })}</h2>
      </div>
      <p className="prose">{t("country.sourcesIntro")}</p>

      {phase === "loading" && <p className="prose">{t("common.loading")}</p>}
      {phase === "error" && <p className="prose">{t("states.loadError")}</p>}
      {phase === "ready" && data.sources.length === 0 && (
        <div className="ov-since"><Icon name="info" size={18} /><p>{t("country.sourcesEmpty")}</p></div>
      )}

      {phase === "ready" && data.sources.length > 0 && (
        <ul className="sources-list">
          {data.sources.map((s) => (
            <li key={s.id} className="source-card">
              <div className="source-top">
                <strong>{s.name}</strong>
                {s.primary_source ? <span className="country-status on">{t("country.active")}</span> : null}
                <span className={"country-status " + (HEALTH_TONE[s.source_health] || "soon")}>{s.source_health}</span>
              </div>
              {s.authority_name && <div className="source-auth">{s.authority_name}</div>}
              {s.coverage_description && <div className="source-cov">{t("country.coverage")}: {s.coverage_description}</div>}
              <div className="source-links">
                <a href={s.base_url} target="_blank" rel="noopener noreferrer nofollow"><Icon name="external" size={13} /> {s.base_url}</a>
                {s.calls_url && s.calls_url !== s.base_url && (
                  <a href={s.calls_url} target="_blank" rel="noopener noreferrer nofollow"><Icon name="external" size={13} /> {s.calls_url}</a>
                )}
              </div>
              {s.last_checked_at && <div className="source-meta">{t("country.lastAudit")}: {formatDate(String(s.last_checked_at).slice(0, 10))}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
