"use client";

// Интерактивна ГЕОГРАФСКА карта на Европа (локален оптимизиран SVG от Wikimedia
// „Blank map of Europe" CC BY-SA, опростени координати — /public/europe-map.svg).
// Зарежда се с fetch (кешира се от CDN, не тежи в JS bundle-а), инжектира се
// inline и се оцветява по броя процедури. Всяка EU държава е keyboard-фокусируема
// (Enter/Space = избор). Съседните не-EU държави са неактивен сив контекст.

import { useEffect, useRef, useState } from "react";

// Последователна синя скала (не червено/зелено).
function tier(n, enabled) {
  if (!enabled || n == null || n === 0) return "t0";
  if (n < 10) return "t1";
  if (n < 30) return "t2";
  if (n < 100) return "t3";
  return "t4";
}

export default function EuropeGeoMap({ countries, selected, onSelect, labelFor }) {
  const hostRef = useRef(null);
  const [svgText, setSvgText] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/europe-map.svg")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("http_" + r.status))))
      .then((t) => { if (alive) setSvgText(t); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Оцветяване + достъпност + събития след инжектиране/промяна на данните.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !svgText) return;
    const byCode = Object.fromEntries((countries || []).map((c) => [c.code, c]));
    const paths = host.querySelectorAll("path.eu");
    const handlers = [];
    paths.forEach((p) => {
      const code = p.getAttribute("data-code");
      const c = byCode[code];
      p.classList.remove("t0", "t1", "t2", "t3", "t4", "is-selected");
      p.classList.add(tier(c ? c.totalProcedures : null, c ? c.enabled : false));
      if (selected === code) p.classList.add("is-selected");
      p.setAttribute("tabindex", "0");
      p.setAttribute("role", "button");
      p.setAttribute("aria-pressed", selected === code ? "true" : "false");
      if (c && labelFor) p.setAttribute("aria-label", labelFor(c));
      const activate = (e) => { e.preventDefault(); if (onSelect) onSelect(code); };
      const onKey = (e) => { if (e.key === "Enter" || e.key === " ") activate(e); };
      p.addEventListener("click", activate);
      p.addEventListener("keydown", onKey);
      handlers.push([p, activate, onKey]);
    });
    return () => { handlers.forEach(([p, a, k]) => { p.removeEventListener("click", a); p.removeEventListener("keydown", k); }); };
  }, [svgText, countries, selected, onSelect, labelFor]);

  if (failed) return null; // страницата има таблица-алтернатива с данните
  return (
    <div
      ref={hostRef}
      className="euro-geo-map"
      // Собствен статичен asset (не потребителско съдържание) — безопасно inline.
      dangerouslySetInnerHTML={svgText ? { __html: svgText } : undefined}
      aria-busy={!svgText}
    />
  );
}
