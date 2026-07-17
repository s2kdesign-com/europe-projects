"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector.jsx";
import CountrySelector from "./country/CountrySelector.jsx";
import { useLanguage } from "./i18n/I18nProvider.jsx";
import { useCountry } from "./country/CountryProvider.jsx";
import { useSession } from "../hooks/useSession.js";
import { readMode } from "../lib/i18n/language-store.js";

async function patchProfileLanguage(body) {
  const r = await fetch("/api/profile/language", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("http_" + r.status);
  return r.json();
}

// Профилна секция „Език и регион" (виж спецификация р.8). Работи и за guest
// (локално), и за логнат потребител (синхронизира профила между устройства).
export default function LanguageRegionSection() {
  const { t } = useTranslation();
  const { lang, setLanguage, resetToDevice } = useLanguage();
  const { countryMode, setCountry, resetToAutomaticCountry, selectedCountry } = useCountry();
  const session = useSession();
  const [mode, setMode] = useState(() => readMode());
  const [status, setStatus] = useState(null); // {type:'saving'|'ok'|'err'}

  const saveManual = useCallback(async () => {
    setStatus({ type: "saving" });
    try {
      setLanguage(lang); // прилага + записва локално като ръчен избор
      if (session.authenticated) await patchProfileLanguage({ language: lang, mode: "manual" });
      setMode("manual");
      setStatus({ type: "ok" });
    } catch { setStatus({ type: "err" }); }
  }, [lang, setLanguage, session.authenticated]);

  const useDevice = useCallback(async () => {
    setStatus({ type: "saving" });
    try {
      resetToDevice(); // маха ръчния избор + разпознава наново
      if (session.authenticated) await patchProfileLanguage({ language: null, mode: "auto" });
      setMode("auto");
      setStatus({ type: "ok" });
    } catch { setStatus({ type: "err" }); }
  }, [resetToDevice, session.authenticated]);

  const onToggleAuto = useCallback((checked) => {
    if (checked) useDevice();
    else saveManual();
  }, [useDevice, saveManual]);

  return (
    <section className="prof-card" id="language">
      <h2 className="prof-section-title">{t("language.title")}</h2>
      <div className="lang-region-section">
        <p className="prose">{t("language.description")}</p>

        <label className="field" style={{ maxWidth: 420 }}>
          <span className="field-label">{t("language.systemLanguage")}</span>
          <LanguageSelector variant="profile" id="profile-lang" />
        </label>

        <label className="lang-auto-toggle">
          <input type="checkbox" checked={mode === "auto"} onChange={(e) => onToggleAuto(e.target.checked)} />
          <span>{t("language.autoToggle")}</span>
        </label>

        <div className="lang-region-actions">
          <button type="button" className="btn btn-primary" onClick={saveManual} disabled={status?.type === "saving"}>
            {t("language.save")}
          </button>
          <button type="button" className="btn" onClick={useDevice} disabled={status?.type === "saving"}>
            {t("language.useDeviceLanguage")}
          </button>
          <span className="lang-region-status" role="status" aria-live="polite">
            {status?.type === "saving" && t("common.loading")}
            {status?.type === "ok" && <span className="lang-region-status ok">{t("language.saved")}</span>}
            {status?.type === "err" && <span className="lang-region-status err">{t("language.error")}</span>}
          </span>
        </div>

        {/* Държава за финансиране (отделно от езика) — виж спецификация р.12 */}
        <div className="lang-region-country">
          <label className="field" style={{ maxWidth: 420 }}>
            <span className="field-label">{t("country.profileLabel")}</span>
            <CountrySelector variant="profile" id="profile-country" />
          </label>
          <p className="prose" style={{ marginTop: 6 }}>{t("country.profileDesc")}</p>

          <label className="lang-auto-toggle">
            <input
              type="checkbox"
              checked={countryMode === "auto"}
              onChange={(e) => (e.target.checked ? resetToAutomaticCountry() : setCountry(selectedCountry))}
            />
            <span>{t("country.autoToggle")}</span>
          </label>

          <div className="lang-region-actions">
            <button type="button" className="btn" onClick={resetToAutomaticCountry}>
              {t("country.useAuto")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
