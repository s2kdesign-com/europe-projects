// Worker SSR за procedure detail: /procedures/:slug връща пълна HTML страница
// (заглавие, метаданни, canonical, OG, JSON-LD, breadcrumbs, съдържание) четена
// от D1. Slug-ът е стабилният id на процедурата. Ако slug-ът е стар вариант, но
// сочи същата процедура → 301 към каноничния. Липсваща процедура → 404.

import { procedurePath, officialSource, safeJson } from "../app/lib/public-url.js";
import { ensurePublicRoutes, findPublicProcedure } from "./public-routes.js";
import { procedureMetadata, programMetadata } from './seo-metadata.js';
import { needsDeadlineReview, DEADLINE_REVIEW_LABEL, DEADLINE_REVIEW_NOTICE } from '../app/lib/deadline-review.js';

const SITE = "https://euro-funds.eu";
const OG_IMAGE = SITE + "/og-image.png";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }

// Съдържанието на процедурата е на езика на официалния източник (унгарски,
// немски, гръцки…), затова `<html lang>` НЕ бива да е винаги "bg" — това
// подвежда търсачките, екранните четци и автоматичния превод.
// Езикът идва от `projects.original_language`; при липса остава български,
// защото описателните полета около данните са на български.
const LANG_RE = /^[a-z]{2}(-[A-Za-z]{2})?$/;
export function pageLanguage(project) {
  const raw = String((project && project.original_language) || "").trim().toLowerCase();
  return LANG_RE.test(raw) ? raw : "bg";
}
/** og:locale очаква формат `xx_XX`. */
export function ogLocale(project) {
  const lang = pageLanguage(project);
  const locales = {bg:'bg_BG', en:'en_US', de:'de_DE', cs:'cs_CZ', el:'el_GR', sv:'sv_SE', da:'da_DK', et:'et_EE', ga:'ga_IE', sl:'sl_SI', hu:'hu_HU', pt:'pt_PT', es:'es_ES', fr:'fr_FR', it:'it_IT', nl:'nl_NL', pl:'pl_PL', ro:'ro_RO', sk:'sk_SK', fi:'fi_FI', hr:'hr_HR', lt:'lt_LT', lv:'lv_LV', mt:'mt_MT'};
  return lang.includes('-') ? lang.split('-')[0]+'_'+lang.split('-')[1].toUpperCase() : locales[lang] || 'bg_BG';
}

// BCP 47 таг за JSON-LD (`inLanguage`).
export function contentLanguageTag(project) {
  const lang = pageLanguage(project);
  return lang;
}

const STATUS_LABEL = { open: "Отворена", closing_soon: "Изтича скоро", upcoming: "Предстояща", closed: "Приключена" };

function canonicalSlug(p) { return p.public_slug || encodeURIComponent(p.id); }

export const findProcedureBySlug = findPublicProcedure;

function jsonLd(p, url) {
  const inLanguage = contentLanguageTag(p);
  const g = {
    "@context": "https://schema.org",
    "@type": "MonetaryGrant",
    name: p.name,
    url,
    description: trunc(`${p.name}. Програма: ${p.program || "—"}. Статус: ${needsDeadlineReview(p) ? DEADLINE_REVIEW_LABEL : STATUS_LABEL[p.status] || p.status || "—"}.`, 300),
    identifier: p.id,

  };
  if (p.managing_authority) g.funder = { "@type": "Organization", name: p.managing_authority };
  const page = { "@context": "https://schema.org", "@type": "WebPage", "@id": url, url, name: p.name, inLanguage, mainEntity: {"@id": url+"#grant"} };
  g["@id"] = url+"#grant";
  if (p.eligible) page.audience = { "@type": "Audience", audienceType: p.eligible };

  if (officialSource(p)) g.sameAs = officialSource(p);
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Процедури", item: SITE + "/procedures" },
      { "@type": "ListItem", position: 3, name: trunc(p.name, 80), item: url },
    ],
  };
  return `<script type="application/ld+json">${safeJson(g)}</script><script type="application/ld+json">${safeJson(page)}</script>\n<script type="application/ld+json">${safeJson(crumbs)}</script>`;
}

