"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import UserMenu from "./UserMenu.jsx";
import { TABS } from "../lib/constants.js";

const TAB_ICON = { overview: "grid", procedures: "list", calendar: "calendar", saved: "bookmark" };

// Прагове за компактния мобилен режим (скрива само горния ред при скрол надолу).
const MOBILE_MAX = 720;    // съществуващият breakpoint на проекта
const COMPACT_AFTER = 80;  // компактен режим чак след 80px от върха
const TOP_RESET_AT = 40;   // близо до върха → винаги пълен header
const DIR_THRESHOLD = 16;  // натрупано движение в посока, преди да превключим
const COMPACT_LOCK_MS = 500; // заключване след смяна на режима (анти-трептене)

export default function AppHeader({ tab, onTab, savedCount, session }) {
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

    // Смяната на режима мени височината на s