"use client";

import Icon from "./Icon.jsx";
import { GoogleG } from "./UserMenu.jsx";
import { useFocusTrap } from "../hooks/useFocusTrap.js";
import { APP_VERSION_LABEL, DATA_SOURCES_TEXT } from "../lib/version.js";

const BENEFITS = [
  { icon: "clock", title: "Актуални процедури и срокове", text: "Отворени и предстоящи възможности на едно място." },
  { icon: "users", title: "Персонализирани препоръки", text: "Съвпадения спрямо вашия профил и интереси." },
  { icon: "bookmark", title: "Запазване и следене", text: "Следете промените по избраните възможности." },
];

export default function SystemWelcomeModal({ onClose, onLogin }) {
  const trapRef = useFocusTrap(true, onClose);
  return (
    <div className="overlay welcome-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title" ref={trapRef}>
        <button className="drawer-close welcome-x" onClick={onClose} aria-label="Затвори"><Icon name="close" size={20} /></button>

        <div className="welcome-scroll">
          {/* Секция 1 — Добре дошли */}
          <section className="welcome-sec">
            <span className="welcome-mark" aria-hidden="true"><Icon name="euro" size={28} /></span>
            <p className="welcome-eyebrow">Добре дошли в Европроекти</p>
            <h2 id="welcome-title">Открийте подходящото финансиране по-лесно</h2>
            <p className="welcome-lead">
              Европроекти събира на едно място актуални и предстоящи процедури за европейско и национално
              финансиране в България.
            </p>
            <div className="welcome-benefits">
              {BENEFITS.map((b) => (
                <div className="welcome-benefit" key={b.title}>
                  <span className="wb-ico"><Icon name={b.icon} size={18} /></span>
                  <div><strong>{b.title}</strong><span>{b.text}</span></div>
                </div>
              ))}
            </div>
            <p className="welcome-note"><Icon name="info" size={14} /> Данните се събират от официални публични източници, включително {DATA_SOURCES_TEXT}, и се обновяват автоматично.</p>
            <p className="welcome-disclaimer">Информацията има справочен характер. Преди кандидатстване винаги проверявайте официалната страница и актуалните условия на процедурата.</p>
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
