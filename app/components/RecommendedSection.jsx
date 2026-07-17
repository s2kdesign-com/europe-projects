"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import ProjectActions from "./ProjectActions.jsx";
import { GoogleG } from "./UserMenu.jsx";
import { formatDate, targetGroup } from "../lib/project-utils.js";
import { ELIGIBILITY_DISCLAIMER } from "../lib/recommend.js";
import { useTranslatedProject } from "./i18n/TranslatedProjects.jsx";

function RecommendedCard({ p, rec, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCalendar }) {
  const { t } = useTranslation();
  const tp = useTranslatedProject(p.id);
  const name = (tp && tp.name) || p.name;
  const budget = (tp && tp.budget) || p.budget;
  const deadlineText = (tp && tp.deadline) || p.deadline;
  return (
    <article className="card rec-card" aria-label={name}>
      <div className="card-top">
        <span className="relevance" title={t("card.matchTitle")}><Icon name="check" size={13} /> {t("card.match", { score: rec.score })}</span>
        <StatusBadge status={p.status} />
      </div>
      <h3 className="card-title">{name}</h3>
      {p.program && <div className="card-prog">{p.program}</div>}

      {rec.reasons.length > 0 && (
        <ul className="why">
          {rec.reasons.slice(0, 4).map((x, i) => <li key={i}><Icon name="check" size={13} /> {x}</li>)}
        </ul>
      )}
      {rec.mismatches.length > 0 && (
        <div className="reasons">
          {rec.mismatches.map((x, i) => <span className="reason amber" key={i}><Icon name="alert" size={13} /> {x}</span>)}
        </div>
      )}

      <dl className="card-meta">
        <div className="mrow"><Icon name="users" /><dt>{t("card.typeLabel")}</dt><dd>{targetGroup(p) === "youth" ? t("filters.targetYouth") : t("filters.targetGeneral")}</dd></div>
        {budget && <div className="mrow"><Icon name="euro" /><dt>{t("card.financingLabel")}</dt><dd>{budget}</dd></div>}
        {(p.deadline_date || deadlineText) && <div className="mrow"><Icon name="calendar" /><dt>{t("card.deadlineLabel")}</dt><dd>{p.deadline_date ? formatDate(p.deadline_date) : deadlineText}</dd></div>}
      </dl>

      <ProjectActions p={p} isSaved={isSaved} inCompare={inCompare} onOpen={onOpen} onToggleSave={onToggleSave} onToggleCompare={onToggleCompare} onCalendar={onCalendar} compact />

      {p.last_updated && (
        <div className="mrow" style={{ marginTop: 4, fontSize: 12, color: "var(--faint)" }}>
          <span>{t("card.updatedLabel")} {formatDate(p.last_updated)}</span>
        </div>
      )}
    </article>
  );
}

export default function RecommendedSection({
  authenticated, profileComplete, completion, items,
  onLogin, onOpenProfile,
  isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink, onCalendar,
}) {
  const { t } = useTranslation();
  return (
    <section className="ov-section" aria-labelledby="rec-h">
      <div className="ov-section-head">
        <h2 id="rec-h"><Icon name="users" size={18} /> {t("sections.recommended")}</h2>
        {authenticated && profileComplete && <span className="count-dot">{items.length}</span>}
        {authenticated && <button className="btn btn-ghost see-all" onClick={onOpenProfile}><Icon name="filter" size={14} /> Профил</button>}
      </div>

      {!authenticated ? (
        <div className="state ov-empty">
          <Icon name="users" size={26} />
          <h3>Настрой профил за препоръки</h3>
          <p>Влезте с Google, за да настроите профил и да получавате персонализирани препоръки, синхронизирани между устройствата ви.</p>
          <button className="btn btn-google btn-google-lg" style={{ maxWidth: 280 }} onClick={onLogin}><GoogleG size={18} /> Вход с Google</button>
        </div>
      ) : !profileComplete ? (
        <div className="state ov-empty">
          <Icon name="filter" size={26} />
          <h3>Завършете профила си за по-точни препоръки</h3>
          <div className="pc-bar" style={{ maxWidth: 260, margin: "8px auto" }}><div className="pc-fill" style={{ width: (completion || 0) + "%" }} /></div>
          <p>Попълнен на {completion || 0}%. Добавете предпочитани програми, тип кандидат и интереси, за да заработят препоръките.</p>
          <button className="btn btn-primary" onClick={onOpenProfile}>Завърши профила</button>
        </div>
      ) : items.length === 0 ? (
        <div className="state ov-empty"><Icon name="info" size={26} /><h3>Няма съвпадения</h3><p>Няма процедури, отговарящи на текущия ви профил. Пробвайте да разширите предпочитанията.</p></div>
      ) : (
        <>
          <div className="cards">
            {items.map(({ p, rec }) => (
              <RecommendedCard key={p.id} p={p} rec={rec} isSaved={isSaved(p.id)} inCompare={inCompare(p.id)} onOpen={onOpen} onToggleSave={onToggleSave} onToggleCompare={onToggleCompare} onCopyLink={onCopyLink} onCalendar={onCalendar} />
            ))}
          </div>
          <p className="chart-note"><Icon name="info" size={13} /> {ELIGIBILITY_DISCLAIMER}</p>
        </>
      )}
    </section>
  );
}
