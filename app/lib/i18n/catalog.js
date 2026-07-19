"use client";

// Генериране и кеширане на статичните каталози за не-bg езици. Взима българския
// каталог (source of truth), превежда стойностите през /api/i18n/translate-batch
// (сървърът кешира в D1) и регистрира резултата в i18next. Резултатът се кешира и
// локално (localStorage) с версия, за да не се превежда при всяко зареждане.

import i18n from "./config.js";
import bg from "../../locales/bg.json";
import { DEFAULT_LOCALE } from "./locales.js";

const CHUNK = 60;

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}
function unflatten(flat) {
  const root = {};
  for (const [key, val] of Object.entries(flat)) {
    const parts = key.split(".");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== "object" || node[parts[i]] == null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = val;
  }
  return root;
}
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const FLAT_BG = flatten(bg);

// Ръчни преводи, които машинният превод бърка (напр. „Изход" → „Exodus" вместо
// „Sign off"). Прилагат се СЛЕД генерирането. Ключът е плоският i18n ключ.
const OVERRIDES = {
  en: { "menu.logout": "Sign off", "footer.logout": "Sign off" },
  de: { "menu.logout": "Abmelden", "footer.logout": "Abmelden" },
};
// Версията на каталога зависи и от override-ите (при промяна → нов кеш).
const CATALOG_VERSION = hash(JSON.stringify(FLAT_BG) + JSON.stringify(OVERRIDES));

function lsGet(lang) {
  try {
    const raw = window.localStorage.getItem("evroproekti_cat_" + lang);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.v === CATALOG_VERSION ? parsed.data : null;
  } catch { return null; }
}
function lsSet(lang, data) {
  try { window.localStorage.setItem("evroproekti_cat_" + lang, JSON.stringify({ v: CATALOG_VERSION, data })); } catch { /* пренебрегваме */ }
}

const inflight = new Map();

async function generate(lang) {
  const keys = Object.keys(FLAT_BG);
  const flatOut = {};
  for (let i = 0; i < keys.length; i += CHUNK) {
    const part = keys.slice(i, i + CHUNK);
    const res = await fetch("/api/i18n/translate-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        sourceLanguage: DEFAULT_LOCALE,
        targetLanguage: lang,
        items: part.map((k) => ({ key: k, text: FLAT_BG[k] })),
      }),
    });
    if (!res.ok) throw new Error("catalog_http_" + res.status);
    const data = await res.json();
    for (const tr of data.translations || []) flatOut[tr.key] = tr.translatedText;
  }
  // липсващите остават на български (fallback)
  for (const k of keys) if (flatOut[k] == null) flatOut[k] = FLAT_BG[k];
  // Ръчни override-и (машинният превод греши на някои термини).
  const ov = OVERRIDES[lang];
  if (ov) for (const [k, v] of Object.entries(ov)) flatOut[k] = v;
  return unflatten(flatOut);
}

// Гарантира, че каталогът за езика е зареден в i18next. Връща true при готовност.
export async function ensureCatalog(lang) {
  if (!lang || lang === DEFAULT_LOCALE) return true;
  if (i18n.hasResourceBundle(lang, "translation")) return true;

  const cached = lsGet(lang);
  if (cached) { i18n.addResourceBundle(lang, "translation", cached, true, true); return true; }

  if (inflight.has(lang)) return inflight.get(lang);
  const p = (async () => {
    try {
      const catalog = await generate(lang);
      i18n.addResourceBundle(lang, "translation", catalog, true, true);
      lsSet(lang, catalog);
      return true;
    } catch {
      return false; // при грешка остава българският fallback
    } finally {
      inflight.delete(lang);
    }
  })();
  inflight.set(lang, p);
  return p;
}
