// Езикови URL-и с path-prefix (/en, /de). За тези пътища Worker-ът сервира
// българската статика, но пренаписва <head>: преведено заглавие/описание,
// self-referencing canonical, hreflang (bg/en/de/x-default), език, и инжектира
// началния език за клиента. Така /en/procedures е директно достъпен и индексируем
// на английски, без да canonical-ва към българската версия.

import { translateBatch } from "./translation.js";

const SITE = "https://euro-funds.eu";
const BRAND = "Euro Funds"; // за не-български locale (Европроекти остава за bg)
export const PREFIX_LOCALES = ["en", "de"]; // останалите езици са клиентски (?lang)

// App-shell пътища, обслужвани от статиката (не Worker-SSR, не asset файлове).
const SHELL_PATHS = new Set(["/", "/procedures", "/calendar", "/saved", "/changelog", "/about", "/how-ai-works", "/terms", "/privacy", "/cookies"]);

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function hreflangBlock(rest) {
  const loc = (l) => (l === "bg" ? SITE + rest : `${SITE}/${l}${rest === "/" ? "" : rest}`);
  let out = `<link rel="alternate" hreflang="bg" href="${loc("bg")}">`;
  for (const l of PREFIX_LOCALES) out += `<link rel="alternate" hreflang="${l}" href="${loc(l)}">`;
  out += `<link rel="alternate" hreflang="x-default" href="${loc("bg")}">`;
  return out;
}

async function tr(env, locale, texts) {
  try {
    const r = await translateBatch(env, { sourceLanguage: "bg", targetLanguage: locale, items: texts.map((t, i) => ({ key: "k" + i, text: t })) });
    const map = new Map((r.translations || []).map((x) => [x.key, x.translatedText]));
    return texts.map((t, i) => map.get("k" + i) || t);
  } catch { return texts; }
}

export async function handleLocalePage(request, env, url) {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(url.pathname);
  if (!m) return null;
  const locale = m[1];
  if (!PREFIX_LOCALES.includes(locale)) return null;
  const rest = m[2] || "/";
  if (!SHELL_PATHS.has(rest)) return null; // SSR-localized (detail/landing) — по-късно

  const asset = await env.ASSETS.fetch(new URL(rest, url.origin));
  if (!asset.ok) return null;
  let html = await asset.text();

  const bgTitle = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  const bgDesc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  // Заглавието е „X | Европроекти" — превеждаме само X, брандът остава.
  const titleMain = bgTitle.split("|")[0].trim();
  const [tMain, tDesc] = await tr(env, locale, [titleMain, bgDesc]);
  const newTitle = `${tMain} | ${BRAND}`;
  const locUrl = `${SITE}/${locale}${rest === "/" ? "" : rest}`;

  html = html
    .replace(/<html lang="[^"]*"/, `<html lang="${locale}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(newTitle)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(tDesc)}$2`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${locUrl}">${hreflangBlock(rest)}`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${locUrl}$2`)
    .replace(/(<meta property="og:locale" content=")[^"]*(")/, `$1${locale}$2`);

  // Инжектираме началния език точно преди </head> (изпълнява се последен → надделява
  // над no-flash скрипта), за да рендира клиентът правилния език без премигване.
  html = html.replace("</head>", `<script>window.__I18N_INITIAL=${JSON.stringify(locale)};try{document.documentElement.lang=${JSON.stringify(locale)};}catch(e){}</script></head>`);

  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
