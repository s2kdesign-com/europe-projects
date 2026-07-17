"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { daysLeft, countdownLabel, intlLocale } from "../lib/project-utils.js";
import { URGENT_DAYS } from "../lib/constants.js";

// Локализирани имена (Intl), кеширани по локал. Седмицата започва от понеделник.
const _calCache = {};
function calNames() {
  const loc = intlLocale();
  if (_calCache[loc]) return _calCache[loc];
  const mFull = [], dow = [], dow1 = [];
  const mf = new Intl.DateTimeFormat(loc, { month: "long" });
  const df = new Intl.DateTimeFormat(loc, { weekday: "short" });
  for (let m = 0; m < 12; m++) mFull.push(mf.format(new Date(2021, m, 1)));
  // 2021-03-01 е понеделник → 7 поредни дни за етикетите на седмицата.
  for (let i = 0; i < 7; i++) {
    const name = df.format(new Date(2021, 2, 1 + i));
    dow.push(name.toLowerCase());
    dow1.push(name.charAt(0).toUpperCase());
  }
  const res = { MONTHS: mFull, DOW: dow, DOW1: dow1 };
  _calCache[loc] = res;
  return res;
}

export default function DeadlineCalendar({ projects, now = new Date(), onOpen }) {
  const { t } = useTranslation();
  const { MONTHS, DOW, DOW1 } = calNames();
  const [mode, setMode] = useState("month"); // "month" | "year"
  const [view, setView] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  // Индекс: "YYYY-MM-DD" -> проекти с този краен срок.
  const byDate = useMemo(() => {
    const m = new Map();
    for (const p of projects) {
      if (!p.deadline_date) continue;
      if (!m.has(p.deadline_date)) m.set(p.deadline_date, []);
      m.get(p.deadline_date).push(p);
    }
    return m;
  }, [projects]);

  const todayKey = keyOf(now);

  const shift = (dir) => {
    if (mode === "year") setView(new Date(view.getFullYear() + dir, view.getMonth(), 1));
    else setView(new Date(view.getFullYear(), view.getMonth() + dir, 1));
  };

  const openMonth = (year, month) => {
    setView(new Date(year, month, 1));
    setMode("month");
  };

  const dayEvents = (d) => (d ? byDate.get(keyOf(d)) || [] : []);
  const onDayClick = (d) => {
    const ev = dayEvents(d);
    if (ev.length === 1) onOpen(ev[0].id);
    else if (ev.length > 1) openMonth(d.getFullYear(), d.getMonth());
  };

  // Агенда: предстоящи срокове (>= днес).
  const agenda = useMemo(
    () =>
      projects
        .filter((p) => {
          const dl = daysLeft(p.deadline_date, now);
          return dl != null && dl >= 0;
        })
        .sort((a, b) => (a.deadline_date < b.deadline_date ? -1 : 1))
        .slice(0, 12),
    [projects, now]
  );

  return (
    <div>
      <div className="cal-head">
        <button className="iconbtn" onClick={() => shift(-1)} aria-label={mode === "year" ? t("calendar.prevYear") : t("calendar.prevMonth")}>
          <Icon name="chevronRight" size={18} style={{ transform: "rotate(180deg)" }} />
        </button>
        <h3>{mode === "year" ? view.getFullYear() : `${MONTHS[view.getMonth()]} ${view.getFullYear()}`}</h3>
        <button className="iconbtn" onClick={() => shift(1)} aria-label={mode === "year" ? t("calendar.nextYear") : t("calendar.nextMonth")}>
          <Icon name="chevronRight" size={18} />
        </button>
        <button className="btn btn-ghost" onClick={() => { setView(new Date(now.getFullYear(), now.getMonth(), 1)); }}>{t("calendar.today")}</button>
        <div className="segmented cal-modes" role="group" aria-label={t("calendar.viewAria")}>
          <button aria-pressed={mode === "month"} onClick={() => setMode("month")}>{t("calendar.month")}</button>
          <button aria-pressed={mode === "year"} onClick={() => setMode("year")}>{t("calendar.year")}</button>
        </div>
      </div>

      {mode === "month" ? (
        <MonthGrid view={view} byDate={byDate} now={now} todayKey={todayKey} onOpen={onOpen} DOW={DOW} gridAria={t("calendar.gridAria")} />
      ) : (
        <div className="cal-year">
          {Array.from({ length: 12 }).map((_, m) => {
            const first = new Date(view.getFullYear(), m, 1);
            const cells = buildMonth(first);
            const count = countMonthEvents(byDate, view.getFullYear(), m);
            return (
              <div className="cal-mini" key={m}>
                <div className="cal-mini-head">
                  <button className="cal-mini-name" onClick={() => openMonth(view.getFullYear(), m)}>
                    {MONTHS[m]}
                  </button>
                  {count > 0 && <span className="count-dot">{count}</span>}
                </div>
                <div className="cal-mini-grid" role="grid" aria-label={`${MONTHS[m]} ${view.getFullYear()}`}>
                  {DOW1.map((d, i) => (
                    <span key={"h" + i} className="cal-mini-dow" role="columnheader">{d}</span>
                  ))}
                  {cells.map((d, i) => {
                    if (!d) return <span key={"e" + i} className="cal-mini-day empty" />;
                    const ev = dayEvents(d);
                    const key = keyOf(d);
                    const hot = ev.some((p) => (daysLeft(p.deadline_date, now) ?? 99) <= URGENT_DAYS);
                    const cls = "cal-mini-day" + (ev.length ? " has-event" : "") + (hot ? " hot" : "") + (key === todayKey ? " today" : "");
                    return ev.length ? (
                      <button key={key} className={cls} onClick={() => onDayClick(d)} title={`${d.getDate()} ${MONTHS[m]} · ${t("calendar.deadlinesCount", { count: ev.length })}`} aria-label={`${d.getDate()} ${MONTHS[m]}, ${t("calendar.deadlinesCount", { count: ev.length })}`}>
                        {d.getDate()}
                      </button>
                    ) : (
                      <span key={key} className={cls}>{d.getDate()}</span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="cal-agenda">
        <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>{t("calendar.upcoming")}</h3>
        {agenda.length === 0 && <p className="prose">{t("calendar.noUpcoming")}</p>}
        {agenda.map((p) => {
          const dl = daysLeft(p.deadline_date, now);
          const d = new Date(p.deadline_date + "T12:00:00");
          return (
            <div className="agenda-item" key={p.id}>
              <div className="agenda-date">
                <div className="d">{d.getDate()}</div>
                <div className="m">{MONTHS[d.getMonth()].slice(0, 3)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <button onClick={() => onOpen(p.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontWeight: 700, color: "var(--ink)", fontSize: 15 }}>
                  {p.name}
                </button>
                <div className="row-sub">{p.program}</div>
              </div>
              <span className={"countdown" + (dl <= URGENT_DAYS ? " hot" : "")}>{countdownLabel(dl)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ view, byDate, now, todayKey, onOpen, DOW, gridAria }) {
  const cells = buildMonth(view);
  return (
    <div className="cal-grid" role="grid" aria-label={gridAria}>
      {DOW.map((d) => (
        <div className="cal-dow" key={d} role="columnheader">{d}</div>
      ))}
      {cells.map((c, i) => {
        const key = c ? keyOf(c) : "pad-" + i;
        const events = c ? byDate.get(key) || [] : [];
        return (
          <div key={key} className={"cal-cell" + (!c ? " pad" : "") + (key === todayKey ? " today" : "")} role="gridcell">
            {c && <div className="cal-date">{c.getDate()}</div>}
            {events.map((p) => {
              const dl = daysLeft(p.deadline_date, now);
              return (
                <button key={p.id} className={"cal-ev" + (dl != null && dl <= URGENT_DAYS ? " hot" : "")} onClick={() => onOpen(p.id)} title={p.name}>
                  {p.name}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function buildMonth(view) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // понеделник = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function countMonthEvents(byDate, year, month) {
  let n = 0;
  const p = (x) => String(x).padStart(2, "0");
  const prefix = `${year}-${p(month + 1)}-`;
  for (const [k, arr] of byDate) if (k.startsWith(prefix)) n += arr.length;
  return n;
}

function keyOf(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
