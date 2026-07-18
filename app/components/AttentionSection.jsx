"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import ProjectActions from "./ProjectActions.jsx";
import { daysLeft, countdownLabel, formatDate } from "../lib/project-utils.js";
import { URGENT_DAYS } from "../lib/constants.js";
import { useTranslatedProject } from "./i18n/TranslatedProjects.jsx";

const REASON_ICON = { expiring: "clock", new: "sparkle", changed: "refresh", savedChanged: "bookmarkFilled", noDocs: "alert" };

function AttentionCard({ p, reasons, now, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink, onCalendar }) {
  const { t } = useTranslation();
  const tp = useTranslatedProject(p.id);
  const dl = daysLeft(p.deadline_date, now);
  const showCd = dl != null && (p.status === "open" || p.status === "closing_soon");
  const name = (tp && tp.name) || p.name;
  const budget = (tp && tp.budget) || p.budget;
  const eligible = (tp && tp.eligible) || p.eligible;
  const deadlineText = (tp && tp.deadline) || p.deadline;
  return (
    <article className="card att-card" aria-label={name}>
      <div className="card-top">
        <StatusBadge status={p.status} />
        {showCd && (
          <span className={"spacer countdown" + (dl <= URGENT_DAYS ? " hot" : "")}>{countdownLabel(dl)}</span>
        )}
      </div>
      <h3 className="card-title">{name}</h3>
      {p.program && <div className="card-prog">{p.program}</div>}

      <div className="reasons" aria-label={t("sections.attention")}>
        {reasons.map((r, i) => (
          <span className={"reason " + r.tone} key={i}>
            <Icon name={REASON_ICON[r.type] || "info"} size={13} /> {r.key ? t("reasons." + r.key, { days: r.days, defaultValue: r.label }) : r.label}
          </span>
        ))}
      </div>

      <dl className="card-meta">
        {(p.deadline_date || deadlineText) && (
          <div className="mrow"><Icon name="calendar" /><dt>{t("card.deadlineLabel")}</dt><dd>{p.deadline_date ? <time dateTime={p.deadline_date}>{formatDate(p.deadline_date)}</time> : deadlineText}</dd></div>
        )}
        {budget && <div className="mrow"><Icon name="euro" /><dt>{t("card.budgetLabel")}</dt><dd>{budget}</dd></div>}
        {eligible && <div className="mrow"><Icon name="users" /><dt>{t("card.candidatesLabel")}</dt><dd className="eligible-clamp">{eligible}</dd></div>}
      </dl>

      {/* Начални карти: без иконата за копиране (за да не се пренася на нов ред);
          вместо това показваме кога е обновена процедурата. */}
      <ProjectActions
        p={p}
        isSaved={isSaved}
        inCompare={inCompare}
        onOpen={onOpen}
        onToggleSave={onToggleSave}
        onToggleCompare={onToggleCompare}
        onCalendar={onCalendar}
        compact
      />

      <div className="card-updated-row">
        {p.last_updated && <span className="card-updated">{t("card.updatedLabel")} {formatDate(p.last_updated)}</span>}
        {onCopyLink && (
          <button className="iconbtn card-copy" aria-label={t("card.copyLink")} title={t("card.copyLink")} onClick={() => onCopyLink(p)}>
            <Icon name="link" size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

export default function AttentionSection({ items, now, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink, onCalendar, onSeeAll, limit = 6 }) {
  const { t } = useTranslation();
  return (
    <section className="ov-section" aria-labelledby="att-h">
      <div className="ov-section-head">
        <h2 id="att-h"><Icon name="alert" size={18} /> {t("sections.attention")}</h2>
        <span className="count-dot">{items.length}</span>
        {items.length > limit && (
          <button className="btn btn-ghost see-all" onClick={onSeeAll}>{t("sections.viewAll")} <Icon name="arrowRight" size={14} /></button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="state ov-empty"><Icon name="check" size={26} /><h3>{t("sections.attentionEmptyTitle")}</h3><p>{t("sections.attentionEmptyText")}</p></div>
      ) : (
        <div className="cards">
          {items.slice(0, limit).map(({ p, reasons }) => (
            <AttentionCard
              key={p.id}
              p={p}
              reasons={reasons}
              now={now}
              isSaved={isSaved(p.id)}
              inCompare={inCompare(p.id)}
              onOpen={onOpen}
              onToggleSave={onToggleSave}
              onToggleCompare={onToggleCompare}
              onCopyLink={onCopyLink}
              onCalendar={onCalendar}
            />
          ))}
        </div>
      )}
    </section>
  );
}
