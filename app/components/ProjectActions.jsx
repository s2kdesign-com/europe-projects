"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";

// Споделен ред с действия за карти (Детайли, Документи, Запази, Сравни, Копирай).
// Централизиран, за да не се дублира между картите в различните секции.
export default function ProjectActions({ p, isSaved, inCompare, onOpen, onToggleSave, onToggleCompare, onCopyLink, compact }) {
  const { t } = useTranslation();
  const docCount = p.doc_count || 0;
  return (
    <div className="card-actions">
      <button className="details" style={{ marginRight: 0 }} onClick={() => onOpen(p.id, "overview")} aria-haspopup="dialog">
        <Icon name="arrowRight" size={16} /> {t("card.details")}
      </button>
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
        onClick={() => onToggleSave(p)}
      >
        <Icon name={isSaved ? "bookmarkFilled" : "bookmark"} size={18} />
      </button>
      <button
        className="iconbtn"
        aria-pressed={inCompare}
        aria-label={inCompare ? t("card.removeCompare") : t("card.addCompare")}
        title={t("card.compare")}
        onClick={() => onToggleCompare(p.id)}
      >
        <Icon name="compare" size={18} />
      </button>
      {!compact && onCopyLink && (
        <button className="iconbtn" aria-label={t("card.copyLink")} title={t("card.copyLink")} onClick={() => onCopyLink(p)}>
          <Icon name="link" size={18} />
        </button>
      )}
    </div>
  );
}