function row(label, value) {
  if (!value) return "";
  return `<div class="row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

export function renderProcedureHTML(p, docs, related = [], metadata = procedureMetadata(p)) {
  const slug = canonicalSlug(p);
  const url = `${SITE}/procedures/${slug}`;
  const statusLabel = needsDeadlineReview(p) ? DEADLINE_REVIEW_LABEL : STATUS_LABEL[p.status] || p.status || "";
  const { title, description } = metadata;

  const docsHtml = (docs && docs.length)
    ? `<section class="docs"><h2>Документи за кандидатстване</h2><ul>${docs.map((d) =>
        `<li>${d.source_url ? `<a href="${esc(d.source_url)}" rel="nofollow noopener" target="_blank">${esc(d.title || "Документ")}</a>` : esc(d.title || "Документ")}${d.doc_type ? ` <span class="muted">(${esc(d.doc_type)})</span>` : ""}</li>`
      ).join("")}</ul></section>`
    : "";

  const body = `
  <header class="site"><a class="brand" href="${SITE}/">Euro-Funding</a><a class="app" href="${SITE}/procedures">Всички процедури →</a></header>
  <nav class="crumbs" aria-label="breadcrumbs"><a href="${SITE}/">Начало</a> › <a href="${SITE}/procedures">Процедури</a> › <span aria-current="page">${esc(trunc(p.name, 60))}</span></nav>
  <main><article>
    <span class="badge ${needsDeadlineReview(p) ? 'closing_soon' : esc(p.status || "")}">${esc(statusLabel)}</span>
    <h1>${esc(p.name)}</h1>
    ${needsDeadlineReview(p) ? `<p role="note">${esc(DEADLINE_REVIEW_NOTICE)}</p>` : ''}
    <dl>
      ${row("Идентификатор", p.id)}
      ${row("Програма", p.program)}
      ${row("Статус", statusLabel)}
      ${row("Краен срок", p.deadline)}
      ${row("Бюджет", p.budget)}
      ${row("Допустими кандидати", p.eligible)}
      ${row("Година", p.year)}
      ${row("Последна актуализация", p.last_updated)}
    </dl>
    ${p.notes ? `<section><h2>Бележки</h2><p>${esc(p.notes)}</p></section>` : ""}
    ${docsHtml}
    ${related.length ? `<section><h2>Още по програмата</h2><ul>${related.map(r=>`<li><a href="${procedurePath(r)}">${esc(r.name)}</a></li>`).join('')}</ul></section>` : ''}
    ${officialSource(p) ? `<p class="source">Официален източник: <a href="${esc(officialSource(p))}" rel="noopener" target="_blank">${esc(officialSource(p))}</a></p>` : ""}
    <p class="ai">Информацията се структурира и анализира с помощта на изкуствен интелект.</p>
    <p class="disclaimer">AI анализът има информационен характер и не заменя официалната документация или професионалната експертна оценка.</p>
    <p><a class="cta" href="${SITE}/procedures">← Към всички процедури</a></p>
  </article></main>
  <footer class="site-foot">© Euro-Funding · <a href="${SITE}/terms">Условия</a> · <a href="${SITE}/privacy">Поверителност</a></footer>`;

  const css = `:root{--ink:#1e293b;--muted:#64748b;--line:#e2e8f0;--pri:#0b6ea3}
  *{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f5f7fa}
  a{color:var(--pri)}main,header.site,.crumbs,.site-foot{max-width:820px;margin-inline:auto;padding-inline:20px}
  header.site{display:flex;justify-content:space-between;align-items:center;padding-block:16px}
  .brand{font-weight:800;text-decoration:none;font-size:20px;color:var(--ink)}
  .crumbs{font-size:14px;color:var(--muted);padding-block:8px}
  article{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;margin-block:16px}
  h1{font-size:26px;margin:8px 0 16px;letter-spacing:-.02em}h2{font-size:18px;margin:20px 0 8px}
  .badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:#e0f2fe;color:#075985}
  .badge.closed{background:#f1f5f9;color:#475569}.badge.closing_soon{background:#fef3c7;color:#92400e}.badge.upcoming{background:#ede9fe;color:#5b21b6}
  dl{margin:0}.row{display:grid;grid-template-columns:200px 1fr;gap:8px;padding:8px 0;border-top:1px solid var(--line)}
  dt{color:var(--muted);font-weight:600}dd{margin:0}
  .muted{color:var(--muted)}.source{font-size:14px;word-break:break-word}
  .ai{font-size:13px;color:var(--muted);margin-top:20px}.disclaimer{font-size:12px;color:var(--muted)}
  .cta{font-weight:700;text-decoration:none}.site-foot{font-size:13px;color:var(--muted);padding-block:24px}
  @media(max-width:560px){.row{grid-template-columns:1fr}}`;

  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow">
<link rel="alternate" hreflang="${pageLanguage(p)}" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Euro-Funding">
<meta property="og:title" content="${esc(trunc(p.name, 90))}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="${ogLocale(p)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(trunc(p.name, 90))}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${jsonLd(p, url)}
<style>${css}</style>`;

  // Езикът следва съдържанието на процедурата, а не езика на интерфейса.
  return `<!doctype html><html lang="${pageLanguage(p)}" dir="ltr"><head>${head}</head><body>${body}</body></html>`;
}

// ---------------------------------------------------------------------------
// Landing страници по статус: /procedures/status/:slug (curated, indexable)
// ---------------------------------------------------------------------------
const STATUS_SLUG_MAP = { open: "open", "closing-soon": "closing_soon", upcoming: "upcoming", closed: "closed" };
const STATUS_INTRO = {
  open: "Активни (отворени) процедури за европейско и национално финансиране в Европейския съюз, които приемат проектни предложения в момента.",
  closing_soon: "Процедури, чийто краен срок наближава. Проверете условията и документите навреме.",
  upcoming: "Предстоящи процедури, които предстои да отворят прием на проектни предложения.",
  closed: "Приключени процедури — архив с оригиналните срокове и условия за справка.",
};

function renderListHTML({ title, description, canonicalPath, h1, intro, crumbLabel, items }) {
  const url = `${SITE}${canonicalPath}`;
  const listHtml = items.length
    ? `<ul class="plist">${items.map((p) =>
        `<li><a href="${esc(p.href)}">${esc(p.name)}</a>${p.meta ? `<span class="meta">${esc(p.meta)}</span>` : ""}</li>`
      ).join("")}</ul>`
    : `<p>Няма процедури в тази категория в момента.</p>`;

  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList", name: h1, url,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((p, i) => ({
      "@type": "ListItem", position: i + 1, url: p.href, name: trunc(p.name, 100),
    })),
  };
  const crumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Процедури", item: SITE + "/procedures" },
      { "@type": "ListItem", position: 3, name: crumbLabel, item: url },
    ],
  };
  const css = `:root{--ink:#1e293b;--muted:#64748b;--line:#e2e8f0;--pri:#0b6ea3}
  *{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#f5f7fa}
  a{color:var(--pri)}main,header.site,.crumbs,.site-foot{max-width:820px;margin-inline:auto;padding-inline:20px}
  header.site{display:flex;justify-content:space-between;align-items:center;padding-block:16px}
  .brand{font-weight:800;text-decoration:none;font-size:20px;color:var(--ink)}
  .crumbs{font-size:14px;color:var(--muted);padding-block:8px}
  h1{font-size:26px;margin:16px 0 8px;letter-spacing:-.02em}.intro{color:var(--muted);margin:0 0 16px}
  .plist{list-style:none;margin:0;padding:0}.plist li{padding:14px 0;border-top:1px solid var(--line)}
  .plist a{font-weight:700;text-decoration:none}.plist .meta{display:block;font-size:13px;color:var(--muted);margin-top:2px}
  .site-foot{font-size:13px;color:var(--muted);padding-block:24px}`;
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}"><meta name="robots" content="index,follow">
<link rel="alternate" hreflang="bg" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Euro-Funding">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${OG_IMAGE}"><meta property="og:locale" content="bg_BG">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${safeJson(itemList)}</script>
<script type="application/ld+json">${safeJson(crumbs)}</script>
<style>${css}</style>`;
  const body = `<header class="site"><a class="brand" href="${SITE}/">Euro-Funding</a><a href="${SITE}/procedures">Всички процедури →</a></header>
  <nav class="crumbs" aria-label="breadcrumbs"><a href="${SITE}/">Начало</a> › <a href="${SITE}/procedures">Процедури</a> › <span aria-current="page">${esc(crumbLabel)}</span></nav>
  <main><h1>${esc(h1)}</h1><p class="intro">${esc(intro)}</p>${listHtml}
  <p style="font-size:13px;color:#64748b;margin-top:24px">Информацията се структурира и анализира с помощта на изкуствен интелект и не заменя официалната документация.</p></main>
  <footer class="site-foot">© Euro-Funding · <a href="${SITE}/terms">Условия</a> · <a href="${SITE}/privacy">Поверителност</a></footer>`;
  return `<!doctype html><html lang="bg" dir="ltr"><head>${head}</head><body>${body}</body></html>`;
}

export async function handleStatusLanding(request, env, url) {
  const m = /^\/procedures\/status\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const status = STATUS_SLUG_MAP[slug];
  if (!status) return new Response(render404(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  await ensurePublicRoutes(env);
  const { results } = await env.DB.prepare(
    "SELECT id, name, program, status, deadline, deadline_date, country_code, source_id, public_slug, program_slug FROM public_projects WHERE status = ?1 ORDER BY deadline_date"
  ).bind(status).all();
  const label = STATUS_LABEL[status] || status;
  const html = renderProcedureList({
    title: trunc(`${label} процедури за европейско финансиране | Euro-Funding`, 65),
    description: trunc(STATUS_INTRO[status], 165),
    canonicalPath: `/procedures/status/${slug}`,
    h1: `${label} процедури за европейско финансиране`,
    intro: STATUS_INTRO[status],
    crumbLabel: label,
    items: results || [],
  });
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600" } });
}

// ---------------------------------------------------------------------------
// Landing по програма / кандидат / срок (curated, indexable)
// ---------------------------------------------------------------------------
function htmlResponse(html, status = 200, maxAge = 600) {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${maxAge}` } });
}

