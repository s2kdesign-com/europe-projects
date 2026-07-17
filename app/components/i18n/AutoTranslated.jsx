"use client";

import { useTranslation } from "react-i18next";

// Ненатрапчив индикатор „Преведено автоматично" + бутон за превключване към
// оригинала. Оригиналният български текст остава винаги достъпен (виж р.16).
export default function AutoTranslated({ showingOriginal = false, onToggle, className = "" }) {
  const { t } = useTranslation();
  return (
    <span className={"auto-translated " + className}>
      <span className="auto-translated-badge" title={t("translation.autoTranslated")}>
        ✦ {t("translation.autoTranslated")}
      </span>
      {onToggle && (
        <button type="button" className="auto-translated-toggle" onClick={onToggle}>
          {showingOriginal ? t("translation.showTranslation") : t("translation.showOriginal")}
        </button>
      )}
    </span>
  );
}
