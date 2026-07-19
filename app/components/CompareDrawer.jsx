"use client";

import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";
import { daysLeft, countdownLabel, formatDate, targetGroup, isNovel } from "../lib/project-utils.js";

const ROWS = [
  { key: "status", label: "Статус" },
  { key: "deadline", label: "Краен срок" },
  { key: "budget", label: "Бюджет" },
  { key: "eligible", label: "Допустими кандидати" },
  { key: "program", label: "Програма" },
  { key: "target", label: "Целева група" },
  { key: "docs", label: "Документи" },
  { key: "new", label: "Ново/променено" },
  { key: "source", label: "Източник" },
];

const LABELS = [
  ...ROWS.map((r) => r.label),
  "Младежка заетост", "Общи / бизнес", "Да", "Не", "Страница",
  "Сравнение на процедури", "Затвори", "Характеристика",
];

export default function CompareDrawer({ projects, onClose, onRemove }) {
  const tl = useUiTranslate(LABELS);
  const trapRef = useFocusTrap(true, onClose);

  const cell = (p, key) => {
    switch (key) {
      case "status":
        return <StatusBadge status={p.status} />;
      case "deadline": {
        const dl = daysLeft(p.deadline_date);
        return (
          <>
            {p.deadline_date ? formatDate(p.deadline_date) : p.deadline || "—"}
            {dl != null && (p.status === "open" || p.status === "closing_soon") && (
              <div style={{ fontWeight: 700, marginTop: 2 }}>{countdownLabel(dl)}</div>
            )}
          </>
        );
      }
      case "budget":
        return p.budget || "—";
      case "eligible":
        return p.eligible || "—";
      case "program":
        return p.program || "—";
      case "target":
        return targetGroup(p) === "youth" ? tl("Младежка заетост") : tl("Общи / бизнес");
      case "docs":
        return p.doc_count || 0;
      case "new":
        return isNovel(p) ? tl("Да") : tl("Не");
      case "source":
        return p.link ? (
          <a href={p.link} target="_blank" rel="noreferrer"><Icon name="external" size={14} /> {tl("Страница")}</a>
        ) : (
          "—"
        );
      default:
        return "—";
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="compare-panel" role="dialog" aria-modal="true" aria-labelledby="cmp-title" ref={trapRef}>
        <div className="drawer-head">
          <h2 id="cmp-title" style={{ marginTop: 0 }}>{tl("Сравнение на процедури")}</h2>
          <button className="drawer-close" onClick={onClose} aria-label={tl("Затвори")}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">{tl("Характеристика")}</span></th>
                {projects.map((p) => (
                  <th scope="col" key={p.id}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <button className="iconbtn" style={{ width: 32, height: 32 }} onClick={() => onRemove(p.id)} aria-label={`Премахни ${p.name} от сравнението`}>
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{tl(r.label)}</th>
                  {projects.map((p) => (
                    <td key={p.id}>{cell(p, r.key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
