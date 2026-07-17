"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { GoogleG } from "./UserMenu.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { APP_VERSION_LABEL, DATA_SOURCES_TEXT } from "../lib/version.js";

// Четирите предимства. Първите три са реален AI анализ (ежедневната задача чете и
// структурира процедури, документи и бюджети). Четвъртата е детерминистично
// сравнение с профила (не LLM) — затова НЕ я наричаме „AI".
const AI_FEATURES = [
  { icon: "sparkle", title: "AI анализ на процедурите", text: "Изкуственият интелект преглежда условията, допустимите кандидати, дейностите и основните изисквания." },
  { icon: "document", title: "AI преглед на документи", text: "Документите и публикуваните промени се анализират, за да бъдат откроени важните условия и актуализации." },
  { icon: "euro", title: "AI анализ на бюджети", text: "Бюджетите, размерът на финансирането и наличното съфинансиране се извличат и представят в разбираем вид." },
  { icon: "users", title: "Персонализирани препоръки", text: "Системата сравнява процедурите с профила и интересите ви, за да открие най-подходящите възможности." },
];

const AI_STEPS = [
  "Извличане на ключова информация",
  "Обобщаване на дълги документи",
  "Анализ на бюджети и финансиране",
  "Откриване на промени и важни срокове",
  "Сравняване с потребителския профил",
];

export default function SystemWelcomeModal({ onClose, onLogin, initialSection = null }) {
  const trapRef = useFocusTrap(true, onClose);
  const [aiOpen, setAiOpen] = useState(initialSection === "ai");
  const aiRef = useRef(null);

  // Дълбок линк от footer-а: „Как работи AI" отваря модала директно на AI секцията.
  useEffect(() => {
    if (initialSection === "ai" && aiRef.current) {
      aiRef.current.scrollIntoView({ block: "center" });
    }
  }, [initialSection]);

  return (
    <div className="overlay welcome-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" ref={trapRef}>
        <button className="drawer-close welcome-x" onClick={onClose} aria-label="Затвори"><Icon name="close" size={20} /></button>

        <div className="welcome-scroll">
          {/* Секция 1 — Добре дошли */}
          <section className="welcome-sec">
            <span className="welcome-mark" aria-hidden="true"><Icon name="euro" size={28} /></span>
            <span className="ai-badge"><Icon name="sparkle" size={14} aria-hidden="true" /> AI платформа за финансиране</span>
            <p className="welcome-eyebrow">Добре дошли в Европроекти</p>
            <h2 id="welcome-title">Открийте подходящото финансиране с помощта на AI</h2>
            <p className="welcome-lead">
              Европроекти събира на едно място актуални и предстоящи възможности за европейско и национално
              финансиране в България. Изкуственият интелект (AI) анализира процедурите, документите, бюджетите,
              сроковете и условията за кандидатстване, за да представи информацията по по-ясен и полезен начин.
            </p>

            <div className="welcome-benefits ai4">
              {AI_FEATURES.map((b) => (
                <div className="welcome-benefit" key={b.title}>
                  <span className="wb-ico" aria-hidden="true"><Icon name={b.icon} size={18} /></span>
                  <div><strong>{b.title}</strong><span>{b.text}</span></div>
                </div>
              ))}
            </div>

            {/* Как AI помага — компактен, разгъваем блок */}
            <div className="ai-help" ref={aiRef}>
              <div className="ai-help-top">
                <h3><Icon name="sparkle" size={16} aria-hidden="true" /> Как AI помага</h3>
                <button className="ai-help-toggle" aria-expanded={aiOpen} aria-controls="ai-help-body" onClick={() => setAiOpen((o) => !o)}>
                  Как работи AI? <Icon name={aiOpen ? "chevronDown" : "arrowRight"} size={14} aria-hidden="true" />
                </button>
              </div>
              <p className="ai-help-lead">
                AI обработката превръща дългите и сложни условия в структурирана информация — ключови срокове,
                допустими кандидати, бюджети, изисквани документи, дейности и промени по процедурите.
              </p>
              {aiOpen && (
                <div id="ai-help-body">
                  <ul className="ai-steps">
                    {AI_STEPS.map((s) => (<li key={s}><Icon name="check" size={14} aria-hidden="true" /> {s}</li>))}
                  </ul>
                  <p className="ai-help-accent">Това спестява време при първоначалния преглед и помага по-бързо да откриете подходящите възможности.</p>
                </div>
              )}
            </div>

            <p className="welcome-note"><Icon name="info" size={14} aria-hidden="true" /> Данните се събират от официални публични източници, включително {DATA_SOURCES_TEXT}. След това информацията се структурира и анализира с помощта на изкуствен интелект и се обновява автоматично.</p>
            <p className="welcome-disclaimer">AI анализът има помощен и информационен характер. Преди кандидатстване винаги проверявайте официалната документация и актуалните условия на съответната процедура.</p>
          </section>

          {/* Секция 2 — Вход */}
          <section className="welcome-sec welcome-login">
            <h3>Влезте с Google</h3>
            <button className="btn btn-google btn-google-lg" onClick={onLogin}><GoogleG size={20} /> Продължи с Google</button>
            <p className="welcome-login-text">Влезте, за да синхронизирате запазените процедури, профила и известията между устройствата си.</p>
            <button className="btn welcome-guest" onClick={onClose}>Продължи без регистрация</button>
            <p className="welcome-legal">
              Продължавайки с входа, потвърждавате, че сте прочели <a href="/terms">Условията за ползване</a> и <a href="/privacy">Политиката за поверителност</a>.
            </p>
          </section>

          {/* Секция 3 — Полезно */}
          <section className="welcome-sec welcome-links">
            <h3>Полезно</h3>
            <div className="welcome-links-row">
              <a className="welcome-link" href="/changelog"><Icon name="sparkle" size={16} /> Какво ново</a>
              <a className="welcome-link" href="/cookies"><Icon name="info" size={16} /> Бисквитки</a>
              <a className="welcome-link" href="/privacy"><Icon name="alert" size={16} /> Поверителност</a>
            </div>
            <p className="welcome-version">{APP_VERSION_LABEL}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
