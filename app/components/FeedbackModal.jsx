"use client";

import { useState } from "react";
import Icon from "./Icon.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { APP_VERSION } from "../lib/version.js";

const TYPES = [
  { key: "bug", label: "Грешка" },
  { key: "data", label: "Неточни данни" },
  { key: "idea", label: "Предложение" },
];

export default function FeedbackModal({ onClose }) {
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
          <h2 id="fb-title" style={{ flex: 1 }}>Подай сигнал за проблем</h2>
          <button className="drawer-close" style={{ width: 40, height: 40 }} onClick={onClose} aria-label="Затвори"><Icon name="close" size={18} /></button>
        </div>
        {status === "ok" ? (
          <p className="save-ok" role="status"><Icon name="check" size={16} /> Благодарим! Сигналът е изпратен.</p>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <span className="field-label">Тип</span>
              <div className="segmented">
                {TYPES.map((t) => (
                  <button key={t.key} aria-pressed={type === t.key} onClick={() => setType(t.key)}>{t.label}</button>
                ))}
              </div>
            </div>
            <label className="field" style={{ marginBottom: 12 }}><span className="field-label">Заглавие (по избор)</span><input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field" style={{ marginBottom: 12 }}><span className="field-label">Описание</span><textarea className="inp" style={{ minHeight: 90 }} value={description} onChange={(e) => setDescription(e.target.value)} aria-required="true" /></label>
            <label className="field" style={{ marginBottom: 8 }}><span className="field-label">Имейл за обратна връзка (по избор)</span><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {status === "error" && <p className="field-err" role="alert"><Icon name="alert" size={13} /> Моля, попълнете описание и опитайте отново.</p>}
            <p className="chart-note"><Icon name="info" size={13} /> Прикачваме автоматично текущия адрес и версията на системата ({APP_VERSION}).</p>
            <div className="prof-actions">
              <button className="btn btn-primary" onClick={submit} disabled={status === "sending"}><Icon name="check" size={16} /> {status === "sending" ? "Изпращане…" : "Изпрати"}</button>
              <button className="btn" onClick={onClose}>Отказ</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
