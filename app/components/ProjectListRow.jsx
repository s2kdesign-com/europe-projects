"use client";

import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { daysLeft, countdownLabel, formatDate, isNovel } from "../lib/project-utils.js";
import { URGENT_DAYS } from "../lib/constants.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";

const LABELS = ["Ново/променено", "Премахни от запазени", "Запази процедурата", "Премахни от сравнението", "Добави за сравнение"];

export default function ProjectListRow({ p, now, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare }) {
  const tl = useUiTranslate(LABELS);
  const dl = daysLeft(p.deadline_date, now);
  const showCd = dl != null && (p.status === "open" || p.status === "closing_soon");

  return (
    <div className="row">
      <StatusBadge status={p.status} />
      <button
        className="row-main"
        onClick={() => onOpen(p.id)}
        aria-haspopup="dialog"
        style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}
      >
        <div className="row-title">
          {isNovel(p) && <Icon name="sparkle" size={13} title={tl("Ново/променено")} />} {p.name}
        </div>
        <div className="row-sub">
          {p.program}
          {p.deadline_date ? " · " + formatDate(p.deadline_date) : p.deadline ? " · " + p.deadline : ""}
        </div>
      </button>
      <div className="row-side">
        {showCd && (
          <span className={"countdown" + (dl <= URGENT_DAYS ? " hot" : "") + (dl < 0 ? " passed" : "")}>
            {countdownLabel(dl)}
          </span>
        )}
        <button
          className={"iconbtn" + (isSaved ? " saved" : "")}
          aria-pressed={isSaved}
          aria-label={isSaved ? tl("Премахни от запазени") : tl("Запази процедурата")}
          onClick={() => onToggleSave(p.id)}
        >
          <Icon name={isSaved ? "bookmarkFilled" : "bookmark"} size={18} />
        </button>
        <button
          className="iconbtn"
          aria-pressed={inCompare}
          aria-label={inCompare ? tl("Премахни от сравнението") : tl("Добави за сравнение")}
          onClick={() => onToggleCompare(p.id)}
        >
          <Icon name="compare" size={18} />
        </button>
      </div>
    </div>
  );
}
