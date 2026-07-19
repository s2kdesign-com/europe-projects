"use client";

import Icon from "./Icon.jsx";
import { SORT_OPTIONS, VIEWS, STATUS, TARGET_GROUP, DEADLINE_WINDOWS } from "../lib/constants.js";
import { activeFilterCount } from "../lib/project-utils.js";
import { formatWeekLabel } from "../lib/overview-utils.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";

const VIEW_ICON = { cards: "grid", list: "list", program: "layers" };

const LABELS = [
  "Търсене на процедури", "Търси по име, програма, кандидати…", "Филтри", "Сортиране",
  "Изглед", "Свали филтрираните като CSV", "Печат на филтрираните",
  "Копирай връзка към този изглед", "Печат", "Сподели", "от", "процедури",
  "С документи", "Нови", "Актуализирани", "Изчисти всички", "Премахни филтър",
  ...SORT_OPTIONS.map((s) => s.label), ...VIEWS.map((v) => v.label),
];

function isoToDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// Етикети за активните чипове.
function chipLabels(filters) {
  const out = [];
  if (filters.q) out.push({ key: "q", label: `„${filters.q}"`, kind: "q" });
  (filters.status || []).forEach((s) => out.push({ key: "status:" + s, label: STATUS[s]?.label || s, kind: "status", val: s }));
  (filters.target || []).forEach((t) => out.push({ key: "target:" + t, label: TARGET_GROUP[t]?.label || t, kind: "target", val: t }));
  (filters.deadline || []).forEach((d) => {
    const w = DEADLINE_WINDOWS.find((x) => x.key === d);
    out.push({ key: "deadline:" + d, label: w?.label || d, kind: "deadline", val: d });
  });
  (filters.program || []).forEach((p) => out.push({ key: "program:" + p, label: p, kind: "program", val: p }));
  if (filters.docs) out.push({ key: "docs", label: "С документи", kind: "docs" });
  if (filters.changeType === "new" || filters.changeType === "changed") {
    const from = isoToDate(filters.weekFrom), to = isoToDate(filters.weekTo);
    const range = from && to ? " · " + formatWeekLabel(from, to).full : "";
    out.push({ key: "changeWeek", label: (filters.changeType === "new" ? "Нови" : "Актуализирани") + range, kind: "changeWeek" });
  }
  return out;
}

export default function ViewControls({
  filters,
  resultCount,
  totalCount,
  onQuery,
  onSort,
  onView,
  onOpenSheet,
  onRemoveChip,
  onClearAll,
  onExportCSV,
  onPrint,
  onCopyView,
}) {
  const tl = useUiTranslate(LABELS);
  const chips = chipLabels(filters);
  const nActive = activeFilterCount(filters);

  return (
    <>
      <div className="toolbar">
        <div className="searchbox">
          <Icon name="search" size={18} />
          <label htmlFor="proc-search" className="sr-only">{tl("Търсене на процедури")}</label>
          <input
            id="proc-search"
            className="search"
            type="search"
            placeholder={tl("Търси по име, програма, кандидати…")}
            value={filters.q}
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>

        <button className="btn filter-toggle" onClick={onOpenSheet} aria-haspopup="dialog">
          <Icon name="filter" size={16} /> {tl("Филтри")}{nActive ? ` (${nActive})` : ""}
        </button>

        <label htmlFor="proc-sort" className="sr-only">{tl("Сортиране")}</label>
        <select id="proc-sort" className="select" value={filters.sort} onChange={(e) => onSort(e.target.value)}>
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>{tl(s.label)}</option>
          ))}
        </select>

        <div className="segmented" role="group" aria-label={tl("Изглед")}>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              aria-pressed={filters.view === v.key}
              onClick={() => onView(v.key)}
              title={tl(v.label)}
            >
              <Icon name={VIEW_ICON[v.key]} size={16} />
              <span className="sr-only">{tl(v.label)}</span>
            </button>
          ))}
        </div>

        <button className="btn btn-ghost" onClick={onExportCSV} title={tl("Свали филтрираните като CSV")}>
          <Icon name="download" size={16} /> CSV
        </button>
        <button className="btn btn-ghost" onClick={onPrint} title={tl("Печат на филтрираните")}>
          <Icon name="print" size={16} /> {tl("Печат")}
        </button>
        <button className="btn btn-ghost" onClick={onCopyView} title={tl("Копирай връзка към този изглед")}>
          <Icon name="link" size={16} /> {tl("Сподели")}
        </button>
      </div>

      <div className="result-bar">
        <span className="result-count" aria-live="polite">
          <strong>{resultCount}</strong> {tl("от")} {totalCount} {tl("процедури")}
        </span>
        {chips.length > 0 && (
          <div className="chips">
            {chips.map((c) => (
              <span className="chip" key={c.key}>
                {tl(c.label)}
                <button onClick={() => onRemoveChip(c)} aria-label={`${tl("Премахни филтър")}: ${tl(c.label)}`}>
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
            <button className="btn btn-ghost" style={{ minHeight: 32, padding: "2px 10px" }} onClick={onClearAll}>
              {tl("Изчисти всички")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
