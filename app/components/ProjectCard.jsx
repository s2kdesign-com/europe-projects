"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { daysLeft, countdownLabel, formatDate, isNovel, targetGroup } from "../lib/project-utils.js";
import { URGENT_DAYS } from "../lib/constants.js";
import { useTranslatedProject } from "./i18n/TranslatedProjects.jsx";

export default function ProjectCard({ p, now, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink }) {
  const { t } = useTranslation();
  const tp = useTranslatedProject(p.id); // преведени полета (или null при bg)
  const dl = daysLeft(p.deadline_date, now);
  const showCd = dl != null && (p.status === "open" || p.status === "closing_soon");
  const novel = isNovel(p);
  const youth = targetGroup(p) === "youth";
  const docCount = p.doc_count || 0;

  const name = (tp && tp.name) || p.name;
  const budget = (tp && tp.budget) || p.budget;
  const eligible = (tp && tp.eligible) || p.eligible;
  const deadlineText = (tp && tp.deadline) || p.deadline;
  const translated = !!(tp && (tp.name || tp.budget || tp.eligible || tp.deadline));

  return (
    <article className="card" aria-label={name}>
      <div className="card-top">
        <StatusBadge status={p.status} />
        {novel && (<span className="badge new"><Icon name="sparkle" size={14} /> {t("card.new")}</span>)}
        {youth && (<span className="badge youth"><Icon name="users" size={14} /> {t("card.youth")}</span>)}
        {showCd && (
          <span className={"spacer countdown" + (dl <= URGENT_DAYS ? " hot" : "") + (dl < 0 ? " passed" : "")}>
            {countdownLabel(dl)}
          </span>
        )}
      </div>

      <h3 className="card-title">{name}</h3>
      {p.program && <div className="card-prog">{p.program}</div>}

      <dl className="card-meta">
        {(deadlineText || p.deadline_date) && (
          <div className="mrow">
            <Icon name="calendar" />
            <dt>{t("card.deadlineLabel")}</dt>
            <dd>{p.deadline_date ? <time dateTime={p.deadline_date}>{formatDate(p.deadline_date)}</time> : deadlineText}</dd>
          </div>
        )}
        {budget && (<div className="mrow"><Icon name="euro" /><dt>{t("card.budgetLabel")}</dt><dd>{budget}</dd></div>)}
        {eligible && (<div className="mrow"><Icon name="users" /><dt>{t("card.candidatesLabel")}</dt><dd className="eligible-clamp">{eligible}</dd></div>)}
      </dl>

      {translated && <div className="card-translated" title={t("card.autoTranslated")}>✦ {t("card.autoTranslated")}</div>}

      <div className="card-actions">
        <a className="details" href={"/procedures/" + p.id} style={{ marginRight: 0 }} onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); onOpen(p.id, "overview"); } }} aria-haspopup="dialog">
          <Icon name="arrowRight" size={16} /> {t("card.details")}
        </a>
        <button
          className="details"
          onClick={() => onOpen(p.id, "documents")}
          disabled={docCount === 0}
          title={docCount === 0 ? t("card.noDocuments") : undefined}
          aria-haspopup="dialog"
          aria-disabled={docCount === 0}
          style={docCount === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        >
          <Icon name="document" size={16} /> {t("card.documents")} ({docCount})
        </button>
        <button
          className={"iconbtn" + (isSaved ? " saved" : "")}
          aria-pressed={isSaved}
          aria-label={isSaved ? t("card.removeSaved") : t("card.saveProcedure")}
          title={isSaved ? t("card.removeSaved") : t("card.save")}
          onClick={() => onToggleSave(p.id)}
        >
          <Icon name={isSaved ? "bookmarkFilled" : "bookmark"} size={18} />
        </button>
        <button className="iconbtn" aria-pressed={inCompare} aria-label={inCompare ? t("card.removeCompare") : t("card.addCompare")} title={t("card.compare")} onClick={() => onToggleCompare(p.id)}>
          <Icon name="compare" size={18} />
        </button>
        <button className="iconbtn" aria-label={t("card.copyLink")} title={t("card.copyLink")} onClick={() => onCopyLink(p)}>
          <Icon name="link" size={18} />
        </button>
      </div>

      <div className="mrow" style={{ marginTop: 4, fontSize: 12, color: "var(--faint)" }}>
        {p.last_updated && <span>{t("card.updatedLabel")} {formatDate(p.last_updated)}</span>}
      </div>
    </article>
  );
}
