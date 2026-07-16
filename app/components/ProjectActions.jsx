"use client";

import Icon from "./Icon.jsx";

// Споделен ред с действия за карти (Детайли, Документи, Запази, Сравни, Копирай).
// Централизиран, за да не се дублира между картите в различните секции.
export default function ProjectActions({ p, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink, compact }) {
  const docCount = p.doc_count || 0;
  return (
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
        onClick={() => onToggleSave(p)}
      >
        <Icon name={isSaved ? "bookmarkFilled" : "bookmark"} size={18} />
      </button>
      <button
        className="iconbtn"
        aria-pressed={inCompare}
        aria-label={inCompare ? "Премахни от сравнението" : "Добави за сравнение"}
        title="Сравни"
        onClick={() => onToggleCompare(p.id)}
      >
        <Icon name="compare" size={18} />
      </button>
      {!compact && onCopyLink && (
        <button className="iconbtn" aria-label="Копирай връзка" title="Копирай връзка" onClick={() => onCopyLink(p)}>
          <Icon name="link" size={18} />
        </button>
      )}
    </div>
  );
}
