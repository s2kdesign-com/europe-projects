"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { GoogleG } from "./UserMenu.jsx";
import LanguageSelector from "./LanguageSelector.jsx";
import CountrySelector from "./country/CountrySelector.jsx";
import { useSession } from "../hooks/useSession.js";
import { APP_VERSION, CHANGELOG_SEEN_KEY } from "../lib/version.js";

const emit = (name) => window.dispatchEvent(new CustomEvent(name));
// „Как работи AI" — отваря посрещащия модал директно на AI секцията (без втори модал).
const openAiInfo = () => window.dispatchEvent(new CustomEvent("open-welcome", { detail: { section: "ai" } }));

export default function SiteFooter({ session: sessionProp }) {
  const own = useSession();
  const session = sessionProp || own;
  const { t } = useTranslation();
  const [hasNew, setHasNew] = useState(false);
  // Публична безопасна AI конфигурация (без ключове/вътрешни параметри).
  // Безопасен статичен fallback при недостъпна конфигурация.
  const [aiCfg, setAiCfg] = useState({ dailyReview: { provider: "Anthropic", model: "Claude Opus 4.8" }, systemAI: null });

  useEffect(() => {
    try { setHasNew(window.localStorage.getItem(CHANGELOG_SEEN_KEY) !== APP_VERSION); } catch { /* ignore */ }
    fetch("/api/ai/public-configuration").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.ok) setAiCfg(d); }).catch(() => {});
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner container">
        {/* Колона 1 */}
        <div className="sf-col">
          <div className="sf-brand">
            <span className="brand-mark" aria-hidden="true"><Icon name="euro" size={20} /></span>
            <span className="brand-name">{t("common.appName")}</span>
            <span className="sf-ai-badge"><Icon name="sparkle" size={13} aria-hidden="true" /> {t("footer.aiBadge")}</span>
          </div>
          <p className="sf-desc">{t("footer.brandDesc1")}</p>
          <p className="sf-desc">{t("footer.brandDesc2")}</p>
          <p className="sf-status"><Icon name="sparkle" size={14} aria-hidden="true" /> {t("footer.aiStatus")}</p>
          <div className="sf-tags" aria-hidden="true">
            <span className="sf-tag"><span className="live-dot" /> {t("footer.tagAiAnalysis")}</span>
            <span className="sf-tag"><span className="live-dot" /> {t("footer.tagDailyUpdate")}</span>
          </div>
          {/* AI модели — компактно, от публичната безопасна конфигурация.
              Зелен индикатор = моделът е реално активен. */}
          <div className="sf-ai-models">
            <h4 className="sf-title">{t("ai.modelsTitle")}</h4>
            {(() => {
              const dailyOn = !!(aiCfg.dailyReview?.lastSuccessfulRunAt && Date.now() - new Date(aiCfg.dailyReview.lastSuccessfulRunAt) < 48 * 3600 * 1000);
              const sysOn = aiCfg.systemAI?.status === "active";
              return (
                <>
                  <p className={"sf-ai-row" + (dailyOn ? " on" : "")}>
                    {dailyOn ? <span className="live-dot" aria-hidden="true" /> : <Icon name="sparkle" size={12} aria-hidden="true" />}
                    {t("ai.dailyUses", { model: aiCfg.dailyReview?.model || "Claude Opus 4.8", provider: aiCfg.dailyReview?.provider || "Anthropic" })}
                  </p>
                  {aiCfg.systemAI && (
                    <p className={"sf-ai-row" + (sysOn ? " on" : "")}>
                      {sysOn ? <span className="live-dot" aria-hidden="true" /> : <Icon name="sparkle" size={12} aria-hidden="true" />}
                      {sysOn
                        ? t("ai.systemUses", { model: aiCfg.systemAI.model, provider: aiCfg.systemAI.provider })
                        : t("ai.systemConfigured", { model: aiCfg.systemAI.model, provider: aiCfg.systemAI.provider })}
                    </p>
                  )}
                </>
              );
            })()}
            <a className="sf-link" href="/about#how-we-use-ai">{t("ai.howWeUse")}</a>
          </div>
          <div className="sf-links">
            <a className="sf-link" href="/about#about-system">{t("footer.aboutSystem")}</a>
            <a className="sf-link" href="/sources">{t("footer.dataSources")}</a>
          </div>
        </div>

        {/* Колона 2 — профил */}
        <div className="sf-col">
          {session.authenticated ? (
            <>
              <h4 className="sf-title">{t("footer.yourProfile")}</h4>
              <div className="sf-user">
                {session.user?.avatar_url ? <img className="um-avatar" src={session.user.avatar_url} alt="" width={36} height={36} referrerPolicy="no-referrer" /> : <span className="um-avatar um-initials">{(session.user?.display_name || "?").charAt(0).toUpperCase()}</span>}
                <div style={{ minWidth: 0 }}><div className="sf-user-name">{session.user?.display_name}</div><div className="sf-user-email">{session.user?.email}</div></div>
              </div>
              <div className="sf-links">
                <a className="sf-link" href="/profile">{t("footer.profileView")}</a>
                <a className="sf-link" href={session.isAdmin ? "/admin" : "/profile?section=preferences"}>{t("footer.settings")}</a>
                <button className="sf-link" onClick={() => session.logout()}>{t("footer.logout")}</button>
              </div>
            </>
          ) : (
            <>
              <h4 className="sf-title">{t("footer.guestTitle")}</h4>
              <p className="sf-desc">{t("footer.guestDesc")}</p>
              <button className="btn btn-google" onClick={() => session.login()}><GoogleG /> <span>{t("footer.googleLogin")}</span></button>
              <div className="sf-links" style={{ marginTop: 10 }}>
                <button className="sf-link" onClick={() => emit("open-welcome")}>{t("footer.whyProfile")}</button>
              </div>
            </>
          )}

          {/* Език — непосредствено под профила/логина (виж спецификация р.7) */}
          <div className="sf-lang">
            <h4 className="sf-title">{t("footer.language")}</h4>
            <p className="sf-desc">{t("footer.languageHint")}</p>
            <LanguageSelector variant="footer" id="footer-lang" />
            <p className="sf-lang-note">{t("footer.autoDetectNote")}</p>
          </div>

          {/* Държава — под езика (виж спецификация р.11) */}
          <div className="sf-lang">
            <h4 className="sf-title">{t("country.label")}</h4>
            <p className="sf-desc">{t("country.footerHint")}</p>
            <CountrySelector variant="footer" id="footer-country" />
          </div>
        </div>

        {/* Колона 3 — връзки */}
        <div className="sf-col">
          <h4 className="sf-title">{t("footer.usefulLinks")}</h4>
          <div className="sf-links sf-links-grid">
            <a className="sf-link" href="/">{t("navigation.overview")}</a>
            <a className="sf-link" href="/procedures">{t("navigation.procedures")}</a>
            <a className="sf-link" href="/calendar">{t("navigation.calendar")}</a>
            <a className="sf-link" href="/saved">{t("navigation.saved")}</a>
            <a className="sf-link" href="/changelog">{t("navigation.changelog")}{hasNew && <span className="new-dot" aria-label="нова версия" />}</a>
            <a className="sf-link" href="/about#about-system">{t("footer.aboutSystem")}</a>
            <a className="sf-link" href="/sources">{t("country.sourcesTitle")}</a>
            <a className="sf-link" href="/about#how-ai-works">{t("footer.howAiWorks")}</a>
            <a className="sf-link" href="/terms">{t("footer.terms")}</a>
            <a className="sf-link" href="/privacy">{t("footer.privacy")}</a>
            <a className="sf-link" href="/cookies">{t("footer.cookies")}</a>
            <button className="sf-link" onClick={() => emit("open-cookie-settings")}>{t("footer.cookieSettings")}</button>
            <button className="sf-link" onClick={() => emit("open-feedback")}>{t("footer.reportProblem")}</button>
          </div>
        </div>
      </div>

      <div className="sf-trust">
        <div className="container">
          <p className="sf-trust-main">{t("footer.trustMain")}</p>
          <p className="sf-trust-sub">{t("footer.trustSub")}</p>
        </div>
      </div>

      <div className="sf-bottom">
        <div className="container sf-bottom-inner">
          <span className="sf-made">
            Made with Love <span className="heart" aria-hidden="true">💗</span> by{" "}
            <a href="https://linktr.ee/Magik3a" target="_blank" rel="noopener noreferrer">Svetlin Krastanov</a>
          </span>
          <span className="sf-copy">
            <a href="https://s2kdesign.com" target="_blank" rel="noopener noreferrer">s2kdesign.com</a> © {year} {t("footer.rights")}
          </span>
          <span className="sf-version-row">
            <span className="sf-version">v{APP_VERSION}</span>
            <a className="sf-license" href="https://github.com/s2kdesign-com/europe-projects/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">{t("footer.licensed")}</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
