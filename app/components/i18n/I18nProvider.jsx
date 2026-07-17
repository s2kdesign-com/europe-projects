"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../../lib/i18n/config.js";
import { localeDir, normalizeLocale } from "../../lib/i18n/locales.js";
import { applyLanguage, resetToDevice as resetToDeviceStore, resolveInitial } from "../../lib/i18n/language-store.js";
import { ensureCatalog } from "../../lib/i18n/catalog.js";
import { setUiLocale } from "../../lib/project-utils.js";

const LanguageContext = createContext(null);

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage трябва да е в <I18nProvider>");
  return ctx;
}

export default function I18nProvider({ children }) {
  const [lang, setLang] = useState(i18n.language || "bg");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onChange = (lng) => { setUiLocale(lng); setLang(lng); };
    i18n.on("languageChanged", onChange);
    setUiLocale(i18n.language);
    // No-flash скриптът вече е определил езика от URL (?lang) → ръчен избор → браузър
    // и config.js е инициализирал i18n с него. Доверяваме му се (иначе рутингът, който
    // маха ?lang от адреса, би позволил запазен избор да презапише URL езика). Само ако
    // no-flash не е успял (изключен JS в главата), пресмятаме наново.
    const flash = (typeof window !== "undefined" && window.__I18N_INITIAL) ? normalizeLocale(window.__I18N_INITIAL) : null;
    const initial = flash || resolveInitial();
    if (initial && initial !== i18n.language) applyLanguage(initial, { persist: false });
    ensureCatalog(initial).then((ok) => { if (ok && i18n.language === initial) i18n.changeLanguage(initial); });
    return () => i18n.off("languageChanged", onChange);
  }, []);

  // Изчаква каталога, после сменя езика → директно преведен UI (без fallback мигане).
  const setLanguage = useCallback(async (code) => {
    setLoading(true);
    try { await ensureCatalog(code); } finally { setLoading(false); }
    applyLanguage(code, { persist: true });
  }, []);

  const resetToDevice = useCallback(async () => {
    const lng = resetToDeviceStore();
    setLoading(true);
    try { const ok = await ensureCatalog(lng); if (ok && i18n.language === lng) i18n.changeLanguage(lng); }
    finally { setLoading(false); }
    return lng;
  }, []);

  const value = useMemo(
    () => ({ lang, dir: localeDir(lang), loading, setLanguage, resetToDevice }),
    [lang, loading, setLanguage, resetToDevice]
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}
