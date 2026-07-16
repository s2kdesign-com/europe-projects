"use client";

import Icon from "./Icon.jsx";

export default function QuickActions({ onSearch, onProfile, onSaved, onCalendar, onExport, onReminder, onCompare }) {
  const actions = [
    { icon: "search", label: "Търси процедури", onClick: onSearch },
    { icon: "filter", label: "Настрой профил", onClick: onProfile },
    { icon: "bookmark", label: "Прегледай запазените", onClick: onSaved },
    { icon: "calendar", label: "Отвори календара", onClick: onCalendar },
    { icon: "download", label: "Експортирай сроковете", onClick: onExport },
    { icon: "clock", label: "Създай напомняне", onClick: onReminder },
    { icon: "compare", label: "Сравни процедури", onClick: onCompare },
  ];
  return (
    <section className="ov-section" aria-labelledby="qa-h">
      <div className="ov-section-head"><h2 id="qa-h"><Icon name="sparkle" size={18} /> Бързи действия</h2></div>
      <div className="quick-actions">
        {actions.map((a) => (
          <button key={a.label} className="quick-btn" onClick={a.onClick}>
            <span className="quick-ico"><Icon name={a.icon} size={18} /></span>
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );
}
