"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { GoogleG } from "./UserMenu.jsx";
import LanguageSelector from "./LanguageSelector.jsx";
import CountrySelector, { FlagImg } from "./country/CountrySelector.jsx";
import { useCountry } from "./country/CountryProvider.jsx";
import { getCountry } from "../lib/country/countries.js";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { APP_VERSION_LABEL, DATA_SOURCES_TEXT } from "../lib/version.js";

// Четирите предимства. Първите три са реален AI анализ (ежедневната задача чете и
// структурира процедури, документи и бюджети). Четвъртата е детерминистично
// сравнение с профила (не LLM) — затова НЕ я наричаме „AI".
const AI_FEATURES = [
  { icon: "sparkle", tKey: "f1" },
  { icon: "document", tKey: "f2" },
  { icon: "euro", tKey: "f3" },
  { icon: "users", tKey: "f4" },
];

const AI_STEP_KEYS = ["step1", "step2", "step3", "step4", "step5"];

export default function SystemWelcomeModal({ onClose, onLogin, initialSection = null }) {
  const { t, i18n } = useTranslation();
  const trapRef = useFocusTrap(true, onClose);
  const [aiOpen, setAiOpen] = useState(initialSection === "ai");
  const aiRef = useRef(null);
  // Публична безопасна AI конфигурация (както във footer-а) — без ключове/вътрешни данни.
  const [aiCfg, setAiCfg] = useState({ dailyReview: { provider: "Anthropic", model: "Claude Opus 4.8" }, systemAI: null });
  useEffect(() => {
    fetch("/api/ai/public-configuration").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.ok) setAiCfg(d); }).catch(() => {});
  }, []);
  const { selectedCountry, suggestedCountry, setCountry } = useCountry();
  const [countryCollapsed, setCountryCollapsed] = useState(false);
  const uiLang = i18n.language;
  const suggested = suggestedCountry ? getCountry(suggestedCountry) : null;
  const current = getCountry(selectedCountry);
  const cLabel = (c) => (c ? (uiLang === "bg" ? c.nameBg : c.english) : "");

  // Дълбок линк от footer-а: „Как работи AI" отваря модала директно на AI секцията.
  useEffect(() => {
    if (initialSection === "ai" && aiRef.current) {
      aiRef.current.scrollIntoView({ block: "center" });
    }
  }, [initialSection]);

  return (
    <div className="overlay welcome-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" ref={trapRef}>
        <button className="drawer-close welcome-x" onClick={onClose} aria-label={t("welcome.close")}><Icon name="close" size={20} /></button>

        <div className="welcome-scroll">
          {/* Секция 0 — Вашата държава + Вашият език (две колони).
              След „Потвърди държавата" се сгъва анимирано и съдържанието се качва. */}
          <section className={"welcome-sec welcome-country" + (countryCollapsed ? " is-collapsed" : "")} aria-hidden={countryCollapsed}>
            <div className="wc-cols">
              <div className="wc-col">
                <div className="wc-head">
                  <FlagImg country={current} size={22} />
                  <h3>{t("country.modalTitle")}</h3>
                </div>
                <CountrySelector variant="modal" id="welcome-country" />
              </div>
              <div className="wc-col">
                <div className="wc-head">
                  <Icon name="info" size={16} aria-hidden="true" />
                  <h3>{t("welcome.yourLanguage")}</h3>
                </div>
                <LanguageSelector variant="welcome" id="welcome-lang" />
              </div>
            </div>
            {suggested && suggested.code !== "BG" && (
              <p className="wc-suggested">{t("country.suggested", { country: cLabel(suggested) })}</p>
            )}
            <p className="wc-sub">{t("country.suggestedSub")}</p>
            <div className="wc-actions">
              <button className="btn btn-primary" onClick={() => { setCountry(selectedCountry); setCountryCollapsed(true); }}>{t("country.confirm")}</button>
            </div>
            <p className="wc-privacy"><Icon name="info" size={13} aria-hidden="true" /> {t("country.privacyNote")}</p>
          </section>

          {/* Секция 1 — Добре дошли */}
          <section className="welcome-sec">
            <span className="welcome-mark" aria-hidden="true"><Icon name="euro" size={28} /></span>
            <span className="ai-badge"><Icon name="sparkle" size={14} aria-hidden="true" /> {t("welcome.aiBadge")}</span>
            <p className="welcome-eyebrow">{t("welcome.eyebrow")}</p>
            <h2 id="welcome-title">{t("welcome.title")}</h2>
            <p className="welcome-lead">{t("welcome.lead")}</p>

            <div className="welcome-benefits ai4">
              {AI_FEATURES.map((b) => (
                <div className="welcome-benefit" key={b.tKey}>
                  <span className="wb-ico" aria-hidden="true"><Icon name={b.icon} size={18} /></span>
                  <div><strong>{t(`welcome.${b.tKey}t`)}</strong><span>{t(`welcome.${b.tKey}x`)}</span></div>
                </div>
              ))}
            </div>

            {/* Как AI помага — компактен, разгъваем блок */}
            <div className="ai-help" ref={aiRef}>
              <div className="ai-help-top">
                <h3><Icon name="sparkle" size={16} aria-hidden="true" /> {t("welcome.howTitle")}</h3>
                <button className="ai-help-toggle" aria-expanded={aiOpen} aria-controls="ai-help-body" onClick={() => setAiOpen((o) => !o)}>
                  {t("welcome.howToggle")} <Icon name={aiOpen ? "chevronDown" : "arrowRight"} size={14} aria-hidden="true" />
                </button>
              </div>
              <p className="ai-help-lead">{t("welcome.howLead")}</p>
              {aiOpen && (
                <div id="ai-help-body">
                  <ul className="ai-steps">
                    {AI_STEP_KEYS.map((s) => (<li key={s}><Icon name="check" size={14} aria-hidden="true" /> {t(`welcome.${s}`)}</li>))}
                  </ul>
                  <p className="ai-help-accent">{t("welcome.howAccent")}</p>
                </div>
              )}
            </div>

            <p className="welcome-note"><Icon name="info" size={14} aria-hidden="true" /> {t("welcome.note", { sources: DATA_SOURCES_TEXT })}</p>
            <p className="welcome-disclaimer">{t("welcome.disclaimer")}</p>
          </section>

          {/* Секция 2 — Вход + избор на език */}
          <section className="welcome-sec welcome-login">
            <h3>{t("welcome.loginTitle")}</h3>
            <button className="btn btn-google btn-google-lg" onClick={onLogin}><GoogleG size={20} /> {t("welcome.loginBtn")}</button>
            <p className="welcome-login-text">{t("welcome.loginText")}</p>

            <button className="btn welcome-guest" onClick={onClose}>{t("welcome.guest")}</button>
            <p className="welcome-legal">
              {t("welcome.legalPre")}<a href="/terms">{t("welcome.legalTerms")}</a>{t("welcome.legalAnd")}<a href="/privacy">{t("welcome.legalPrivacy")}</a>{t("welcome.legalPost")}
            </p>
          </section>

          {/* Секция 3 — AI модели (публична безопасна конфигурация) */}
          <section className="welcome-sec welcome-ai-models">
            <h3>{t("ai.modelsTitle")}</h3>
            <p className="wm-ai-row"><Icon name="sparkle" size={13} aria-hidden="true" /> {t("ai.dailyUses", { model: aiCfg.dailyReview?.model || "Claude Opus 4.8", provider: aiCfg.dailyReview?.provider || "Anthropic" })}</p>
            {aiCfg.systemAI && (
              <p className="wm-ai-row"><Icon name="sparkle" size={13} aria-hidden="true" /> {aiCfg.systemAI.status === "active"
                ? t("ai.systemUses", { model: aiCfg.systemAI.model, provider: aiCfg.systemAI.provider })
                : t("ai.systemConfigured", { model: aiCfg.systemAI.model, provider: aiCfg.systemAI.provider })}</p>
            )}
            <a className="welcome-link" href="/about#how-we-use-ai">
              <Icon name="sparkle" size={16} /> {t("ai.howWeUse")}
            </a>
          </section>

          {/* Секция 4 — Полезно */}
          <section className="welcome-sec welcome-links">
            <h3>{t("welcome.usefulTitle")}</h3>
            <div className="welcome-links-row">
              <a className="welcome-link" href="/changelog"><Icon name="sparkle" size={16} /> {t("welcome.linkChangelog")}</a>
              <a className="welcome-link" href="/about"><Icon name="info" size={16} /> {t("footer.aboutSystem")}</a>
              <a className="welcome-link" href="/sources"><Icon name="layers" size={16} /> {t("country.sourcesTitle")}</a>
              <a className="welcome-link" href="/how-ai-works"><Icon name="sparkle" size={16} /> {t("footer.howAiWorks")}</a>
              <a className="welcome-link" href="/terms"><Icon name="document" size={16} /> {t("footer.terms")}</a>
              <a className="welcome-link" href="/privacy"><Icon name="alert" size={16} /> {t("welcome.linkPrivacy")}</a>
              <a className="welcome-link" href="/cookies"><Icon name="info" size={16} /> {t("welcome.linkCookies")}</a>
            </div>
            <p className="welcome-version">{APP_VERSION_LABEL}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
