"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { GoogleG } from "./UserMenu.jsx";
import { useSession } from "../hooks/useSession.js";
import { APP_VERSION, CHANGELOG_SEEN_KEY } from "../lib/version.js";

const emit = (name) => window.dispatchEvent(new CustomEvent(name));

export default function SiteFooter({ session: sessionProp }) {
  const own = useSession();
  const session = sessionProp || own;
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    try { setHasNew(window.localStorage.getItem(CHANGELOG_SEEN_KEY) !== APP_VERSION); } catch { /* ignore */ }
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner container">
        {/* Колона 1 */}
        <div className="sf-col">
          <div className="sf-brand">
            <span className="brand-mark" aria-hidden="true"><Icon name="euro" size={20} /></span>
            <span className="brand-name">Европроекти</span>
          </div>
          <p className="sf-tagline">Табло за европейско и национално финансиране в България.</p>
          <p className="sf-desc">Актуални и предстоящи процедури, срокове и препоръки — на едно място.</p>
          <p className="sf-status"><span className="live-dot" /> Данните се обновяват автоматично всеки ден</p>
          <div className="sf-links">
            <button className="sf-link" onClick={() => emit("open-welcome")}>За системата</button>
            <button className="sf-link" onClick={() => emit("open-welcome")}>Източници на данни</button>
          </div>
        </div>

        {/* Колона 2 — профил */}
        <div className="sf-col">
          {session.authenticated ? (
            <>
              <h4 className="sf-title">Вашият профил</h4>
              <div className="sf-user">
                {session.user?.avatar_url ? <img className="um-avatar" src={session.user.avatar_url} alt="" width={36} height={36} referrerPolicy="no-referrer" /> : <span className="um-avatar um-initials">{(session.user?.display_name || "?").charAt(0).toUpperCase()}</span>}
                <div style={{ minWidth: 0 }}><div className="sf-user-name">{session.user?.display_name}</div><div className="sf-user-email">{session.user?.email}</div></div>
              </div>
              <div className="sf-links">
                <a className="sf-link" href="/profile">Преглед на профила</a>
                <a className="sf-link" href={session.isAdmin ? "/admin" : "/profile?section=preferences"}>Настройки</a>
                <button className="sf-link" onClick={() => session.logout()}>Изход</button>
              </div>
            </>
          ) : (
            <>
              <h4 className="sf-title">Запазвайте възможностите си</h4>
              <p className="sf-desc">Влезте, за да синхронизирате запазените процедури, профила и известията между устройствата си.</p>
              <button className="btn btn-google" onClick={() => session.login()}><GoogleG /> <span>Вход с Google</span></button>
              <div className="sf-links" style={{ marginTop: 10 }}>
                <button className="sf-link" onClick={() => emit("open-welcome")}>Защо да създам профил?</button>
              </div>
            </>
          )}
        </div>

        {/* Колона 3 — връзки */}
        <div className="sf-col">
          <h4 className="sf-title">Полезни връзки</h4>
          <div className="sf-links sf-links-grid">
            <a className="sf-link" href="/?tab=overview">Обзор</a>
            <a className="sf-link" href="/?tab=procedures">Процедури</a>
            <a className="sf-link" href="/?tab=calendar">Календар</a>
            <a className="sf-link" href="/?tab=saved">Запазени</a>
            <a className="sf-link" href="/changelog">Changelog{hasNew && <span className="new-dot" aria-label="нова версия" />}</a>
            <button className="sf-link" onClick={() => emit("open-welcome")}>За системата</button>
            <a className="sf-link" href="/terms">Условия за ползване</a>
            <a className="sf-link" href="/privacy">Политика за поверителност</a>
            <a className="sf-link" href="/cookies">Политика за бисквитките</a>
            <button className="sf-link" onClick={() => emit("open-cookie-settings")}>Настройки на бисквитките</button>
            <button className="sf-link" onClick={() => emit("open-feedback")}>Подай сигнал за проблем</button>
          </div>
        </div>
      </div>

      <div className="sf-bottom">
        <div className="container sf-bottom-inner">
          Made with Love <span className="heart" aria-hidden="true">💗</span> by{" "}
          <a href="https://s2kdesign.com" target="_blank" rel="noopener noreferrer">s2kdesign.com</a> © {year} All Rights Reserved
        </div>
      </div>
    </footer>
  );
}
