"use client";

// Локално (guest) съхранение на езиковия избор + прилагане към i18n.
// Ключове (съвпадат с no-flash скрипта в app/layout.jsx):
//   evroproekti_language      — ръчно избран guest език
//   evroproekti_language_mode — "manual" | "auto"

import i18n from "./config.js";
import { normalizeLocale, localeDir, DEFAULT_LOCALE } from "./locales.js";
import { resolveLanguage } from "./resolve.js";

export const LANG_KEY = "evroproekti_language";
export const LANG_MODE_KEY = "evroproekti_language_mode";

function ls() {
  try { return window.localStorage; } catch { return null; }
}

export function readGuestLanguage() {
  const s = ls();
  return s ? normalizeLocale(s.getItem(LANG_KEY)) : null;
}

export function readMode() {
  const s = ls();
  const v = s ? s.getItem(LANG_MODE_KEY) : null;
  return v === "manual" ? "manual" : "auto";
}

function browserLanguages() {
  if (typeof navigator === "undefined") return [];
  return navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language].filter(Boolean);
}

// Прилага език към i18n + <html lang/dir>. persist=true записва като ръчен избор.
export function applyLanguage(code, { persist = false } = {}) {
  const lng = normalizeLocale(code) || DEFAULT_LOCALE;
  if (i18n.language !== lng) i18n.changeLanguage(lng);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
    document.documentElement.dir = localeDir(lng);
  }
  const s = ls();
  if (s && persist) {
    try { s.setItem(LANG_KEY, lng); s.setItem(LANG_MODE_KEY, "manual"); } catch { /* ignore */ }
  }
  return lng;
}

// „Използвай езика на устройството" — маха ръчния избор и разпознава наново.
export function resetToDevice() {
  const s = ls();
  if (s) {
    try { s.removeItem(LANG_KEY); s.setItem(LANG_MODE_KEY, "auto"); } catch { /* ignore */ }
  }
  const lng = resolveLanguage({ browserLanguages: browserLanguages(), fallback: DEFAULT_LOCALE });
  return applyLanguage(lng, { persist: false });
}

// Разпознаване при първо посещение (без ръчен избор).
export function resolveInitial() {
  return resolveLanguage({
    storedGuestLanguage: readMode() === "manual" ? readGuestLanguage() : null,
    browserLanguages: browserLanguages(),
    fallback: DEFAULT_LOCALE,
  });
}
