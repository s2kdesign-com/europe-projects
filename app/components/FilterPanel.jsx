"use client";

import Icon from "./Icon.jsx";
import { STATUS_LIST, TARGET_GROUP_LIST, DEADLINE_WINDOWS } from "../lib/constants.js";
import { activeFilterCount } from "../lib/project-utils.js";

// Многозначни, комбинируеми филтри. Използва се и в десктоп релсата, и в
// мобилния sheet. Всяка секция е group с ясен етикет.
export default function FilterPanel({ filters, programs, counts, onToggle, onClear, onCloseSheet, isSheet }) {
  const nActive = activeFilterCount(filters);

  const Group = ({ label, items, filterKey, countMap }) => (
    <fieldset className="fgroup" style={{ border: "none", margin: 0, padding: "12px 0", minInlineSize: 0 }}>
      <legend className="flabel" style={{ padding: 0 }}>{label}</legend>
      {items.map((it) => {
        const checked = (filters[filterKey] || []).includes(it.key);
        return (
          <label className="check" key={it.key}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(filterKey, it.key)}
            />
            <span>{it.label}</span>
            {countMap && countMap[it.key] != null && <span className="tail">{countMap[it.key]}</span>}
          </label>
        );
      })}
    </fieldset>
  );

  return (
    <div className="filters" role={isSheet ? "dialog" : undefined} aria-label="Филтри" aria-modal={isSheet ? "true" : undefined}>
      <h2>
        <Icon name="filter" size={16} /> Филтри
        {isSheet && (
          <button className="drawer-close" style={{ marginLeft: "auto", width: 40, height: 40 }} onClick={onCloseSheet} aria-label="Затвори филтрите">
            <Icon name="close" size={18} />
          </button>
        )}
      </h2>

      <Group label="Статус" items={STATUS_LIST} filterKey="status" countMap={counts.status} />
      <Group label="Целева група" items={TARGET_GROUP_LIST} filterKey="target" countMap={counts.target} />
      <Group label="Срок" items={DEADLINE_WINDOWS} filterKey="deadline" />

      <fieldset className="fgroup" style={{ border: "none", margin: 0, padding: "12px 0", minInlineSize: 0 }}>
        <legend className="flabel" style={{ padding: 0 }}>Програма</legend>
        {programs.map((prog) => {
          const checked = (filters.program || []).includes(prog);
          return (
            <label className="check" key={prog}>
              <input type="checkbox" checked={checked} onChange={() => onToggle("program", prog)} />
              <span>{prog}</span>
              {counts.program && counts.program[prog] != null && <span className="tail">{counts.program[prog]}</span>}
            </label>
          );
        })}
      </fieldset>

      <fieldset className="fgroup" style={{ border: "none", margin: 0, padding: "12px 0", minInlineSize: 0 }}>
        <legend className="flabel" style={{ padding: 0 }}>Наличност</legend>
        <label className="check">
          <input type="checkbox" checked={!!filters.docs} onChange={() => onToggle("docs")} />
          <span>Само с документи</span>
        </label>
      </fieldset>

      <button className="clear-all" onClick={onClear} disabled={nActive === 0}>
        <Icon name="close" size={16} /> Изчисти всички{nActive ? ` (${nActive})` : ""}
      </button>
    </div>
  );
}
