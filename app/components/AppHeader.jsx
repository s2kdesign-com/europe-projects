"use client";

import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";
import { TABS } from "../lib/constants.js";

const TAB_ICON = { overview: "grid", procedures: "list", calendar: "calendar", saved: "bookmark" };

export default function AppHeader({ tab, onTab, savedCount, session }) {
  const navRef = useRef(null);
  const goHome = (e) => { e.preventDefault(); onTab("overview"); };
  const openWelcome = () => window.dispatchEvent(new CustomEvent("open-welcome"));

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector('[aria-current="page"]');
    if (!active) return;
    const nr = nav.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    const delta = ar.left - nr.left - (nav.clientWidth - active.offsetWidth) / 2;
    if (Math.abs(delta) > 4) nav.scrollBy({ left: delta, behavior: "smooth" });
  }, [tab]);

  return (
    <header className="appbar">
      <div className="appbar-inner">
        <a className="brand" href="/" onClick={goHome} aria-label="Европроекти — начало">
          <span className="brand-mark" aria-hidden="true"><Icon name="euro" size={20} /></span>
          <span>
            <span className="brand-name">Европроекти</span>
            <br />
            <span className="brand-sub">Табло за финансиране</span>
          </span>
        </a>

        <div className="appbar-account">
          <button className="help-btn" onClick={openWelcome} aria-label="За системата" title="За системата"><Icon name="info" size={18} /></button>
          {session && <UserMenu session={session} />}
        </div>

        <nav className="nav" aria-label="Основна навигация" ref={navRef}>
          {TABS.map((t) => (
            <button key={t.key} className="nav-tab" aria-current={tab === t.key ? "page" : undefined} onClick={() => onTab(t.key)}>
              <Icon name={TAB_ICON[t.key]} size={16} />
              {t.label}
              {t.key === "saved" && savedCount > 0 && <span className="count-dot">{savedCount}</span>}
            </button>
          ))}
        </nav>

        <div className="nav-swipe-hint" aria-hidden="true">
          <Icon name="chevronRight" size={12} style={{ transform: "rotate(180deg)" }} /> плъзни за смяна <Icon name="chevronRight" size={12} />
        </div>
      </div>
    </header>
  );
}
