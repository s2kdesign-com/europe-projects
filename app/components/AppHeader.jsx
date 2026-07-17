"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";
import { TABS } from "../lib/constants.js";
import { pathForTab } from "../lib/routes.js";

const TAB_ICON = { overview: "grid", procedures: "list", calendar: "calendar", saved: "bookmark" };

// Прагове за компактния мобилен режим (скрива само горния ред при скрол надолу).
const MOBILE_MAX = 720;    // съществуващият breakpoint на проекта
const COMPACT_AFTER = 80;  // компактен режим чак след 80px от върха
const TOP_RESET_AT = 40;   // близо до върха → винаги пълен header
const DIR_THRESHOLD = 16;  // натрупано движение в посока, преди да превключим
const COMPACT_LOCK_MS = 500; // заключване след смяна на режима (анти-трептене)

export default function AppHeader({ tab, onTab, savedCount, session }) {
  const { t: tr } = useTranslation();
  const navRef = useRef(null);
  const topRef = useRef(null);
  const [compact, setCompact] = useState(false);
  const goHome = (e) => { e.preventDefault(); onTab("overview"); };
  const openWelcome = () => window.dispatchEvent(new CustomEvent("open-welcome"));

  // Центриране на активния таб в хоризонталната навигация.
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

  // Скрий/покажи само горния ред при вертикален скрол (само на мобилно).
  useEffect(() => {
    const isMobile = () => window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
    let lastY = window.scrollY;
    let accum = 0;      // натрупано движение в текущата посока (анти-трептене)
    let ticking = false;
    let lockUntil = 0;  // кратко заключване след смяна на режима
    let cur = false;    // текущ компактен режим (без stale state)

    // Смяната на режима мени височината на sticky header-а → браузърът мести
    // scrollY (scroll anchoring). Заключваме за момент, за да не броим този
    // индуциран скрол като движение на потребителя (иначе се получава трептене).
    const apply = (v) => {
      if (v === cur) return;
      cur = v;
      setCompact(v);
      lockUntil = performance.now() + COMPACT_LOCK_MS;
    };

    const evaluate = () => {
      ticking = false;
      if (!isMobile()) { apply(false); return; }
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      // Не пипай режима, докато е отворен dropdown/модал (пази взаимодействието).
      if (document.querySelector(".um-menu, .overlay")) return;
      if (y <= TOP_RESET_AT) { apply(false); accum = 0; return; } // близо до върха → винаги пълен
      if (performance.now() < lockUntil) { accum = 0; return; }   // поглъщаме индуцирания скрол
      if (dy === 0) return;
      // Смяна на посоката → нулираме натрупването (по-стабилно при momentum).
      if ((dy > 0) !== (accum > 0)) accum = 0;
      accum += dy;
      if (accum >= DIR_THRESHOLD && y > COMPACT_AFTER) { apply(true); accum = 0; }
      else if (accum <= -DIR_THRESHOLD) { apply(false); accum = 0; }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(evaluate); } };
    const onResize = () => { if (!isMobile()) apply(false); };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); };
  }, []);

  // Скритият горен ред не трябва да е фокусируем (inert само на клиента, за да няма hydration разлика).
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    if (compact) el.setAttribute("inert", ""); else el.removeAttribute("inert");
  }, [compact]);

  return (
    <header className={"appbar mobile-header" + (compact ? " is-compact" : "")}>
      <div className="appbar-inner">
        <div className="appbar-top" ref={topRef}>
          <a className="brand" href="/" onClick={goHome} aria-label="Европроекти — начало">
            <span className="brand-mark" aria-hidden="true"><Icon name="euro" size={20} /></span>
            <span>
              <span className="brand-name">Европроекти</span>
              <br />
              <span className="brand-sub">Табло за финансиране</span>
            </span>
          </a>

          <div className="appbar-account">
            <button className="help-btn" onClick={openWelcome} aria-label={tr("footer.aboutSystem")} title={tr("footer.aboutSystem")}><Icon name="info" size={18} /></button>
            {session && <UserMenu session={session} />}
          </div>
        </div>

        <nav className="nav" aria-label={tr("navigation.ariaLabel")} ref={navRef}>
          {TABS.map((item) => (
            <Link
              key={item.key}
              href={pathForTab(item.key)}
              className="nav-tab"
              aria-current={tab === item.key ? "page" : undefined}
            >
              <Icon name={TAB_ICON[item.key]} size={16} />
              {tr("navigation." + item.key)}
              {item.key === "saved" && savedCount > 0 && <span className="count-dot">{savedCount}</span>}
            </Link>
          ))}
        </nav>

        <div className="nav-swipe-hint" aria-hidden="true">
          <Icon name="chevronRight" size={12} style={{ transform: "rotate(180deg)" }} /> {tr("navigation.swipeHint")} <Icon name="chevronRight" size={12} />
        </div>
      </div>
    </header>
  );
}