// Програми: индекс със списък програми (връзки към landing на всяка програма).
export async function handleProgramsIndex(request, env, url) {
  if (url.pathname !== "/procedures/programs" && url.pathname !== "/procedures/programs/") return null;
  await ensurePublicRoutes(env);
  const { results } = await env.DB.prepare(
    "SELECT program, program_slug, country_code, COUNT(*) AS n FROM public_projects WHERE program IS NOT NULL AND program != '' GROUP BY program_slug ORDER BY n DESC"
  ).all();
  const items = (results || []).map((r) => ({
    href: `${SITE}/procedures/programs/${r.program_slug}`,
    name: `${r.program} (${r.country_code})`,
    meta: `${r.n} процедури`,
  }));
  return htmlResponse(renderGenericList({
    title: "Програми за европейско финансиране | Euro-Funding",
    description: "Оперативни програми и национални източници за финансиране в Европейския съюз — прегледайте активните процедури по програма.",
    canonicalPath: "/procedures/programs", h1: "Програми за финансиране",
    intro: "Изберете програма, за да видите активните и предстоящите процедури по нея.",
    crumbLabel: "Програми", items,
  }));
}

export async function handleProgramLanding(request, env, url) {
  const m = /^\/procedures\/programs\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  await ensurePublicRoutes(env);
  const { results } = await env.DB.prepare("SELECT id, name, program, status, deadline, deadline_date, country_code, source_id, public_slug, program_slug FROM public_projects").all();
  const match = (results || []).filter((p) => p.program_slug === slug);
  if (!match.length) return htmlResponse(render404(), 404);
  const program = match[0].program;
  const programs = [...new Map((results || []).map(p => [p.program_slug, p])).values()];
  return htmlResponse(renderProcedureList({
    ...programMetadata(match[0], programs),
    canonicalPath: `/procedures/programs/${slug}`,
    h1: `${program} — процедури за финансиране`,
    intro: `Процедури за кандидатстване по програма ${program}.`,
    crumbLabel: trunc(program, 60), items: match,
  }));
}

