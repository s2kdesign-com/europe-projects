// Централен списък с поддържани езици. Добавяне на нов език = само нов ред тук
// (компонентите не се пипат). Валидира се спрямо Google Cloud Translation
// (виж GET /api/i18n/languages, който сверява enabled спрямо реалния списък).
//
// dir: "ltr" | "rtl" — архитектурата е RTL-готова (logical CSS properties),
// дори първоначалният списък да няма RTL език.

export const DEFAULT_LOCALE = "bg";

export const SUPPORTED_LOCALES = [
  { code: "bg", label: "Bulgarian", native: "Български", dir: "ltr", enabled: true },
  { code: "en", label: "English", native: "English", dir: "ltr", enabled: true },
  { code: "de", label: "German", native: "Deutsch", dir: "ltr", enabled: true },
  { code: "fr", label: "French", native: "Français", dir: "ltr", enabled: true },
  { code: "es", label: "Spanish", native: "Español", dir: "ltr", enabled: true },
  { code: "it", label: "Italian", native: "Italiano", dir: "ltr", enabled: true },
  { code: "ro", label: "Romanian", native: "Română", dir: "ltr", enabled: true },
  { code: "el", label: "Greek", native: "Ελληνικά", dir: "ltr", enabled: true },
  { code: "pl", label: "Polish", native: "Polski", dir: "ltr", enabled: true },
  { code: "cs", label: "Czech", native: "Čeština", dir: "ltr", enabled: true },
  { code: "sk", label: "Slovak", native: "Slovenčina", dir: "ltr", enabled: true },
  { code: "hu", label: "Hungarian", native: "Magyar", dir: "ltr", enabled: true },
  { code: "nl", label: "Dutch", native: "Nederlands", dir: "ltr", enabled: true },
  { code: "pt", label: "Portuguese", native: "Português", dir: "ltr", enabled: true },
  { code: "tr", label: "Turkish", native: "Türkçe", dir: "ltr", enabled: true },
  { code: "uk", label: "Ukrainian", native: "Українська", dir: "ltr", enabled: true },
  { code: "sr", label: "Serbian", native: "Српски", dir: "ltr", enabled: true },
  { code: "hr", label: "Croatian", native: "Hrvatski", dir: "ltr", enabled: true },
  { code: "sl", label: "Slovenian", native: "Slovenščina", dir: "ltr", enabled: true },
  { code: "sv", label: "Swedish", native: "Svenska", dir: "ltr", enabled: true },
  { code: "da", label: "Danish", native: "Dansk", dir: "ltr", enabled: true },
  { code: "fi", label: "Finnish", native: "Suomi", dir: "ltr", enabled: true },
  { code: "et", label: "Estonian", native: "Eesti", dir: "ltr", enabled: true },
  { code: "lv", label: "Latvian", native: "Latviešu", dir: "ltr", enabled: true },
  { code: "lt", label: "Lithuanian", native: "Lietuvių", dir: "ltr", enabled: true },
];

export const LOCALE_CODES = SUPPORTED_LOCALES.map((l) => l.code);
const BY_CODE = new Map(SUPPORTED_LOCALES.map((l) => [l.code, l]));

export function isSupported(code) {
  return BY_CODE.has(String(code || "").toLowerCase());
}

export function getLocale(code) {
  return BY_CODE.get(String(code || "").toLowerCase()) || null;
}

export function localeDir(code) {
  const l = getLocale(code);
  return l ? l.dir : "ltr";
}

// Нормализира произволен locale низ до поддържан код:
//   en-US → en, de-DE → de, bg-BG → bg, pt-BR → pt (ако няма отделен pt-BR).
// Връща null, ако базовият език не се поддържа.
export function normalizeLocale(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return null;
  if (BY_CODE.has(raw)) return raw;
  const base = raw.split("-")[0];
  if (BY_CODE.has(base)) return base;
  return null;
}
