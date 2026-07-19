"use client";

import { useState } from "react";
import Icon from "./Icon.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { useUiTranslate } from "../lib/i18n/ui-translate.js";
import { APP_VERSION } from "../lib/version.js";

const TYPES = [
  { key: "bug", label: "Грешка" },
  { key: "data", label: "Неточни данни" },
  { key: "idea", label: "Предложение" },
];

const LABELS = [
  ...TYPES.map((t) => t.label),
  "Подай сигнал за проблем", "Затвори", "Благодарим! Сигналът е изпратен.", "Тип",
  "Заглавие (по избор)", "Описание", "Имейл за обратна връзка (по избор)",
  "Моля, попълнете описание и опитайте отново.", "Изпращане…", "Изпрати", "Отказ",
  "Прикачваме автоматично текущия адрес и версията на системата",
];

export default function FeedbackModal({ onClose }) {
  const tl = useUiTranslate(LABELS);
  const trapRef = useFocusTrap(true, onClose);
  const [type, setType] = useState("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle|sending|ok|error

  const submit = async () => {
    if (!description.trim()) { setStatus("error"); return; }
    setStatus("sending");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify({ type, title, description, email, url: window.location.href, app_version: APP_VERSION }),
      });
      if (!r.ok) throw new Error();
      setStatus("ok");
      setTimeout(onClose, 1400);
    } catch { setStatus("error"); }
  };

  return (
    <div className="overlay" style={{ alignItems: "center", justifyContent: "center" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="fb-title" ref={trapRef} style={{ width: "min(480px,92%)" }}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <h2 id="fb-title" style={{ flex: 1 }}>{tl("Подай сигнал за проблем")}</h2>
          <button className="drawer-close" style={{ width: 40, height: 40 }} onClick={onClose} aria-label={tl("Затвори")}><Icon name="close" size={18} /></button>
        </div>
        {status === "ok" ? (
          <p className="save-ok" role="status"><Icon name="check" size={16} /> {tl("Благодарим! Сигналът е изпратен.")}</p>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <span className="field-label">{tl("Тип")}</span>
              <div className="segmented">
                {TYPES.map((t) => (
                  <button key={t.key} aria-pressed={type === t.key} onClick={() => setType(t.key)}>{tl(t.label)}</button>
                ))}
              </div>
            </div>
            <label className="field" style={{ marginBottom: 12 }}><span className="field-label">{tl("Заглавие (по избор)")}</span><input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field" style={{ marginBottom: 12 }}><span className="field-label">{tl("Описание")}</span><textarea className="inp" style={{ minHeight: 90 }} value={description} onChange={(e) => setDescription(e.target.value)} aria-required="true" /></label>
            <label className="field" style={{ marginBottom: 8 }}><span className="field-label">{tl("Имейл за обратна връзка (по избор)")}</span><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {status === "error" && <p className="field-err" role="alert"><Icon name="alert" size={13} /> {tl("Моля, попълнете описание и опитайте отново.")}</p>}
            <p className="chart-note"><Icon name="info" size={13} /> {tl("Прикачваме автоматично текущия адрес и версията на системата")} ({APP_VERSION}).</p>
            <div className="prof-actions">
              <button className="btn btn-primary" onClick={submit} disabled={status === "sending"}><Icon name="check" size={16} /> {status === "sending" ? tl("Изпращане…") : tl("Изпрати")}</button>
              <button className="btn" onClick={onClose}>{tl("Отказ")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
