"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import StatusBadge from "./StatusBadge.jsx";
import { daysLeft, countdownLabel, formatDate } from "../lib/project-utils.js";
import { attentionReasons } from "../lib/overview-utils.js";

function SavedRow({ p, now, savedIds, savedMeta, note, onNote, onOpen, onRemove }) {
  const [editing, setEditing] = useState(false);
  const dl = daysLeft(p.deadline_date, now);
  return (
    <div className="saved-row">
      <div className="saved-main">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge status={p.status} />
          {dl != null && (p.status === "open" || p.status === "closing_soon") && (
            <span className="countdown">{countdownLabel(dl)}</span>
          )}
        </div>
        <button className="saved-title" onClick={() => onOpen(p.id)} aria-haspopup="dialog">{p.name}</button>
        <div className="row-sub">{p.program}{p.deadline_date ? " · " + formatDate(p.deadline_date) : ""}</div>
        {editing ? (
          <textarea
            className="note-input"
            defaultValue={note || ""}
            placeholder="Твоя бележка (пази се локално)…"
            aria-label="Персонална бележка"
            onBlur={(e) => { onNote(p.id, e.target.value); setEditing(false); }}
            autoFocus
          />
        ) : note ? (
          <p className="note-text" onClick={() => setEditing(true)}><Icon name="document" size={13} /> {note}</p>
        ) : null}
      </div>
      <div className="saved-side">
        <button className="iconbtn" title="Бележка" aria-label="Добави/редактирай бележка" onClick={() => setEditing(true)}><Icon name="document" size={16} /></button>
        <button className="iconbtn saved" title="Премахни от запазени" aria-label="Премахни от запазени" onClick={() => onRemove(p.id)}><Icon name="bookmarkFilled" size={16} /></button>
      </div>
    </div>
  );
}

export default function SavedTracked({ savedProjects, now, savedMeta, notes, onNote, onOpen, onRemove }) {
  const { t } = useTranslation();
  const savedIds = savedProjects.map((p) => p.id);
  const groups = { attention: [], stable: [], done: [] };
  for (const p of savedProjects) {
    if (p.status === "closed") groups.done.push(p);
    else if (attentionReasons(p, savedIds, savedMeta, now).length > 0) groups.attention.push(p);
    else groups.stable.push(p);
  }

  const Block = ({ title, tone, items }) =>
    items.length === 0 ? null : (
      <div className="saved-block">
        <div className="saved-block-head"><span className={"badge " + tone}>{title}</span><span className="count-dot">{items.length}</span></div>
        <div className="saved-list">
          {items.map((p) => (
            <SavedRow key={p.id} p={p} now={now} savedIds={savedIds} savedMeta={savedMeta} note={notes[p.id]} onNote={onNote} onOpen={onOpen} onRemove={onRemove} />
          ))}
        </div>
      </div>
    );

  return (
    <section className="ov-section" aria-labelledby="saved-h">
      <div className="ov-section-head">
        <h2 id="saved-h"><Icon name="bookmark" size={18} /> {t("sections.savedTracked")}</h2>
        <span className="count-dot">{savedProjects.length}</span>
      </div>
      {savedProjects.length === 0 ? (
        <div className="state ov-empty"><Icon name="bookmark" size={26} /><h3>Все още няма запазени</h3><p>Натисни иконата за отметка на процедура, за да я следиш тук и да получаваш индикатор при промяна.</p></div>
      ) : (
        <>
          <Block title="Изискват внимание" tone="amber" items={groups.attention} />
          <Block title="Без промени" tone="green" items={groups.stable} />
          <Block title="Приключили" tone="neutral" items={groups.done} />
        </>
      )}
    </section>
  );
}
