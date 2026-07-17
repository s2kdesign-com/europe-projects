// Guest предпочитание за държава — само localStorage (без raw IP, без geolocation).
// Формат: { country, mode, confirmed, updatedAt }. mode ∈ {auto, manual}.

import { normalizeCountry } from "./countries.js";

export const COUNTRY_LS_KEY = "eurofunds_country_v1";

export function readCountryPref() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COUNTRY_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const country = normalizeCountry(p && p.country);
    if (!country) return null;
    return {
      country,
      mode: p.mode === "manual" ? "manual" : "auto",
      confirmed: !!p.confirmed,
      updatedAt: p.updatedAt || null,
    };
  } catch {
    return null;
  }
}

// Записва САМО ръчен избор като manual. Автоматичното предложение НЕ се записва тук
// като manual (то остава ефимерно, за да не „замразим“ детекцията).
export function writeCountryPref(country, { mode = "manual", confirmed = true } = {}) {
  if (typeof window === "undefined") return;
  const code = normalizeCountry(country);
  if (!code) return;
  try {
    window.localStorage.setItem(
      COUNTRY_LS_KEY,
      JSON.stringify({ country: code, mode, confirmed, updatedAt: new Date().toISOString() })
    );
  } catch { /* игнорираме quota/private mode грешки */ }
}

export function clearCountryPref() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(COUNTRY_LS_KEY); } catch { /* no-op */ }
}
