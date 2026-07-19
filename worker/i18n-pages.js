// Езикови URL-и с path-prefix (/bg, /en, /de) + локализирани социални мета тагове.
// Социалните crawlers (Facebook/Twitter/LinkedIn) четат СЪРВЪРНИЯ HTML (без JS),
// затова og:/twitter: таговете трябва да са на езика на споделения URL:
//   /            → английски OG (по избор на собственика — международно споделяне)
//   /bg, /bg/... → български OG
//   /en, /en/... → английски OG (пълна английска страница)
//   /de, /de/... → немски OG
// За /en, /de се превежда и <title>/<html lang> (пълна страница). За /bg е identity
// (изходникът е bg). За бара / се пренаписват САМО социалните тагове (клиентът
// продължава да авто-разпознава езика).

import { translateBatch } from "./translation.js";

const SITE = "https://euro-funds.eu";
const BRAND_BG = "Европроекти";
const BRAND_INTL = "Euro Funds";
export const PREFIX_LOCALES = ["bg", "en", "de"];
const OG_LOCALE = { bg: "bg_BG", en: "en_US", de: "de_DE" };
const OG_IMAGE_ALT_BG = "Европроекти — Европейско финансиране за 27-те държави от ЕС";

// Хардкоднати английски OG за бара / (без runtime превод на най-натоварената страница).
const ROOT_EN = {
  title: "Euro Funds — European funding for the 27 EU countries",
  desc: "Daily updated overview of open and upcoming European funding calls across the 27 EU countries — deadlines, budgets and eligible applicants. Data from official national sources, structured with AI.",
  alt: "Euro Funds — European funding for the 27 EU countries",
};

const SHELL_PATHS = new Set(["/", "/procedures", "/calendar", "/saved", "/changelog", "/about", "/how-ai-works", "/terms", "/privacy", "/cookies", "/sources"]);

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function hreflangBlock(rest) {
  const loc = (l) => (l === "bg" ? `${SITE}/bg${rest === "/" ? "" : rest}` : `${SITE}/${l}${rest === "/" ? "" : rest}`);
  let out = `<link rel="alternate" hreflang="bg" href="${loc("bg")}">`;
  out += `<link rel="alternate" hreflang="en" href="${loc("en")}">`;
  out += `<link rel="alternate" hreflang="de" href="${loc("de")}">`;
  out += `<link rel="alternate" hreflang="x-default" href="${SITE}${rest}">`;
  return out;
}

async function tr(env, locale, texts) {
  try {
    const r = await translateBatch(env, { sourceLanguage: "bg", targetLanguage: locale, items: texts.map((t, i) => ({ key: "k" + i, text: t })) });
    const map = new Map((r.translations || []).map((x) => [x.key, x.translatedText]));
    return texts.map((t, i) => map.get("k" + i) || t);
  } catch { return texts; }
}

// Пренаписва ПЪЛНИЯ набор социални + head тагове за даден език. (export за тестове)
export function applyHead(html, { title, desc, alt, locale, brand, canonicalUrl, rest, fullPage }) {
  const ogLoc = OG_LOCALE[locale] || "bg_BG";
  const titleFull = `${title} | ${brand}`;
  let out = html;
  // og:/twitter: — винаги (за социалните crawlers).
  out = out
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(titleFull)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:site_name" content=")[^"]*(")/, `$1${esc(brand)}$2`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${esc(alt)}$2`)
    .replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1${ogLoc}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(titleFull)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);
  if (canonicalUrl) {
    out = out
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonicalUrl}$2`)
      .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonicalUrl}">${hreflangBlock(rest)}`);
  }
  // Пълна страница (prefix локали) — сменяме и видимите head тагове + клиентския език.
  if (fullPage) {
    out = out
      .replace(/<html lang="[^"]*"/, `<html lang="${locale}"`)
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(titleFull)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
      .replace("</head>", `<script>window.__I18N_INITIAL=${JSON.stringify(locale)};try{document.documentElement.lang=${JSON.stringify(locale)};}catch(e){}</script></head>`);
  }
  return out;
}

// /bg, /en, /de (+ поддпътища от app-shell-а) → пълна локализирана страница.
export async function handleLocalePage(request, env, url) {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(url.pathname);
  if (!m) return null;
  const locale = m[1];
  if (!PREFIX_LOCALES.includes(locale)) return null;
  const rest = m[2] || "/";
  if (!SHELL_PATHS.has(rest)) return null; // SSR-localized детайли — по-късно

  const asset = await env.ASSETS.fetch(new URL(rest, url.origin));
  if (!asset.ok) return null;
  let html = await asset.text();

  const bgTitle = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  const bgDesc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  const titleMain = bgTitle.split("|")[0].trim();
  const locUrl = `${SITE}/${locale}${rest === "/" ? "" : rest}`;

  let title = titleMain, desc = bgDesc, alt = OG_IMAGE_ALT_BG, brand = BRAND_BG;
  if (locale !== "bg") {
    [title, desc, alt] = await tr(env, locale, [titleMain, bgDesc, OG_IMAGE_ALT_BG]);
    brand = BRAND_INTL;
  }
  html = applyHead(html, { title, desc, alt, locale, brand, canonicalUrl: locUrl, rest, fullPage: true });
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

// Бара / (и app-shell пътищата без префикс) → английски социални OG тагове.
// Пренаписва САМО og:/twitter: (клиентът продължава да авто-разпознава езика).
export async function handleRootSocial(request, env, url) {
  if (request.method !== "GET") return null;
  const rest = url.pathname === "" ? "/" : url.pathname;
  if (!SHELL_PATHS.has(rest)) return null;

  const asset = await env.ASSETS.fetch(new URL(rest, url.origin));
  if (!asset.ok) return null;
  let html = await asset.text();
  // Само за homepage ползваме хардкоднатите английски низове; за другите shell
  // пътища превеждаме заглавието им (кешираме 5 мин).
  let title = ROOT_EN.title, desc = ROOT_EN.desc, alt = ROOT_EN.alt;
  if (rest !== "/") {
    const bgTitle = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    const bgDesc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
    [title, desc, alt] = await tr(env, "en", [bgTitle.split("|")[0].trim(), bgDesc, OG_IMAGE_ALT_BG]);
  }
  html = applyHead(html, { title, desc, alt, locale: "en", brand: BRAND_INTL, canonicalUrl: `${SITE}${rest}`, rest, fullPage: false });
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
