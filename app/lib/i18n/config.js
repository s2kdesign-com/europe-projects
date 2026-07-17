"use client";

// react-i18next инстанция за клиента. Български е bundle-нат като source of truth
// и fallback. Другите каталози се зареждат лениво (Phase 3) от бекенда/кеша, който
// ги генерира през Google Cloud Translation. Липсващ ключ → български fallback,
// никога самият ключ като видим текст.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import bg from "../../locales/bg.json";
import { DEFAULT_LOCALE, isSupported, localeDir } from "./locales.js";

// ВАЖНО: инициализираме на български (DEFAULT_LOCALE) — точно каквото е рендирано
// в статичния HTML при билд. Така първият клиентски рендер СЪВПАДА със сървърния и
// няма hydration mismatch (React #418). Реалният език (URL/профил/браузър) се
// прилага веднага СЛЕД хидратацията в I18nProvider (кратко превключване, не flash
// на цялата страница, защото каталозите се кешират локално).
const isDev = typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: { bg: { translation: bg } },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: false, // валидираме сами през locales.js
    interpolation: { escapeValue: false }, // React вече escape-ва
    returnNull: false,
    returnEmptyString: false,
    saveMissing: false,
    react: { useSuspense: false },
    missingKeyHandler: isDev
      ? (lngs, ns, key) => { console.warn(`[i18n] липсва ключ: ${key} (${lngs?.join(",")})`); }
      : undefined,
  });
}

// Държи <html lang>/<dir> в синхрон с активния език.
i18n.on("languageChanged", (lng) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
    document.documentElement.dir = localeDir(lng);
  }
});

export default i18n;
