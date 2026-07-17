"use client";

// Форматиране според locale чрез Intl. НЕ превежда съдържание и НЕ преобразува
// валута — само формата (разделители, ред на дата, символ) се сменя по езика.
// Стойността остава същата (напр. 17 млн. евро → €17M, не се конвертира).

import i18n from "./config.js";
import { DEFAULT_LOCALE } from "./locales.js";

function loc(locale) {
  return locale || (i18n && i18n.language) || DEFAULT_LOCALE;
}

function parseDate(input) {
  if (input instanceof Date) return input;
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(input, { locale, ...opts } = {}) {
  const d = parseDate(input);
  if (!d) return "";
  const options = Object.keys(opts).length ? opts : { day: "numeric", month: "long", year: "numeric" };
  try { return new Intl.DateTimeFormat(loc(locale), options).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}

export function formatNumber(value, { locale, ...opts } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  try { return new Intl.NumberFormat(loc(locale), opts).format(n); }
  catch { return String(n); }
}

// Форматира валута БЕЗ конверсия (само символ/разделители по locale).
export function formatCurrency(value, { locale, currency = "EUR", ...opts } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  try { return new Intl.NumberFormat(loc(locale), { style: "currency", currency, maximumFractionDigits: 0, ...opts }).format(n); }
  catch { return String(n); }
}

const DIVISIONS = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Infinity, unit: "year" },
];

// Относително време спрямо now (напр. „остават 5 дни" / „5 days remaining").
export function formatRelative(input, { locale, now = new Date() } = {}) {
  const d = parseDate(input);
  if (!d) return "";
  let duration = (d.getTime() - now.getTime()) / 1000;
  try {
    const rtf = new Intl.RelativeTimeFormat(loc(locale), { numeric: "auto" });
    for (const div of DIVISIONS) {
      if (Math.abs(duration) < div.amount) return rtf.format(Math.round(duration), div.unit);
      duration /= div.amount;
    }
  } catch { /* fallback по-долу */ }
  return "";
}

export function formatList(items, { locale, ...opts } = {}) {
  const arr = (items || []).map(String).filter(Boolean);
  try { return new Intl.ListFormat(loc(locale), { style: "long", type: "conjunction", ...opts }).format(arr); }
  catch { return arr.join(", "); }
}
