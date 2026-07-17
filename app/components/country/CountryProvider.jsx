"use client";

// Централен CountryContext за цялата система. Държавата е ОТДЕЛНА от езика.
// Инициализира се на bg (както SSR статиката), после се разрешава на клиента —
// без flash и без hydration mismatch. Автоматичното предложение НЕ се записва
// като manual, докато потребителят не потвърди.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_COUNTRY, COUNTRIES, getCountry, normalizeCountry } from "../../lib/country/countries.js";
import { readCountryPref, writeCountryPref, clearCountryPref } from "../../lib/country/store.js";
import { resolveCountry } from "../../lib/country/resolve.js";

const CountryContext = createContext(null);
export function useCountry() {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error("useCountry must be used within CountryProvider");
  return ctx;
}

async function fetchGeoSuggestion() {
  try {
    const r = await fetch("/api/geo", { credentials: "same-origin" });
    if (!r.ok) return null;
    const d = await r.json();
    return normalizeCountry(d && d.country);
  } catch { return null; }
}
async function fetchProfileCountry() {
  try {
    const r = await fetch("/api/profile/country", { credentials: "same-origin" });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.authenticated === false) return null;
    return { country: normalizeCountry(d.country), mode: d.mode === "manual" ? "manual" : "auto", detectionEnabled: d.detectionEnabled !== false };
  } catch { return null; }
}

export default function CountryProvider({ initialSlug = null, children }) {
  const [country, setCountryState] = useState(DEFAULT_COUNTRY);
  const [mode, setMode] = useState("auto");
  const [detectionSource, setDetectionSource] = useState("fallback");
  const [suggestedCountry, setSuggestedCountry] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  // Разрешаване на клиента (веднъж).
  useEffect(() => {
    let alive = true;
    (async () => {
      const guest = readCountryPref();
      const [geo, profile] = await Promise.all([fetchGeoSuggestion(), fetchProfileCountry()]);
      if (!alive) return;
      setSuggestedCountry(geo || null);
      setAuthenticated(!!profile);
      const res = resolveCountry({
        urlSlug: initialSlug,
        profileCountry: profile && profile.country,
        profileMode: profile && profile.mode,
        guestPref: guest,
        cloudflareCountry: geo,
        browserLocales: typeof navigator !== "undefined" ? navigator.languages : null,
      });
      setCountryState(res.country);
      setMode(res.mode);
      setDetectionSource(res.source);
      setConfirmed(res.mode === "manual" || (guest && guest.confirmed) || false);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [initialSlug]);

  // Ръчен избор: записва guest manual + профил (ако е логнат). Езикът не се пипа.
  const setCountry = useCallback(async (code, { persist = true } = {}) => {
    const cc = normalizeCountry(code);
    if (!cc) return;
    setCountryState(cc);
    setMode("manual");
    setDetectionSource("manual");
    setConfirmed(true);
    if (persist) {
      writeCountryPref(cc, { mode: "manual", confirmed: true });
      if (authenticated) {
        try {
          await fetch("/api/profile/country", {
            method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
            body: JSON.stringify({ country: cc, mode: "manual", detectionEnabled: true }),
          });
        } catch { /* локалният избор вече е приложен */ }
      }
    }
  }, [authenticated]);

  // Връщане към автоматично предложената държава.
  const resetToAutomaticCountry = useCallback(async () => {
    clearCountryPref();
    const geo = suggestedCountry || (await fetchGeoSuggestion());
    const res = resolveCountry({
      cloudflareCountry: geo,
      browserLocales: typeof navigator !== "undefined" ? navigator.languages : null,
    });
    setCountryState(res.country);
    setMode("auto");
    setDetectionSource(res.source);
    setConfirmed(false);
    if (authenticated) {
      try {
        await fetch("/api/profile/country", {
          method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
          body: JSON.stringify({ country: null, mode: "auto", detectionEnabled: true }),
        });
      } catch { /* no-op */ }
    }
  }, [authenticated, suggestedCountry]);

  const value = useMemo(() => ({
    selectedCountry: country,
    country: getCountry(country),
    countryMode: mode,
    detectionSource,
    suggestedCountry,
    supportedCountries: COUNTRIES,
    isCountryConfirmed: confirmed,
    countryDataStatus: ready ? "ready" : "loading",
    ready,
    setCountry,
    resetToAutomaticCountry,
  }), [country, mode, detectionSource, suggestedCountry, confirmed, ready, setCountry, resetToAutomaticCountry]);

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}
