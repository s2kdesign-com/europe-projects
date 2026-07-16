"use client";

import { useState } from "react";
import Icon from "./Icon.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { TARGET_GROUP_LIST } from "../lib/constants.js";

export default function ProfileModal({ profile, programs, onClose, onSave }) {
  const [draft, setDraft] = useState({ programs: [...(profile.programs || [])], target: profile.target || "", onlyOpen: !!profile.onlyOpen });
  const trapRef = useFocusTrap(true, onClose);

  const toggleProgram = (prog) =>
    setDraft((d) => ({ ...d, programs: d.programs.includes(prog) ? d.programs.filter((x) => x !== prog) : [...d.programs, prog] }));

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="prof-title" ref={trapRef} style={{ width: "min(480px,100%)" }}>
        <div className="drawer-head">
          <div>
            <h2 id="prof-title" style={{ marginTop: 0 }}>Моят профил</h2>
            <p className="ov-sub" style={{ margin: 0 }}>Използва се за препоръки и филтриране. Пази се локално в браузъра.</p>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Затвори"><Icon name="close" size={20} /></button>
        </div>

        <div className="drawer-body">
          <fieldset className="fgroup" style={{ border: "none", padding: 0, margin: "0 0 16px", minInlineSize: 0 }}>
            <legend className="flabel">Тип кандидат</legend>
            <div className="segmented">
              <button aria-pressed={!draft.target} onClick={() => setDraft((d) => ({ ...d, target: "" }))}>Всички</button>
              {TARGET_GROUP_LIST.map((t) => (
                <button key={t.key} aria-pressed={draft.target === t.key} onClick={() => setDraft((d) => ({ ...d, target: t.key }))}>{t.label}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="fgroup" style={{ border: "none", padding: 0, margin: "0 0 16px", minInlineSize: 0 }}>
            <legend className="flabel">Предпочитани програми</legend>
            {programs.map((prog) => (
              <label className="check" key={prog}>
                <input type="checkbox" checked={draft.programs.includes(prog)} onChange={() => toggleProgram(prog)} />
                <span>{prog}</span>
              </label>
            ))}
          </fieldset>

          <label className="check">
            <input type="checkbox" checked={draft.onlyOpen} onChange={(e) => setDraft((d) => ({ ...d, onlyOpen: e.target.checked }))} />
            <span>Показвай само отворени процедури</span>
          </label>

          <p className="chart-note" style={{ marginTop: 16 }}>
            <Icon name="info" size={13} /> Полета като сектор, размер на бюджета и процент съфинансиране не са налични в
            текущите данни, затова не участват в оценката.
          </p>
        </div>

        <div className="drawer-actions">
          <button className="btn btn-primary" onClick={() => { onSave(draft); onClose(); }}><Icon name="check" size={16} /> Запази профила</button>
          <button className="btn" onClick={() => { onSave({ programs: [], target: "", onlyOpen: false }); }}>Изчисти</button>
        </div>
      </div>
    </div>
  );
}
