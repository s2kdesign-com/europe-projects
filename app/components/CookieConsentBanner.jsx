"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";

// Компактен банер (mode="banner") ИЛИ отделен settings модал (mode="settings").
export default function CookieConsentBanner({ mode, consent, onAcceptAll, onNecessaryOnly, onOpenSettings, onSave, onClose }) {
  const { t } = useTranslation();
  if (mode === "settings") return <Settings consent={consent} onSave={onSave} onClose={onClose} />;

  return (
    <div className="cookie-banner" role="region" aria-label={t("cookies.region")}>
      <p className="cookie-text">
        <Icon name="info" size={16} />
        <span>
          <span className="cookie-text-full">{t("cookies.message")}</span>
          <span className="cookie-text-short">{t("cookies.messageShort")}</span>
        </span>
      </p>
      <div className="cookie-actions">
        <button className="btn btn-primary" onClick={onAcceptAll}>{t("cookies.acceptAll")}</button>
        <button className="btn" onClick={onNecessaryOnly}>{t("cookies.necessaryOnly")}</button>
        <button className="btn btn-ghost cookie-more" onClick={onOpenSettings}><Icon name="filter" size={16} /> {t("cookies.settings")}</button>
      </div>
    </div>
  );
}

function Settings({ consent, onSave, onClose }) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true, onClose);
  const [analytics, setAnalytics] = useState(!!(consent && consent.analytics));
  return (
    <div className="overlay cookie-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cookie-settings" role="dialog" aria-modal="true" aria-labelledby="cookie-title" ref={trapRef}>
        <div className="cookie-settings-head">
          <h2 id="cookie-title">{t("cookies.settingsTitle")}</h2>
          <button className="drawer-close" style={{ width: 40, height: 40 }} onClick={onClose} aria-label={t("cookies.close")}><Icon name="close" size={18} /></button>
        </div>
        <div className="cookie-settings-body">
          <div className="cookie-cat">
            <div><strong>{t("cookies.necessary")}</strong><span>{t("cookies.necessaryDesc")}</span></div>
            <input type="checkbox" checked disabled aria-label={t("cookies.necessaryAria")} />
          </div>
          <div className="cookie-cat">
            <div><strong>{t("cookies.analytics")}</strong><span>{t("cookies.analyticsDesc")}</span></div>
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} aria-label={t("cookies.analyticsAria")} />
          </div>
          <p className="chart-note"><Icon name="info" size={13} /> {t("cookies.note")} <a href="/cookies">{t("cookies.policyLink")}</a>.</p>
        </div>
        <div className="cookie-settings-actions">
          <button className="btn btn-primary" onClick={() => onSave({ analytics })}><Icon name="check" size={16} /> {t("cookies.saveChoice")}</button>
          <button className="btn" onClick={onClose}>{t("cookies.cancel")}</button>
        </div>
      </div>
    </div>
  );
}
