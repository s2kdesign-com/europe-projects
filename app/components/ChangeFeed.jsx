"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { formatDate } from "../lib/project-utils.js";
import { PERIODS } from "../lib/constants.js";

const TYPE_ICON = { new: "sparkle", changed: "refresh" };
const TYPE_LABEL = { new: "feed.newProcedure", changed: "feed.updated" };
const TYPE_EXP = { new: "feed.addedForTracking", changed: "feed.updatedData" };

// „Какво е ново" — хронологичен поток от реални сигнали (first_seen / last_updated).
// Периодът (30/60/90 дни) филтрира този поток по дата на добавяне/промяна и живее
// в заглавния ред на секцията. Бутон за сравнение с предишна версия НЕ се показва,
// защото не пазим история на версиите (вижте ограниченията).
export default function ChangeFeed({ items, onOpen, period, onPeriod, limit = 0 }) {
  const { t } = useTranslation();
  // limit = 0 → показваме всички записи в избрания период (периодът е контролът
  // за обема на потока). Ако е подаден лимит > 0, режем до него.
  const shown = limit > 0 ? items.slice(0, limit) : items;
  return (
    <section className="ov-section" aria-labelledby="feed-h">
      <div className="ov-section-head">
        <h2 id="feed-h"><Icon name="sparkle" size={18} /> {t("feed.whatsNew")}</h2>
        <span className="count-dot">{items.length}</span>
        <div className="feed-period seg-group" role="group" aria-label={t("feed.periodAria")}>
          <div className="segmented">
            {PERIODS.map((p) => (
              <button key={p.key} aria-pressed={period === p.key} onClick={() => onPeriod(p.key)}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="state ov-empty"><Icon name="info" size={26} /><h3>{t("feed.emptyTitle")}</h3><p>{t("feed.emptyText")}</p></div>
      ) : (
        <ol className="feed">
          {shown.map((it) => (
            <li className="feed-item" key={it.id}>
              <span className={"feed-dot " + it.tone} aria-hidden="true"><Icon name={TYPE_ICON[it.type] || "info"} size={14} /></span>
              <div className="feed-body">
                <div className="feed-top">
                  <span className={"badge " + it.tone}><Icon name={TYPE_ICON[it.type]} size={12} /> {t(TYPE_LABEL[it.type] || "feed.updated", it.label)}</span>
                  {it.date && <time className="feed-date" dateTime={it.date}>{formatDate(it.date)}</time>}
                </div>
                <button className="feed-title" onClick={() => onOpen(it.project.id)} aria-haspopup="dialog">{it.project.name}</button>
                <p className="feed-exp">{t(TYPE_EXP[it.type] || "feed.updatedData", it.explanation)} <span className="feed-prog">· {it.project.program}</span></p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
