"use client";

import Icon from "./Icon.jsx";
import { formatDate } from "../lib/project-utils.js";
import { PERIODS } from "../lib/constants.js";

const TYPE_ICON = { new: "sparkle", changed: "refresh" };

// „Какво е ново" — хронологичен поток от реални сигнали (first_seen / last_updated).
// Периодът (30/60/90 дни) филтрира този поток по дата на добавяне/промяна и живее
// в заглавния ред на секцията. Бутон за сравнение с предишна версия НЕ се показва,
// защото не пазим история на версиите (вижте ограниченията).
export default function ChangeFeed({ items, onOpen, period, onPeriod, limit = 8 }) {
  return (
    <section className="ov-section" aria-labelledby="feed-h">
      <div className="ov-section-head">
        <h2 id="feed-h"><Icon name="sparkle" size={18} /> Какво е ново</h2>
        <span className="count-dot">{items.length}</span>
        <div className="feed-period seg-group" role="group" aria-label="Период на промените">
          <div className="segmented">
            {PERIODS.map((p) => (
              <button key={p.key} aria-pressed={period === p.key} onClick={() => onPeriod(p.key)}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="state ov-empty"><Icon name="info" size={26} /><h3>Няма нови промени</h3><p>В избрания период няма нови или обновени процедури.</p></div>
      ) : (
        <ol className="feed">
          {items.slice(0, limit).map((it) => (
            <li className="feed-item" key={it.id}>
              <span className={"feed-dot " + it.tone} aria-hidden="true"><Icon name={TYPE_ICON[it.type] || "info"} size={14} /></span>
              <div className="feed-body">
                <div className="feed-top">
                  <span className={"badge " + it.tone}><Icon name={TYPE_ICON[it.type]} size={12} /> {it.label}</span>
                  {it.date && <time className="feed-date" dateTime={it.date}>{formatDate(it.date)}</time>}
                </div>
                <button className="feed-title" onClick={() => onOpen(it.project.id)} aria-haspopup="dialog">{it.project.name}</button>
                <p className="feed-exp">{it.explanation} <span className="feed-prog">· {it.project.program}</span></p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
