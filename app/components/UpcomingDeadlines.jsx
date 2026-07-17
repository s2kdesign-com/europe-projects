"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { daysLeft, countdownLabel, formatDate } from "../lib/project-utils.js";
import { deadlineProgress, changedAfterSave } from "../lib/overview-utils.js";
import { URGENT_DAYS } from "../lib/constants.js";

const BUCKET_TONE = { overdue: "neutral", "3": "red", "7": "red", "14": "amber", "30": "blue" };

function Timeline({ p, now }) {
  const pct = deadlineProgress(p, now);
  if (pct == null) return null;
  const hot = (daysLeft(p.deadline_date, now) ?? 99) <= URGENT_DAYS;
  return (
    <div className="timeline" role="img" aria-label={`Изминали ${pct}% до крайния срок`}>
      <div className={"timeline-fill" + (hot ? " hot" : "")} style={{ width: pct + "%" }} />
      <span className="timeline-pct">{pct}%</span>
    </div>
  );
}

function Row({ p, now, saved, savedMeta, onOpen, onToggleSave, onCalendar }) {
  const dl = daysLeft(p.deadline_date, now);
  const hasDocs = (p.doc_count || 0) > 0;
  const changed = saved && changedAfterSave(p, savedMeta);
  return (
    <div className="dl-row">
      <div className="dl-main">
        <button className="dl-title" onClick={() => onOpen(p.id)} aria-haspopup="dialog">
          {p.name}
        </button>
        <div className="dl-sub">
          {p.program}
          {p.deadline_date ? " · " + formatDate(p.deadline_date) : ""}
        </div>
        <Timeline p={p} now={now} />
      </div>
      <div className="dl-side">
        <span className={"countdown" + ((dl ?? 99) <= URGENT_DAYS ? " hot" : "")}>{countdownLabel(dl)}</span>
        <div className="dl-flags">
          <span className={"flag " + (hasDocs ? "ok" : "warn")} title={hasDocs ? "Има публикувани документи" : "Няма публикувани условия"}>
            <Icon name="document" size={13} /> {hasDocs ? p.doc_count : "0"}
          </span>
          {saved && <span className="flag ok" title="Запазена"><Icon name="bookmarkFilled" size={13} /></span>}
          {changed && <span className="flag warn" title="Променена след запазване"><Icon name="refresh" size={13} /> промяна</span>}
        </div>
        <div className="dl-actions">
          <button className="iconbtn" aria-label="Запази" aria-pressed={saved} onClick={() => onToggleSave(p)}><Icon name={saved ? "bookmarkFilled" : "bookmark"} size={16} /></button>
          {p.deadline_date && <button className="iconbtn" aria-label="Добави в календар" onClick={() => onCalendar(p)}><Icon name="calendar" size={16} /></button>}
        </div>
      </div>
    </div>
  );
}

export default function UpcomingDeadlines({ buckets, now, isSaved, savedMeta, onOpen, onToggleSave, onCalendar, onOpenCalendar }) {
  const { t } = useTranslation();
  const [view, setView] = useState("grouped");
  const total = buckets.reduce((a, b) => a + b.items.length, 0);

  return (
    <section className="ov-section" aria-labelledby="dl-h">
      <div className="ov-section-head">
        <h2 id="dl-h"><Icon name="clock" size={18} /> {t("sections.upcoming")}</h2>
        <span className="count-dot">{total}</span>
        <div className="segmented ov-view" role="group" aria-label="Изглед">
          <button aria-pressed={view === "grouped"} onClick={() => setView("grouped")} title="По спешност"><Icon name="layers" size={15} /></button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")} title="Списък"><Icon name="list" size={15} /></button>
          <button onClick={onOpenCalendar} title="Календар"><Icon name="calendar" size={15} /></button>
        </div>
      </div>

      {total === 0 ? (
        <div className="state ov-empty"><Icon name="calendar" size={26} /><h3>{t("urgency.emptyTitle")}</h3><p>{t("urgency.emptyText")}</p></div>
      ) : view === "grouped" ? (
        buckets.map((b) => (
          <div className="dl-bucket" key={b.key}>
            <div className="dl-bucket-head">
              <span className={"badge " + (BUCKET_TONE[b.key] || "neutral")}><Icon name="clock" size={13} /> {t("urgency." + b.key, b.label)}</span>
              <span className="count-dot">{b.items.length}</span>
            </div>
            <div className="dl-list">
              {b.items.map((p) => (
                <Row key={p.id} p={p} now={now} saved={isSaved(p.id)} savedMeta={savedMeta} onOpen={onOpen} onToggleSave={onToggleSave} onCalendar={onCalendar} />
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="dl-list">
          {buckets.flatMap((b) => b.items).map((p) => (
            <Row key={p.id} p={p} now={now} saved={isSaved(p.id)} savedMeta={savedMeta} onOpen={onOpen} onToggleSave={onToggleSave} onCalendar={onCalendar} />
          ))}
        </div>
      )}
    </section>
  );
}
