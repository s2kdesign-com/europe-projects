"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { ACTIVITY_PERIODS } from "../lib/constants.js";

// Изчислява „приятен" максимум и целочислени деления за Y оста.
function niceTicks(maxVal) {
  const m = Math.max(1, maxVal);
  let step = 1;
  if (m > 5 && m <= 10) step = 2;
  else if (m > 10 && m <= 25) step = 5;
  else if (m > 25 && m <= 50) step = 10;
  else if (m > 50) step = Math.ceil(m / 5 / 10) * 10;
  const niceMax = Math.ceil(m / step) * step;
  const ticks = [];
  for (let t = 0; t <= niceMax; t += step) ticks.push(t);
  return { niceMax, ticks };
}

function TrendPill({ trend, t }) {
  if (!trend || trend.kind === "none") return <span className="act-trend flat"><span aria-hidden="true">—</span> {t("activity.noData")}</span>;
  if (trend.kind === "nobase") return <span className="act-trend flat"><span aria-hidden="true">—</span> {t("activity.noBase")}</span>;
  const glyph = trend.kind === "up" ? "▲" : trend.kind === "down" ? "▼" : "▬";
  const sign = trend.pct > 0 ? "+" : "";
  const word = trend.kind === "up" ? t("activity.up") : trend.kind === "down" ? t("activity.down") : t("activity.flat");
  return (
    <span className={"act-trend " + trend.kind}>
      <span aria-hidden="true">{glyph}</span> {sign}{trend.pct}% <span className="sr-only">{t("activity.trendSr", { word })}</span>
    </span>
  );
}

// Текстово заключение (локализирано; числата се вмъкват в компонента).
function insightText(activity, t) {
  if (!activity || !activity.hasData) return t("activity.insightNoData");
  const parts = [];
  if (activity.mostActive) parts.push(t("activity.insightMostActive", { week: activity.mostActive.label, count: activity.mostActive.total }));
  const tr = activity.summary.trend;
  if (tr.kind === "up") parts.push(t("activity.insightUp", { pct: tr.pct }));
  else if (tr.kind === "down") parts.push(t("activity.insightDown", { pct: Math.abs(tr.pct) }));
  else if (tr.kind === "nobase" || tr.kind === "none") parts.push(t("activity.insightNoData"));
  return parts.join(" ");
}

