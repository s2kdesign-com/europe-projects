"use client";

import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";

// По-лек хедър за страниците /login и /profile.
export default function AccountHeader({ session, showBack = true }) {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        <a className="brand" href="/" aria-label="Европроекти — начало">
          <span className="brand-mark" aria-hidden="true"><Icon name="euro" size={20} /></span>
          <span>
            <span className="brand-name">Европроекти</span>
            <br />
            <span className="brand-sub">Табло за финансиране</span>
          </span>
        </a>
        {session && <div className="appbar-account"><UserMenu session={session} /></div>}
        <nav className="nav" aria-label="Навигация">
          {showBack && (
            <a className="nav-tab" href="/">
              <Icon name="arrowRight" size={16} style={{ transform: "rotate(180deg)" }} /> Към таблото
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
