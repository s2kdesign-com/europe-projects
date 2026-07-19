"use client";

// Глобална mobile swipe навигация между основните страници (Overview → Procedures
// → Calendar → Saved). Единствен source of truth е router pathname (НЕ стар React
// index). От вътрешна страница (/sources, /about…) първият swipe отваря Overview.
// Монтира се веднъж глобално (AppChrome).

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { MAIN_ROUTES, getMainRouteIndex, localizedPath } from "../lib/routes.js";

// Жестът НЕ активира навигация, ако започва върху интерактивен/скролируем елемент.
const EXCLUDE = "input,textarea,select,button,a,label,[role=button],[data-disable-route-swipe]," +
  ".site-footer,.overlay,.welcome,.cookie-banner,.um-menu,.segmented,.lang-panel," +
  ".cal-year,.chart-grid,.compare-scroll,.barchart,.colchart,.timeline,.table-scroll," +
  ".so-grid,.euro-geo-map,.country-select,.lang-select";

export default function RouteSwipe() {
  const pathname = usePathname();
  const router = useRouter();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let x0 = null, y0 = null, t0 = 0;
    const blocked = (el) => el && el.closest && el.closest(EXCLUDE);
    const start = (e) => {
      if (blocked(e.target)) { x0 = null; return; }
      const t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    };
    const end = (e) => {
      if (x0 == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0;
      x0 = null;
      // Хоризонтален, достатъчно дълъг и бърз жест.
      if (dt > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;

      const locale = i18n.language;
      const idx = getMainRouteIndex(pathname); // null → вътрешна страница
      // От вътрешна страница: първият swipe (в която и посока) отваря Overview.
      if (idx == null) {
        router.push(localizedPath("/", locale));
        try { window.scrollTo(0, 0); } catch { /* no-op */ }
        return;
      }
      // Основен маршрут: наляво → следваща, надясно → предишна.
      let next = null;
      if (dx < 0 && idx < MAIN_ROUTES.length - 1) next = MAIN_ROUTES[idx + 1];
      else if (dx > 0 && idx > 0) next = MAIN_ROUTES[idx - 1];
      if (next) router.push(localizedPath(next, locale));
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchend", end);
    };
  }, [pathname, router, i18n.language]);

  return null;
}
