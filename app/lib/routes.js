// Централно съответствие таб ↔ реален маршрут (SEO-friendly пътища вместо ?tab=).
// Locale-осъзнато: незадължителен префикс /en, /de… (bg е без префикс — default).

import { LOCALE_CODES, DEFAULT_LOCALE } from "./i18n/locales.js";

// Основни табове в главното меню → път (без locale префикс).
export const TAB_PATHS = {
  overview: "/",
  procedures: "/procedures",
  calendar: "/calendar",
  saved: "/saved",
};
export const PATH_TABS = { "": "overview", procedures: "procedures", calendar: "calendar", saved: "saved" };

// Кои query параметри принадлежат на кой маршрут (за почистване при навигация).
export const ROUTE_QUERY_KEYS = {
  overview: ["period", "activityPeriod", "candidateType", "program"],
  procedures: ["q", "status", "deadline", "program", "target", "sort", "view", "changeType", "weekFrom", "weekTo"],
  calendar: ["month", "year", "view"],
  saved: [],
};

// Разделя pathname на { locale, rest } — напр. "/en/procedures" → { locale:"en", rest:"/procedures" }.
export function splitLocale(pathname) {
  const m = /^\/([a-z]{2})(?=\/|$)/.exec(pathname || "/");
  if (m && LOCALE_CODES.includes(m[1]) && m[1] !== DEFAULT_LOCALE) {
    return { locale: m[1], rest: pathname.slice(3) || "/" };
  }
  return { locale: DEFAULT_LOCALE, rest: pathname || "/" };
}

// Табът от pathname (пренебрегва locale префикса и trailing slash).
export function tabFromPath(pathname) {
  const { rest } = splitLocale(pathname);
  const seg = rest.replace(/^\/+|\/+$/g, "").split("/")[0] || "";
  return PATH_TABS[seg] || "overview";
}

// Локализиран път за таб: bg → "/procedures", en → "/en/procedures".
export function pathForTab(tabKey, locale = DEFAULT_LOCALE) {
  const base = TAB_PATHS[tabKey] || "/";
  if (locale && locale !== DEFAULT_LOCALE && LOCALE_CODES.includes(locale)) {
    return base === "/" ? `/${locale}` : `/${locale}${base}`;
  }
  return base;
}

// Прибавя locale префикс към произволен път (за hreflang/линкове).
export function localizedPath(path, locale = DEFAULT_LOCALE) {
  const clean = path.startsWith("/") ? path : "/" + path;
  if (!locale || locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
