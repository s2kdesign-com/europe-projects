"use client";

import Icon from "./Icon.jsx";

// KPI карти. Всяка е бутон — клик филтрира резултатите (или сменя раздел).
export default function OverviewCards({ stats, active, onSelect }) {
  const cards = [
    { key: "open", n: stats.open, label: "Отворени процедури", icon: "check", tone: "green" },
    { key: "closing", n: stats.closingWindow, label: "Изтичащи до 30 дни", icon: "clock", tone: "amber" },
    { key: "new", n: stats.novel, label: "Нови или променени", icon: "sparkle", tone: "violet" },
    { key: "saved", n: stats.saved, label: "Запазени", icon: "bookmark", tone: "blue" },
  ];
  return (
    <div className="kpi-grid">
      {cards.map((c) => (
        <button
          key={c.key}
          className="kpi"
          aria-pressed={active === c.key}
          onClick={() => onSelect(c.key)}
        >
          <div className="kpi-top">
            <span className="kpi-n">{c.n}</span>
            <span className={"kpi-ico " + c.tone}>
              <Icon name={c.icon} size={18} />
            </span>
          </div>
          <span className="kpi-l">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
