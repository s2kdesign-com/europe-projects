"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";

// Разширени, но само РЕАЛНИ показатели. Сумата на бюджета съзнателно липсва,
// защото бюджетът е свободен текст („83 млн. €", „Държавен бюджет") и не може да
// се сумира достоверно — вижте секцията с ограничения.
export default function OverviewKPIs({ stats, recommendedCount, hasProfile, active, onSelect }) {
  const { t } = useTranslation();
  const cards = [
    { key: "open", n: stats.open, label: t("kpi.open"), icon: "check", tone: "green" },
    { key: "exp30", n: stats.exp30, label: t("kpi.exp30"), icon: "clock", tone: "amber" },
    { key: "new", n: stats.newWeek, label: t("kpi.new"), icon: "sparkle", tone: "violet" },
    { key: "changed", n: stats.changedWeek, label: t("kpi.changed"), icon: "refresh", tone: "blue" },
    { key: "saved", n: stats.saved, label: t("kpi.saved"), icon: "bookmark", tone: "blue" },
    { key: "docs", n: stats.withDocs, label: t("kpi.docs"), icon: "document", tone: "green" },
    { key: "nodocs", n: stats.noDocs, label: t("kpi.nodocs"), icon: "alert", tone: "amber" },
  ];
  if (hasProfile) {
    cards.splice(4, 0, { key: "recommended", n: recommendedCount, label: t("kpi.recommended"), icon: "users", tone: "green" });
  }

  return (
    <div className="kpi-grid ov-kpi" role="group" aria-label={t("kpi.ariaLabel")}>
      {cards.map((c) => (
        <button key={c.key} className="kpi" aria-pressed={active === c.key} onClick={() => onSelect(c.key)}>
          <div className="kpi-top">
            <span className="kpi-n">{c.n}</span>
            <span className={"kpi-ico " + c.tone}><Icon name={c.icon} size={16} /></span>
          </div>
          <span className="kpi-l">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
