"use client";

import { useState } from "react";
import Icon from "./Icon.jsx";
import { ACTIVITY_PERIODS } from "../lib/constants.js";
import { activityInsight } from "../lib/overview-utils.js";

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

function TrendPill({ trend }) {
  if (!trend || trend.kind === "none") return <span className="act-trend flat"><span aria-hidden="true">—</span> Няма данни</span>;
  if (trend.kind === "nobase") return <span className="act-trend flat"><span aria-hidden="true">—</span> Няма база</span>;
  const glyph = trend.kind === "up" ? "▲" : trend.kind === "down" ? "▼" : "▬";
  const sign = trend.pct > 0 ? "+" : "";
  const word = trend.kind === "up" ? "нагоре" : trend.kind === "down" ? "надолу" : "без промяна";
  return (
    <span className={"act-trend " + trend.kind}>
      <span aria-hidden="true">{glyph}</span> {sign}{trend.pct}% <span className="sr-only">({word} спрямо предходния период)</span>
    </span>
  );
}

export default function ProcedureActivity({ activity, period, onPeriod, onSelectWeek, onSeeAll, onLonger, loading, error, onRetry }) {
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
      ? `Активност по седмици за избрания период: ${s.newTotal} нови и ${s.changedTotal} актуализирани процедури, общо ${s.total}.`
      : "Няма нови или актуализирани процедури за избрания период.";

  const periodControl = (
    <div className="act-period seg-group" role="group" aria-label="Период на активността">
      <div className="segmented">
        {ACTIVITY_PERIODS.map((p) => (
          <button key={p.key} aria-pressed={period === p.key} onClick={() => onPeriod(p.key)}>{p.label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <section className="ov-section act-section" aria-labelledby="act-h">
      <div className="ov-section-head act-head">
        <div className="act-titles">
          <h2 id="act-h"><Icon name="sparkle" size={18} /> Активност на процедурите</h2>
          <p className="act-sub">Нови и актуализирани възможности през избрания период</p>
        </div>
        {periodControl}
      </div>

      {/* Обобщаващи показатели */}
      <div className="act-summary" role="group" aria-label="Обобщение">
        <div className="act-stat"><span className="act-stat-n">{s.newTotal}</span><span className="act-stat-l"><span className="dot violet" aria-hidden="true" /> Нови</span></div>
        <div className="act-stat"><span className="act-stat-n">{s.changedTotal}</span><span className="act-stat-l"><span className="dot blue" aria-hidden="true" /> Актуализирани</span></div>
        <div className="act-stat"><span className="act-stat-n">{s.total}</span><span className="act-stat-l">Общо промени</span></div>
        <div className="act-stat"><span className="act-stat-n"><TrendPill trend={s.trend} /></span><span className="act-stat-l">Тенденция</span></div>
      </div>

      {activity && activity.hasData && <p className="act-insight"><Icon name="info" size={14} /> {activityInsight(activity)}</p>}

      {/* Тяло: skeleton / грешка / празно / диаграма */}
      {loading ? (
        <div className="act-chart act-skeleton" aria-hidden="true"><div className="act-plot" /></div>
      ) : error ? (
        <div className="state ov-empty">
          <Icon name="alert" size={26} />
          <h3>Данните не се заредиха</h3>
          <p>Възникна грешка при изчисляване на активността.</p>
          <button className="btn btn-primary" onClick={onRetry}>Опитай отново</button>
        </div>
      ) : !activity || !activity.hasData ? (
        <div className="state ov-empty">
          <Icon name="sparkle" size={26} />
          <h3>Няма нови или актуализирани процедури за избрания период.</h3>
          <p>Изберете по-дълъг период или разгледайте всички процедури.</p>
          <div className="act-empty-actions">
            {period !== "90" && <button className="btn" onClick={() => onPeriod("90")}>Покажи 90 дни</button>}
            <button className="btn btn-primary" onClick={onSeeAll}>Разгледай процедурите</button>
          </div>
        </div>
      ) : (
        <div className="act-chart">
          <div className="act-legend" aria-hidden="true">
            <span className="lg"><span className="dot violet" /> Нови процедури</span>
            <span className="lg"><span className="dot blue" /> Актуализирани процедури</span>
          </div>

          <div className="act-plot" role="img" aria-label={ariaDesc}>
            <div className="act-grid">
              {ticks.map((t) => (
                <div key={t} className="act-grid-line" style={{ bottom: `${(t / niceMax) * 100}%` }}>
                  <span className="act-tick">{t}</span>
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
                      aria-label={`${w.tooltip}: ${w.new} нови процедури — отвори`}
                      onFocus={() => setHover(i)}
                      onClick={() => w.new > 0 && onSelectWeek("new", w.start, w.end)}
                    />
                    <button
                      type="button"
                      className="act-bar changed"
                      style={{ height: `${(w.changed / niceMax) * 100}%` }}
                      disabled={w.changed === 0}
                      aria-label={`${w.tooltip}: ${w.changed} актуализирани процедури — отвори`}
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
                <span><span className="dot violet" /> Нови процедури: {weeks[hover].new}</span>
                <span><span className="dot blue" /> Актуализирани процедури: {weeks[hover].changed}</span>
                <span className="act-tip-total">Общо: {weeks[hover].total}</span>
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
            <caption>Активност на процедурите по седмици</caption>
            <thead>
              <tr><th scope="col">Седмица</th><th scope="col">Нови</th><th scope="col">Актуализирани</th><th scope="col">Общо</th></tr>
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
