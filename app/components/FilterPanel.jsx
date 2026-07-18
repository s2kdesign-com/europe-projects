"use client";

import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import { STATUS_LIST, TARGET_GROUP_LIST, DEADLINE_WINDOWS } from "../lib/constants.js";
import { activeFilterCount } from "../lib/project-utils.js";

// Преводими етикети за опциите (по ключ). Имената на програмите са данни (остават).
const STATUS_KEY = (k) => "status." + k;
const TARGET_KEY = { youth: "filters.targetYouth", general: "filters.targetGeneral" };
const DEADLINE_KEY = { "7": "filters.deadline7", "30": "filters.deadline30", "90": "filters.deadline90", none: "filters.deadlineNone" };

// Многозначни, комбинируеми филтри. Използва се и в десктоп релсата, и в
// мобилния sheet. Всяка секция е group с ясен етикет.
export default function FilterPanel({ filters, programs, counts, onToggle, onClear, onCloseSheet, isSheet }) {
  const { t } = useTranslation();
  const nActive = activeFilterCount(filters);

  // ВАЖНО: обикновена функция (не компонент, извиква се директно, не като
  // <Group/>) — иначе React я третира като нов тип при всеки render на
  // FilterPanel и размонтира/монтира наново чекбоксовете (губи се клик/фокус
  // по средата на взаимодействие, вкл. в тестове с userEvent).
  const renderGroup = ({ label, items, filterKey, countMap, labelFor }) => (
    <fieldset className="fgroup" style={{ border: "none", margin: 0, padding: "12px 0", minInlineSize: 0 }}>
      <legend className="flabel" style={{ padding: 0 }}>{label}</legend>
      {items.map((it) => {
        const checked = (filters[filterKey] || []).includes(it.key);
        return (
          <label className="check" key={it.key}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(filterKey, it.key)} />
            <span>{labelFor ? t(labelFor(it.key), it.label) : it.label}</span>
            {countMap && countMap[it.key] != null && <span className="tail">{countMap[it.key]}</span>}
          </label>
        );
      })}
    </fieldset>
  );

  return (
    <div className="filters" role={isSheet ? "dialog" : undefined} aria-label={t("filters.title")} aria-modal={isSheet ? "true" : undefined}>
      <h2>
        <Icon name="filter" size={16} /> {t("filters.title")}
        {isSheet && (
          <button className="drawer-close" style={{ marginLeft: "auto", width: 40, height: 40 }} onClick={onCloseSheet} aria-label={t("filters.closeFilters")}>
            <Icon name="close" size={18} />
          </button>
        )}
      </h2>

      {renderGroup({ label: t("filters.statusLabel"), items: STATUS_LIST, filterKey: "status", countMap: counts.status, labelFor: STATUS_KEY })}
      {renderGroup({ label: t("filters.targetGroup"), items: TARGET_GROUP_LIST, filterKey: "target", countMap: counts.target, labelFor: (k) => TARGET_KEY[k] })}
      {renderGroup({ label: t("filters.deadlineLabel"), items: DEADLINE_WINDOWS, filterKey: "deadline", labelFor: (k) => DEADLINE_KEY[k] })}

      <fieldset className="fgroup" style={{ border: "none", margin: 0, padding: "12px 0", minInlineSize: 0 }}>
        <legend className="flabel" style={{ padding: 0 }}>{t("filters.program")}</legend>
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
        <legend className="flabel" style={{ padding: 0 }}>{t("filters.availability")}</legend>
        <label className="check">
          <input type="checkbox" checked={!!filters.docs} onChange={() => onToggle("docs")} />
          <span>{t("filters.withDocs")}</span>
        </label>
      </fieldset>

      <button className="clear-all" onClick={onClear} disabled={nActive === 0}>
        <Icon name="close" size={16} /> {t("filters.clearAll")}{nActive ? ` (${nActive})` : ""}
      </button>
    </div>
  );
}
