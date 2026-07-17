"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import ProjectActions from "./ProjectActions.jsx";
import { daysLeft, countdownLabel, formatDate } from "../lib/project-utils.js";
import { URGENT_DAYS } from "../lib/constants.js";

const REASON_ICON = { expiring: "clock", new: "sparkle", changed: "refresh", savedChanged: "bookmarkFilled", noDocs: "alert" };

function AttentionCard({ p, reasons, now, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink, onCalendar }) {
  const dl = daysLeft(p.deadline_date, now);
  const showCd = dl != null && (p.status === "open" || p.status === "closing_soon");
  return (
    <article className="card att-card" aria-label={p.name}>
      <div className="card-top">
        <StatusBadge status={p.status} />
        {showCd && (
          <span className={"spacer countdown" + (dl <= URGENT_DAYS ? " hot" : "")}>{countdownLabel(dl)}</span>
        )}
      </div>
      <h3 className="card-title">{p.name}</h3>
      {p.program && <div className="card-prog">{p.program}</div>}

      <div className="reasons" aria-label="Причини за внимание">
        {reasons.map((r, i) => (
          <span className={"reason " + r.tone} key={i}>
            <Icon name={REASON_ICON[r.type] || "info"} size={13} /> {r.label}
          </span>
        ))}
      </div>

      <dl className="card-meta">
        {(p.deadline_date || p.deadline) && (
          <div className="mrow"><Icon name="calendar" /><dt>Срок:</dt><dd>{p.deadline_date ? <time dateTime={p.deadline_date}>{formatDate(p.deadline_date)}</time> : p.deadline}</dd></div>
        )}
        {p.budget && <div className="mrow"><Icon name="euro" /><dt>Бюджет:</dt><dd>{p.budget}</dd></div>}
        {p.eligible && <div className="mrow"><Icon name="users" /><dt>Кандидати:</dt><dd className="eligible-clamp">{p.eligible}</dd></div>}
      </dl>

      <ProjectActions
        p={p}
        isSaved={isSaved}
        inCompare={inCompare}
        onOpen={onOpen}
        onToggleSave={onToggleSave}
        onToggleCompare={onToggleCompare}
        onCopyLink={onCopyLink}
        onCalendar={onCalendar}
      />
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
        <div className="state ov-empty"><Icon name="check" size={26} /><h3>Няма спешни действия</h3><p>В момента няма изтичащи скоро, нови или променени процедури, които изискват внимание.</p></div>
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