export default function ProcedureActivity({ activity, period, onPeriod, onSelectWeek, onSeeAll, onLonger, loading, error, onRetry }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(-1);
  const weeks = activity ? activity.weeks : [];
  const s = activity ? activity.summary : { newTotal: 0, changedTotal: 0, total: 0, trend: { kind: "none" } };

  const maxVal = weeks.reduce((mx, w) => Math.max(mx, w.new, w.changed), 0);
  const { niceMax, ticks } = niceTicks(maxVal);

  // Прореждане на етикетите по X (по-малко на тесен екран).
  const n = weeks.length;
  const stepD = Math.max(1, Math.ceil(n / 8));
  const stepM = Math.max(1, Math.ceil(n / 4));
  const showD = (i) => i % stepD === 0 || i === n - 1;
  const showM = (i) => i % stepM === 0 || i === n - 1;

  const ariaDesc =
    activity && activity.hasData
      ? t("activity.ariaDesc", { new: s.newTotal, changed: s.changedTotal, total: s.total })
      : t("activity.ariaEmpty");

  const periodControl = (
    <div className="act-period seg-group" role="group" aria-label={t("activity.periodAria")}>
      <div className="segmented">
        {ACTIVITY_PERIODS.map((p) => (
          <button key={p.key} aria-pressed={period === p.key} onClick={() => onPeriod(p.key)}>{t(`period.${p.key}`)}</button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="ov-section act-section" aria-labelledby="act-h">
      <div className="ov-section-head act-head">
        <div className="act-titles">
          <h2 id="act-h"><Icon name="sparkle" size={18} /> {t("activity.title")}</h2>
          <p className="act-sub">{t("activity.subtitle")}</p>
        </div>
        {periodControl}
      </div>

      {/* Обобщаващи показатели */}
      <div className="act-summary" role="group" aria-label={t("activity.summaryAria")}>
        <div className="act-stat"><span className="act-stat-n">{s.newTotal}</span><span className="act-stat-l"><span className="dot violet" aria-hidden="true" /> {t("activity.new")}</span></div>
        <div className="act-stat"><span className="act-stat-n">{s.changedTotal}</span><span className="act-stat-l"><span className="dot blue" aria-hidden="true" /> {t("activity.updated")}</span></div>
        <div className="act-stat"><span className="act-stat-n">{s.total}</span><span className="act-stat-l">{t("activity.totalChanges")}</span></div>
        <div className="act-stat"><span className="act-stat-n"><TrendPill trend={s.trend} t={t} /></span><span className="act-stat-l">{t("activity.trend")}</span></div>
      </div>

      {activity && activity.hasData && <p className="act-insight"><Icon name="info" size={14} /> {insightText(activity, t)}</p>}

      {/* Тяло: skeleton / грешка / празно / диаграма */}
      {loading ? (
        <div className="act-chart act-skeleton" aria-hidden="true"><div className="act-plot" /></div>
      ) : error ? (
        <div className="state ov-empty">
          <Icon name="alert" size={26} />
          <h3>{t("activity.loadError")}</h3>
          <p>{t("activity.loadErrorText")}</p>
          <button className="btn btn-primary" onClick={onRetry}>{t("activity.retry")}</button>
        </div>
      ) : !activity || !activity.hasData ? (
        <div className="state ov-empty">
          <Icon name="sparkle" size={26} />
          <h3>{t("activity.emptyTitle")}</h3>
          <p>{t("activity.emptyText")}</p>
          <div className="act-empty-actions">
            {period !== "90" && <button className="btn" onClick={() => onPeriod("90")}>{t("activity.show90")}</button>}
            <button className="btn btn-primary" onClick={onSeeAll}>{t("activity.browse")}</button>
          </div>
        </div>
      ) : (
        <div className="act-chart">
          <div className="act-legend" aria-hidden="true">
            <span className="lg"><span className="dot violet" /> {t("activity.legendNew")}</span>
            <span className="lg"><span className="dot blue" /> {t("activity.legendUpdated")}</span>
          </div>

          <div className="act-plot" role="img" aria-label={ariaDesc}>
            <div className="act-grid">
              {ticks.map((tk) => (
                <div key={tk} className="act-grid-line" style={{ bottom: `${(tk / niceMax) * 100}%` }}>
                  <span className="act-tick">{tk}</span>
                </div>
              ))}
            </div>

            <div className="act-cols" onMouseLeave={() => setHover(-1)}>
              {weeks.map((w, i) => (
                <div
                  key={w.start}
                  className={"act-col" + (hover === i ? " hot" : "")}
                  onMouseEnter={() => setHover(i)}
                >
                  <div className="act-bars">
                    <button
                      type="button"
                      className="act-bar new"
                      style={{ height: `${(w.new / niceMax) * 100}%` }}
                      disabled={w.new === 0}
                      aria-label={t("activity.barNewAria", { week: w.tooltip, count: w.new })}
                      onFocus={() => setHover(i)}
                      onClick={() => w.new > 0 && onSelectWeek("new", w.start, w.end)}
                    />
                    <button
                      type="button"
                      className="act-bar changed"
                      style={{ height: `${(w.changed / niceMax) * 100}%` }}
                      disabled={w.changed === 0}
                      aria-label={t("activity.barUpdatedAria", { week: w.tooltip, count: w.changed })}
                      onFocus={() => setHover(i)}
                      onClick={() => w.changed > 0 && onSelectWeek("changed", w.start, w.end)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {hover >= 0 && weeks[hover] && (
              <div
                className="act-tip"
                style={{ left: `${Math.min(85, Math.max(15, ((hover + 0.5) / n) * 100))}%` }}
                role="status"
              >
                <strong>{weeks[hover].tooltip}</strong>
                <span><span className="dot violet" /> {t("activity.tipNew")} {weeks[hover].new}</span>
                <span><span className="dot blue" /> {t("activity.tipUpdated")} {weeks[hover].changed}</span>
                <span className="act-tip-total">{t("activity.tipTotal")} {weeks[hover].total}</span>
              </div>
            )}
          </div>

          <div className="act-xaxis">
            {weeks.map((w, i) => (
              <div className="act-xcell" key={w.start}>
                {showD(i) && <span className={"act-xlabel" + (showM(i) ? "" : " hide-sm")}>{w.labelShort}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Достъпен текстов еквивалент */}
      {activity && activity.hasData && (
        <div className="sr-only">
          <table>
            <caption>{t("activity.srCaption")}</caption>
            <thead>
              <tr><th scope="col">{t("activity.srWeek")}</th><th scope="col">{t("activity.srNew")}</th><th scope="col">{t("activity.srUpdated")}</th><th scope="col">{t("activity.srTotal")}</th></tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.start}><th scope="row">{w.tooltip}</th><td>{w.new}</td><td>{w.changed}</td><td>{w.total}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
