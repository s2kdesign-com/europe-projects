"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../../lib/i18n/config.js";
import { localeDir } from "../../lib/i18n/locales.js";
import { applyLanguage, resetToDevice as resetToDeviceStore, resolveInitial } from "../../lib/i18n/language-store.js";

const LanguageContext = createContext(null);

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage трябва да е в <I18nProvider>");
  return ctx;
}

export default function I18nProvider({ children }) {
  const [lang, setLang] = useState(i18n.language || "bg");

  // Синхронизира локалния state при всяка смяна на езика (от всеки източник).
  useEffect(() => {
    const onChange = (lng) => setLang(lng);
    i18n.on("languageChanged", onChange);
    // Ако no-flash скриптът не е успял (напр. изключен JS в главата), коригираме.
    const initial = resolveInitial();
    if (initial && initial !== i18n.language) applyLanguage(initial, { persist: false });
    return () => i18n.off("languageChanged", onChange);
  }, []);

  const setLanguage = useCallback((code) => applyLanguage(code, { persist: true }), []);
  const resetToDevice = useCallback(() => resetToDeviceStore(), []);

  const value = useMemo(
    () => ({ lang, dir: localeDir(lang), setLanguage, resetToDevice }),
    [lang, setLanguage, resetToDevice]
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}
