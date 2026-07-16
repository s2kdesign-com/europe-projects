"use client";

import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { daysLeft, countdownLabel, formatDate, isNovel, targetGroup } from "../lib/project-utils.js";
import { URGENT_DAYS } from "../lib/constants.js";

export default function ProjectCard({ p, now, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink }) {
  const dl = daysLeft(p.deadline_date, now);
  const showCd = dl != null && (p.status === "open" || p.status === "closing_soon");
  const novel = isNovel(p);
  const youth = targetGroup(p) === "youth";
  const docCount = p.doc_count || 0;

  return (
    <article className="card" aria-label={p.name}>
      <div className="card-top">
        <StatusBadge status={p.status} />
        {novel && (<span className="badge new"><Icon name="sparkle" size={14} /> Ново</span>)}
        {youth && (<span className="badge youth"><Icon name="users" size={14} /> Младежи</span>)}
        {showCd && (
          <span className={"spacer countdown" + (dl <= URGENT_DAYS ? " hot" : "") + (dl < 0 ? " passed" : "")}>
            {countdownLabel(dl)}
          </span>
        )}
      </div>

      <h3 className="card-title">{p.name}</h3>
      {p.program && <div className="card-prog">{p.program}</div>}

      <dl className="card-meta">
        {(p.deadline || p.deadline_date) && (
          <div className="mrow">
            <Icon name="calendar" />
            <dt>Срок:</dt>
            <dd>{p.deadline_date ? <time dateTime={p.deadline_date}>{formatDate(p.deadline_date)}</time> : p.deadline}</dd>
          </div>
        )}
        {p.budget && (<div className="mrow"><Icon name="euro" /><dt>Бюджет:</dt><dd>{p.budget}</dd></div>)}
        {p.eligible && (<div className="mrow"><Icon name="users" /><dt>Кандидати:</dt><dd className="eligible-clamp">{p.eligible}</dd></div>)}
      </dl>

      <div className="card-actions">
        <button className="details" style={{ marginRight: 0 }} onClick={() => onOpen(p.id, "overview")} aria-haspopup="dialog">
          <Icon name="arrowRight" size={16} /> Детайли
        </button>
        <button
          className="details"
          onClick={() => onOpen(p.id, "documents")}
          disabled={docCount === 0}
          title={docCount === 0 ? "Няма налични документи" : undefined}
          aria-haspopup="dialog"
          aria-disabled={docCount === 0}
          style={docCount === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          <Icon name="document" size={16} /> Документи ({docCount})
        </button>
        <button
          className={"iconbtn" + (isSaved ? " saved" : "")}
          aria-pressed={isSaved}
          aria-label={isSaved ? "Премахни от запазени" : "Запази процедурата"}
          title={isSaved ? "Премахни от запазени" : "Запази"}
          onClick={() => onToggleSave(p.id)}
        >
          <Icon name={isSaved ? "bookmarkFilled" : "bookmark"} size={18} />
        </button>
        <button className="iconbtn" aria-pressed={inCompare} aria-label={inCompare ? "Премахни от сравнението" : "Добави за сравнение"} title="Сравни" onClick={() => onToggleCompare(p.id)}>
          <Icon name="compare" size={18} />
        </button>
        <button className="iconbtn" aria-label="Копирай връзка към процедурата" title="Копирай връзка" onClick={() => onCopyLink(p)}>
          <Icon name="link" size={18} />
        </button>
      </div>

      <div className="mrow" style={{ marginTop: 4, fontSize: 12, color: "var(--faint)" }}>
        {p.last_updated && <span>Обновено: {formatDate(p.last_updated)}</span>}
      </div>
    </article>
  );
}
