// Определяне на активната държава по ясен приоритет. Езикът и държавата са отделни:
// тук НЕ пипаме езика. Автоматичната детекция никога не се записва като manual.
//
// Приоритет:
//   1. Изричен country в URL (когато route-ът го поддържа: /countries/:slug/...).
//   2. Manual preference от профила (logged-in).
//   3. Manual guest preference от localStorage.
//   4. Cloudflare country code (приблизителен, без raw IP).
//   5. Region subtag от navigator.languages (напр. ro-RO → RO).
//   6. България (fallback).

import { DEFAULT_COUNTRY, normalizeCountry, getCountryBySlug } from "./countries.js";

// Извлича region subtag от списък локали: "ro-RO" → "RO".
export function countryFromLocales(locales) {
  const list = Array.isArray(locales) ? locales : locales ? [locales] : [];
  for (const l of list) {
    const m = /-([A-Za-z]{2})\b/.exec(String(l || ""));
    const cc = m && normalizeCountry(m[1]);
    if (cc) return cc;
  }
  return null;
}

// Опис на входовете; всеки може да липсва. `urlSlug` идва от route-а.
export function resolveCountry({
  urlSlug = null,
  profileCountry = null,
  profileMode = null,
  guestPref = null,
  cloudflareCountry = null,
  browserLocales = null,
} = {}) {
  // 1. URL
  const bySlug = getCountryBySlug(urlSlug);
  if (bySlug) return { country: bySlug.code, source: "url", mode: "manual" };

  // 2. Профил (само ако е ръчно избран)
  const profCc = normalizeCountry(profileCountry);
  if (profCc && profileMode === "manual") return { country: profCc, source: "profile", mode: "manual" };

  // 3. Guest ръчен избор
  if (guestPref && guestPref.mode === "manual") {
    const g = normalizeCountry(guestPref.country);
    if (g) return { country: g, source: "local", mode: "manual" };
  }

  // 4. Cloudflare (приблизително)
  const cf = normalizeCountry(cloudflareCountry);
  if (cf) return { country: cf, source: "cloudflare", mode: "auto" };

  // 5. Browser locale region
  const loc = countryFromLocales(browserLocales);
  if (loc) return { country: loc, source: "browser_locale", mode: "auto" };

  // 6. Fallback
  return { country: DEFAULT_COUNTRY, source: "fallback", mode: "auto" };
}
