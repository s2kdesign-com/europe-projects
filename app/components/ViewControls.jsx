"use client";

import Icon from "./Icon.jsx";
import { SORT_OPTIONS, VIEWS, STATUS, TARGET_GROUP, DEADLINE_WINDOWS } from "../lib/constants.js";
import { activeFilterCount } from "../lib/project-utils.js";
import { formatWeekLabel } from "../lib/overview-utils.js";

const VIEW_ICON = { cards: "grid", list: "list", program: "layers" };

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
  const chips = chipLabels(filters);
  const nActive = activeFilterCount(filters);

  return (
    <>
      <div className="toolbar">
        <div className="searchbox">
          <Icon name="search" size={18} />
          <label htmlFor="proc-search" className="sr-only">Търсене на процедури</label>
          <input
            id="proc-search"
            className="search"
            type="search"
            placeholder="Търси по име, програма, кандидати…"
            value={filters.q}
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>

        <button className="btn filter-toggle" onClick={onOpenSheet} aria-haspopup="dialog">
          <Icon name="filter" size={16} /> Филтри{nActive ? ` (${nActive})` : ""}
        </button>

        <label htmlFor="proc-sort" className="sr-only">Сортиране</label>
        <select id="proc-sort" className="select" value={filters.sort} onChange={(e) => onSort(e.target.value)}>
          {SORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        <div className="segmented" role="group" aria-label="Изглед">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              aria-pressed={filters.view === v.key}
              onClick={() => onView(v.key)}
              title={v.label}
            >
              <Icon name={VIEW_ICON[v.key]} size={16} />
              <span className="sr-only">{v.label}</span>
            </button>
          ))}
        </div>

        <button className="btn btn-ghost" onClick={onExportCSV} title="Свали филтрираните като CSV">
          <Icon name="download" size={16} /> CSV
        </button>
        <button className="btn btn-ghost" onClick={onPrint} title="Печат на филтрираните">
          <Icon name="print" size={16} /> Печат
        </button>
        <button className="btn btn-ghost" onClick={onCopyView} title="Копирай връзка към този изглед">
          <Icon name="link" size={16} /> Сподели
        </button>
      </div>

      <div className="result-bar">
        <span className="result-count" aria-live="polite">
          <strong>{resultCount}</strong> от {totalCount} процедури
        </span>
        {chips.length > 0 && 