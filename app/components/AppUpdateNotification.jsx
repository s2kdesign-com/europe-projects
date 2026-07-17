"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";

// Проверява за незапазена работа преди презареждане (без дълбока интеграция):
// отворен feedback модал или видимо поле/бележка с въведен текст.
function hasUnsavedWork() {
  try {
    if (document.querySelector(".feedback-modal, .fb-form")) return true;
    const fields = document.querySelectorAll("textarea, .note-input, input[type='text'], input[type='search']");
    for (const f of fields) {
      if (f.value && f.value.trim() && f.offsetParent !== null && f.type !== "search") return true;
    }
  } catch { /* ignore */ }
  return false;
}

// Компактно известие за нова версия. role=status (учтиво) за нормални обновления,
// role=alertdialog за critical. Не мести автоматично фокуса при нормалното.
export default function AppUpdateNotification({ update, onRefresh, onSnooze, onChangelog }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!update) return null;
  const critical = !!update.critical;

  const startRefresh = () => {
    if (busy) return;
    if (hasUnsavedWork()) { setConfirming(true); return; }
    setBusy(true);
    onRefresh();
  };
  const confirmRefresh = () => { setConfirming(false); setBusy(true); onRefresh(); };

  return (
    <div
      className={"appupd" + (critical ? " critical" : "")}
      role={critical ? "alertdialog" : "status"}
      aria-live={critical ? "assertive" : "polite"}
      aria-labelledby="appupd-title"
      aria-describedby="appupd-desc"
    >
      <button className="appupd-x" onClick={onSnooze} aria-label={t("update.close")}><Icon name="close" size={16} /></button>

      <div className="appupd-head">
        <span className={"appupd-ico" + (critical ? " crit" : "")} aria-hidden="true"><Icon name={critical ? "alert" : "refresh"} size={18} /></span>
        <h2 id="appupd-title">{critical ? t("update.criticalTitle") : t("update.available")}</h2>
      </div>

      <p id="appupd-desc" className="appupd-text">
        {critical ? t("update.criticalText") : t("update.text")}
      </p>

      {update.version && <div className="appupd-ver">{t("update.newVersion")} <strong>v{update.version}</strong></div>}
      {update.releaseSummary && <p className="appupd-sum">{update.releaseSummary}</p>}

      {confirming ? (
        <div className="appupd-confirm" role="alertdialog" aria-label={t("update.unsavedTitle")}>
          <strong>{t("update.unsavedTitle")}</strong>
          <p>{t("update.unsavedText")}</p>
          <div className="appupd-actions">
            <button className="btn btn-primary" onClick={confirmRefresh}>{t("update.refreshAnyway")}</button>
            <button className="btn" onClick={() => setConfirming(false)}>{t("update.goBack")}</button>
          </div>
        </div>
      ) : (
        <div className="appupd-actions">
          <button className="btn btn-primary appupd-refresh" onClick={startRefresh} disabled={busy} aria-busy={busy || undefined}>
            {busy ? (
              <><span className="appupd-spin" aria-hidden="true" /> {t("update.updating")}<span className="sr-only">{t("update.updatingSr")}</span></>
            ) : (
              <><Icon name="refresh" size={16} /> {t("update.updateNow")}</>
            )}
          </button>
          <button className="btn" onClick={onChangelog} disabled={busy}>{t("update.whatsNew")}</button>
          <button className="btn btn-ghost" onClick={onSnooze} disabled={busy}>{t("update.later")}</button>
        </div>
      )}
    </div>
  );
}
