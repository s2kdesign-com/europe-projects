// Централен регистър на държавите (frontend огледало на D1 `countries`).
// Държи статичните метаданни, за да рендираме селектори без API заявка. Реалният
// live статус (enabled/coverage/брой активни източници) идва от D1 при нужда.

export const DEFAULT_COUNTRY = "BG";
export const FALLBACK_FLAG = "/flags/_placeholder.svg";

// priority: 0 = BG reference; 1.. по rollout приоритета.
export const COUNTRIES = [
  { code: "BG", slug: "bulgaria", nameBg: "България", native: "България", english: "Bulgaria", lang: "bg", currency: "BGN", flag: "/flags/bg.svg", enabled: true, priority: 0 },
  { code: "RO", slug: "romania", nameBg: "Румъния", native: "România", english: "Romania", lang: "ro", currency: "RON", flag: "/flags/ro.svg", enabled: false, priority: 1 },
  { code: "GR", slug: "greece", nameBg: "Гърция", native: "Ελλάδα", english: "Greece", lang: "el", currency: "EUR", flag: "/flags/gr.svg", enabled: false, priority: 2 },
  { code: "PL", slug: "poland", nameBg: "Полша", native: "Polska", english: "Poland", lang: "pl", currency: "PLN", flag: "/flags/pl.svg", enabled: false, priority: 3 },
  { code: "HR", slug: "croatia", nameBg: "Хърватия", native: "Hrvatska", english: "Croatia", lang: "hr", currency: "EUR", flag: "/flags/hr.svg", enabled: false, priority: 4 },
  { code: "CZ", slug: "czechia", nameBg: "Чехия", native: "Česko", english: "Czechia", lang: "cs", currency: "CZK", flag: "/flags/cz.svg", enabled: false, priority: 5 },
  { code: "PT", slug: "portugal", nameBg: "Португалия", native: "Portugal", english: "Portugal", lang: "pt", currency: "EUR", flag: "/flags/pt.svg", enabled: false, priority: 6 },
  { code: "SK", slug: "slovakia", nameBg: "Словакия", native: "Slovensko", english: "Slovakia", lang: "sk", currency: "EUR", flag: "/flags/sk.svg", enabled: false, priority: 7 },
  { code: "HU", slug: "hungary", nameBg: "Унгария", native: "Magyarország", english: "Hungary", lang: "hu", currency: "HUF", flag: "/flags/hu.svg", enabled: false, priority: 8 },
  { code: "SI", slug: "slovenia", nameBg: "Словения", native: "Slovenija", english: "Slovenia", lang: "sl", currency: "EUR", flag: "/flags/si.svg", enabled: false, priority: 9 },
  { code: "IT", slug: "italy", nameBg: "Италия", native: "Italia", english: "Italy", lang: "it", currency: "EUR", flag: "/flags/it.svg", enabled: false, priority: 10 },
  { code: "ES", slug: "spain", nameBg: "Испания", native: "España", english: "Spain", lang: "es", currency: "EUR", flag: "/flags/es.svg", enabled: false, priority: 11 },
  { code: "DE", slug: "germany", nameBg: "Германия", native: "Deutschland", english: "Germany", lang: "de", currency: "EUR", flag: "/flags/de.svg", enabled: false, priority: 12 },
  { code: "FR", slug: "france", nameBg: "Франция", native: "France", english: "France", lang: "fr", currency: "EUR", flag: "/flags/fr.svg", enabled: false, priority: 13 },
  { code: "LT", slug: "lithuania", nameBg: "Литва", native: "Lietuva", english: "Lithuania", lang: "lt", currency: "EUR", flag: "/flags/lt.svg", enabled: false, priority: 14 },
  { code: "LV", slug: "latvia", nameBg: "Латвия", native: "Latvija", english: "Latvia", lang: "lv", currency: "EUR", flag: "/flags/lv.svg", enabled: false, priority: 15 },
  { code: "EE", slug: "estonia", nameBg: "Естония", native: "Eesti", english: "Estonia", lang: "et", currency: "EUR", flag: "/flags/ee.svg", enabled: false, priority: 16 },
  { code: "NL", slug: "netherlands", nameBg: "Нидерландия", native: "Nederland", english: "Netherlands", lang: "nl", currency: "EUR", flag: "/flags/nl.svg", enabled: false, priority: 17 },
  { code: "BE", slug: "belgium", nameBg: "Белгия", native: "België", english: "Belgium", lang: "nl", currency: "EUR", flag: "/flags/be.svg", enabled: false, priority: 18 },
  { code: "SE", slug: "sweden", nameBg: "Швеция", native: "Sverige", english: "Sweden", lang: "sv", currency: "SEK", flag: "/flags/se.svg", enabled: false, priority: 19 },
  { code: "FI", slug: "finland", nameBg: "Финландия", native: "Suomi", english: "Finland", lang: "fi", currency: "EUR", flag: "/flags/fi.svg", enabled: false, priority: 20 },
  { code: "AT", slug: "austria", nameBg: "Австрия", native: "Österreich", english: "Austria", lang: "de", currency: "EUR", flag: "/flags/at.svg", enabled: false, priority: 21 },
  { code: "IE", slug: "ireland", nameBg: "Ирландия", native: "Éire", english: "Ireland", lang: "en", currency: "EUR", flag: "/flags/ie.svg", enabled: false, priority: 22 },
  { code: "DK", slug: "denmark", nameBg: "Дания", native: "Danmark", english: "Denmark", lang: "da", currency: "DKK", flag: "/flags/dk.svg", enabled: false, priority: 23 },
  { code: "CY", slug: "cyprus", nameBg: "Кипър", native: "Κύπρος", english: "Cyprus", lang: "el", currency: "EUR", flag: "/flags/cy.svg", enabled: false, priority: 24 },
  { code: "MT", slug: "malta", nameBg: "Малта", native: "Malta", english: "Malta", lang: "mt", currency: "EUR", flag: "/flags/mt.svg", enabled: false, priority: 25 },
  { code: "LU", slug: "luxembourg", nameBg: "Люксембург", native: "Lëtzebuerg", english: "Luxembourg", lang: "fr", currency: "EUR", flag: "/flags/lu.svg", enabled: false, priority: 26 },
];

export const COUNTRY_CODES = COUNTRIES.map((c) => c.code);
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const BY_SLUG = new Map(COUNTRIES.map((c) => [c.slug, c]));

export function isValidCountry(code) {
  return typeof code === "string" && BY_CODE.has(code.toUpperCase());
}
export function normalizeCountry(code) {
  if (!code) return null;
  const up = String(code).toUpperCase();
  return BY_CODE.has(up) ? up : null;
}
export function getCountry(code) {
  return BY_CODE.get(normalizeCountry(code) || DEFAULT_COUNTRY) || BY_CODE.get(DEFAULT_COUNTRY);
}
export function getCountryBySlug(slug) {
  return slug ? BY_SLUG.get(String(slug).toLowerCase()) || null : null;
}
// Локализирано име според UI езика (bg → nameBg, иначе english; native винаги наличен).
export function countryLabel(country, uiLang) {
  if (!country) return "";
  return uiLang === "bg" ? country.nameBg : country.english;
}
