"use client";

import Icon from "./Icon.jsx";
import { formatDate } from "../lib/project-utils.js";
import { TARGET_GROUP_LIST } from "../lib/constants.js";

function greeting(now) {
  const h = now.getHours();
  if (h < 12) return "Добро утро";
  if (h < 18) return "Добър ден";
  return "Добра вечер";
}

export default function OverviewHeader({ now, snapshot, sinceVisit, programs, overviewFilter, onOverviewFilter }) {
  return (
    <section className="ov-header" aria-label="Обзор">
      <div className="ov-greet">
        <div>
          <h2>{greeting(now)} 👋</h2>
          <p className="ov-sub">Активни и предстоящи европроцедури за България · фокус младежка заетост</p>
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
        <div className="seg-group" role="group" aria-label="Тип кандидат">
          <span className="seg-caption">Тип кандидат</span>
          <div className="segmented seg-fill">
            <button aria-pressed={!overviewFilter.target} onClick={() => onOverviewFilter({ target: "" })}>Всички</button>
            {TARGET_GROUP_LIST.map((t) => (
              <button key={t.key} aria-pressed={overviewFilter.target === t.key} onClick={() => onOverviewFilter({ target: t.key })}>
                {t.key === "youth" ? "Младежи" : "Бизнес"}
              </button>
            ))}
          </div>
        </div>

        <div className="seg-group">
          <label className="seg-caption" htmlFor="ov-prog">Програма</label>
          <select id="ov-prog" className="select" value={overviewFilter.program || ""} onChange={(e) => onOverviewFilter({ program: e.target.value || "" })}>
            <option value="">Всички програми</option>
            {programs.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
      </div>
    </section>
  );
}
