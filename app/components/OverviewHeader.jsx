"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { formatDate } from "../lib/project-utils.js";
import { TARGET_GROUP_LIST } from "../lib/constants.js";

function greetingKey(now) {
  const h = now.getHours();
  if (h < 12) return "common.greetingMorning";
  if (h < 18) return "common.greetingDay";
  return "common.greetingEvening";
}

export default function OverviewHeader({ now, snapshot, sinceVisit, programs, overviewFilter, onOverviewFilter }) {
  const { t } = useTranslation();
  return (
    <section className="ov-header" aria-label={t("navigation.overview")}>
      <div className="ov-greet">
        <div>
          <h2>{t(greetingKey(now))} 👋</h2>
          <p className="ov-sub">{t("overview.subtitle")}</p>
        </div>
        <div className="ov-status">
          <span className="updated">
            <span className="live-dot" />
            {snapshot?.run_date ? <>Обновено: <strong>&nbsp;{formatDate(snapshot.run_date)}</strong></> : "Данните се обновяват автоматично"}
          </span>
          <span className="ov-auto">Автоматично обновяване всеки ден</span>
        </div>
      </div>

      {(sinceVisit?.new > 0 || sinceVisit?.changed > 0 || snapshot?.summary) && (
        <div className="ov-since">
          <Icon name="sparkle" size={18} />
          <p>
            {sinceVisit && (sinceVisit.new > 0 || sinceVisit.changed > 0) ? (
              <>
                От последното ти посещение: <strong>{sinceVisit.new}</strong> нови и{" "}
                <strong>{sinceVisit.changed}</strong> обновени процедури.{" "}
              </>
            ) : null}
            {snapshot?.summary}
          </p>
        </div>
      )}

      <div className="ov-filters ov-filters-grid">
        <div className="seg-group" role="group" aria-label={t("filters.candidateType")}>
          <span className="seg-caption">{t("filters.candidateType")}</span>
          <div className="segmented seg-fill">
            <button aria-pressed={!overviewFilter.target} onClick={() => onOverviewFilter({ target: "" })}>{t("filters.all")}</button>
            {TARGET_GROUP_LIST.map((g) => (
              <button key={g.key} aria-pressed={overviewFilter.target === g.key} onClick={() => onOverviewFilter({ target: g.key })}>
                {g.key === "youth" ? t("filters.youth") : t("filters.business")}
              </button>
            ))}
          </div>
        </div>

        <div className="seg-group">
          <label className="seg-caption" htmlFor="ov-prog">{t("filters.program")}</label>
          <select id="ov-prog" className="select" value={overviewFilter.program || ""} onChange={(e) => onOverviewFilter({ program: e.target.value || "" })}>
            <option value="">{t("filters.allPrograms")}</option>
            {programs.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
      </div>
    </section>
  );
}