const CANDIDATE = {
  business: { where: "category != 'youth' OR category IS NULL", h1: "Процедури за бизнес и предприятия", intro: "Процедури за европейско и национално финансиране, подходящи за фирми, МСП и предприемачи в Европейския съюз." },
  youth: { where: "category = 'youth'", h1: "Процедури за младежка заетост", intro: "Процедури с фокус върху младежката заетост и подкрепа за млади хора в Европейския съюз." },
};
export async function handleCandidateLanding(request, env, url) {
  const m = /^\/procedures\/candidates\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const c = CANDIDATE[slug];
  if (!c) return htmlResponse(render404(), 404);
  await ensurePublicRoutes(env);
  const { results } = await env.DB.prepare(`SELECT id, name, program, status, deadline, deadline_date, country_code, source_id, public_slug, program_slug FROM public_projects WHERE ${c.where} ORDER BY deadline_date`).all();
  return htmlResponse(renderProcedureList({
    title: trunc(`${c.h1} | Euro-Funding`, 65), description: trunc(c.intro, 165),
    canonicalPath: `/procedures/candidates/${slug}`, h1: c.h1, intro: c.intro, crumbLabel: c.h1, items: results || [],
  }));
}

const DEADLINE = { "next-7-days": 7, "next-30-days": 30, "next-90-days": 90 };
export async function handleDeadlineLanding(request, env, url) {
  const m = /^\/procedures\/deadlines\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const days = DEADLINE[slug];
  if (!days) return htmlResponse(render404(), 404);
  const today = new Date(); const to = new Date(today.getTime() + days * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  await ensurePublicRoutes(env);
  const { results } = await env.DB.prepare(
    "SELECT id, name, program, status, deadline, deadline_date, country_code, source_id, public_slug, program_slug FROM public_projects WHERE deadline_date >= ?1 AND deadline_date <= ?2 AND status IN ('open','closing_soon') ORDER BY deadline_date"
  ).bind(iso(today), iso(to)).all();
  const h1 = `Процедури с краен срок до ${days} дни`;
  const intro = `Активни процедури за европейско финансиране, чийто краен срок изтича до ${days} дни. Планирайте кандидатстването навреме.`;
  return htmlResponse(renderProcedureList({
    title: trunc(`${h1} | Euro-Funding`, 65), description: trunc(intro, 165),
    canonicalPath: `/procedures/deadlines/${slug}`, h1, intro, crumbLabel: `Срок до ${days} дни`, items: results || [],
  }));
}

// Обвивки над renderListHTML: procedure-списък (връзки към detail) и общ списък.
export function renderProcedureList(opts) {
  return renderListHTML({ ...opts, items: opts.items.map((p) => ({
    href: `${SITE}/procedures/${canonicalSlug(p)}`,
    name: p.name,
    meta: `${needsDeadlineReview(p) ? DEADLINE_REVIEW_LABEL : STATUS_LABEL[p.status] || ""}${p.program ? " · " + p.program : ""}${p.deadline ? " · срок: " + p.deadline : ""}`,
  })) });
}
function renderGenericList(opts) { return renderListHTML(opts); }

export async function handleCountryLanding(request, env, url) {
  const m = /^\/procedures\/countries\/([a-z]{2})(?:\/page\/([1-9]\d*))?$/.exec(url.pathname);
  if (!m) return null;
  const page = Number(m[2] || 1), country = m[1].toUpperCase();
  await ensurePublicRoutes(env);
  const {n} = await env.DB.prepare('SELECT COUNT(*) AS n FROM public_projects WHERE country_code=?1').bind(country).first();
  if (!n || page > Math.ceil(n/100)) return htmlResponse(render404(),404);
  const path = `/procedures/countries/${m[1]}`;
  if (m[2] === '1') return Response.redirect(SITE+path,301);
  const {results} = await env.DB.prepare('SELECT id, public_slug, name, program, status, deadline, deadline_date FROM public_projects WHERE country_code=?1 ORDER BY id LIMIT 100 OFFSET ?2').bind(country,(page-1)*100).all();
  let html = renderProcedureList({title:`${country} — процедури, страница ${page} | Euro-Funding`,description:`Финансиране в ${country}: ${n} процедури. Страница ${page}, статус, срокове и официални източници.`,canonicalPath:url.pathname,h1:`Процедури: ${country}`,intro:`${n} процедури · страница ${page}`,crumbLabel:country,items:results});
  const pages = Array.from({length:Math.ceil(n/100)},(_,i)=>`<a href="${path}${i ? '/page/'+(i+1) : ''}"${page===i+1?' aria-current="page"':''}>${i+1}</a>`).join(' · ');
  html = html.replace('</main>',`<nav aria-label="Страници">${pages}</nav></main>`);
  return htmlResponse(html);
}

// Главен handler: връща Response за /procedures/:slug или null (не е такъв път).
export async function handleProcedurePage(request, env, url) {
  const m = /^\/procedures\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const reqSlug = decodeURIComponent(m[1]);
  const p = await findProcedureBySlug(env, reqSlug);
  if (!p) {
    return new Response(render404(reqSlug), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const canonical = canonicalSlug(p);
  if (canonical && url.pathname !== `/procedures/${canonical}`) {
    return Response.redirect(`${SITE}/procedures/${canonical}`, 301);
  }
  const docs = await env.DB.prepare("SELECT title, doc_type, source_url FROM documents WHERE project_id = ?1 ORDER BY id").bind(p.id).all();
  const related = p.program_slug ? await env.DB.prepare('SELECT id, public_slug, name FROM public_projects WHERE program_slug=?1 AND id!=?2 ORDER BY last_updated DESC LIMIT 4').bind(p.program_slug,p.id).all() : {results:[]};
  // Concision preserves at least the first 40 characters. Matching prefixes can
  // collide; fetching that small peer group avoids scanning every page's data.
  const peers = await env.DB.prepare('SELECT id, name, program, country_code, source_id FROM public_projects WHERE substr(trim(name),1,40)=substr(trim(?1),1,40)').bind(p.name).all();
  const html = renderProcedureHTML(p, docs.results || [], related.results, procedureMetadata(p, peers.results || [p]));
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

function render404() {
  const body = `<main style="max-width:640px;margin:60px auto;padding:0 20px;font:16px/1.6 system-ui,sans-serif;color:#1e293b">
    <h1 style="font-size:26px">Процедурата не е намерена</h1>
    <p>Тази процедура не съществува или адресът е сгрешен.</p>
    <p><a href="${SITE}/procedures">← Всички процедури</a> · <a href="${SITE}/">Обзор</a></p>
  </main>`;
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Процедурата не е намерена | Euro-Funding</title><meta name="robots" content="noindex,follow"></head><body>${body}</body></html>`;
}
