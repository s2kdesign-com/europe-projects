// Worker SSR за procedure detail: /procedures/:slug връща пълна HTML страница
// (заглавие, метаданни, canonical, OG, JSON-LD, breadcrumbs, съдържание) четена
// от D1. Slug-ът е стабилният id на процедурата. Ако slug-ът е стар вариант, но
// сочи същата процедура → 301 към каноничния. Липсваща процедура → 404.

import { codeSlug } from "../app/lib/slug.js";

const SITE = "https://euro-funds.eu";
const OG_IMAGE = SITE + "/og-image.png";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; }

const STATUS_LABEL = { open: "Отворена", closing_soon: "Изтича скоро", upcoming: "Предстояща", closed: "Приключена" };

function canonicalSlug(p) { return codeSlug(p.id); }

export async function findProcedureBySlug(env, slug) {
  const s = String(slug || "").toLowerCase();
  if (!s) return null;
  // Точно съвпадение по id (най-честият случай).
  let p = await env.DB.prepare("SELECT * FROM projects WHERE id = ?1").bind(s).first();
  if (!p) {
    // Съвпадение по каноничен slug на id (ако id-то не е идеално чисто).
    const all = await env.DB.prepare("SELECT id FROM projects").all();
    const hit = (all.results || []).find((r) => codeSlug(r.id) === s);
    if (hit) p = await env.DB.prepare("SELECT * FROM projects WHERE id = ?1").bind(hit.id).first();
  }
  return p || null;
}

function jsonLd(p, url) {
  const g = {
    "@context": "https://schema.org",
    "@type": "MonetaryGrant",
    name: p.name,
    url,
    description: trunc(`${p.name}. Програма: ${p.program || "—"}. Статус: ${STATUS_LABEL[p.status] || p.status || "—"}.`, 300),
    identifier: p.id,
    inLanguage: "bg-BG",
  };
  if (p.program) g.funder = { "@type": "Organization", name: p.program };
  if (p.eligible) g.audience = { "@type": "Audience", audienceType: trunc(p.eligible, 120) };
  if (p.deadline_date) g.validThrough = p.deadline_date;
  if (p.link) g.sameAs = p.link;
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Процедури", item: SITE + "/procedures" },
      { "@type": "ListItem", position: 3, name: trunc(p.name, 80), item: url },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(g)}</script>\n<script type="application/ld+json">${JSON.stringify(crumbs)}</script>`;
}

function row(label, value) {
  if (!value) return "";
  return `<div class="row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

export function renderProcedureHTML(p, docs) {
  const slug = canonicalSlug(p);
  const url = `${SITE}/procedures/${slug}`;
  const statusLabel = STATUS_LABEL[p.status] || p.status || "";
  const title = trunc(`${p.name} — срок, бюджет и документи | Euro-Funding`, 65);
  const descParts = [p.name];
  if (p.program) descParts.push("Програма: " + p.program);
  if (p.deadline) descParts.push("Срок: " + p.deadline);
  if (p.budget) descParts.push("Бюджет: " + trunc(p.budget, 60));
  const description = trunc(descParts.join(". ") + ".", 165);

  const docsHtml = (docs && docs.length)
    ? `<section class="docs"><h2>Документи за кандидатстване</h2><ul>${docs.map((d) =>
        `<li>${d.source_url ? `<a href="${esc(d.source_url)}" rel="nofollow noopener" target="_blank">${esc(d.title || "Документ")}</a>` : esc(d.title || "Документ")}${d.doc_type ? ` <span class="muted">(${esc(d.doc_type)})</span>` : ""}</li>`
      ).join("")}</ul></section>`
    : "";

  const body = `
  <header class="site"><a class="brand" href="${SITE}/">Euro-Funding</a><a class="app" href="${SITE}/procedures">Всички процедури →</a></header>
  <nav class="crumbs" aria-label="breadcrumbs"><a href="${SITE}/">Начало</a> › <a href="${SITE}/procedures">Процедури</a> › <span aria-current="page">${esc(trunc(p.name, 60))}</span></nav>
  <main><article>
    <span class="badge ${esc(p.status || "")}">${esc(statusLabel)}</span>
    <h1>${esc(p.name)}</h1>
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
    ${p.link ? `<p class="source">Официален източник: <a href="${esc(p.link)}" rel="nofollow noopener" target="_blank">${esc(p.link)}</a></p>` : ""}
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
<link rel="alternate" hreflang="bg" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Euro-Funding">
<meta property="og:title" content="${esc(trunc(p.name, 90))}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="bg_BG">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(trunc(p.name, 90))}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${jsonLd(p, url)}
<style>${css}</style>`;

  return `<!doctype html><html lang="bg" dir="ltr"><head>${head}</head><body>${body}</body></html>`;
}

// ---------------------------------------------------------------------------
// Landing страници по статус: /procedures/status/:slug (curated, indexable)
// ---------------------------------------------------------------------------
const STATUS_SLUG_MAP = { open: "open", "closing-soon": "closing_soon", upcoming: "upcoming", closed: "closed" };
const STATUS_INTRO = {
  open: "Активни (отворени) процедури за европейско и национално финансиране в България, които приемат проектни предложения в момента.",
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
<script type="application/ld+json">${JSON.stringify(itemList)}</script>
<script type="application/ld+json">${JSON.stringify(crumbs)}</script>
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
  const { results } = await env.DB.prepare(
    "SELECT id, name, program, status, deadline FROM projects WHERE status = ?1 ORDER BY deadline_date"
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
  const { results } = await env.DB.prepare(
    "SELECT program, COUNT(*) AS n FROM projects WHERE program IS NOT NULL AND program != '' GROUP BY program ORDER BY n DESC"
  ).all();
  const items = (results || []).map((r) => ({
    href: `${SITE}/procedures/programs/${codeSlug(r.program)}`,
    name: r.program,
    meta: `${r.n} процедури`,
  }));
  return htmlResponse(renderGenericList({
    title: "Програми за европейско финансиране | Euro-Funding",
    description: "Оперативни програми и национални източници за финансиране в България — прегледайте активните процедури по програма.",
    canonicalPath: "/procedures/programs", h1: "Програми за финансиране",
    intro: "Изберете програма, за да видите активните и предстоящите процедури по нея.",
    crumbLabel: "Програми", items,
  }));
}

export async function handleProgramLanding(request, env, url) {
  const m = /^\/procedures\/programs\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const { results } = await env.DB.prepare("SELECT id, name, program, status, deadline FROM projects").all();
  const match = (results || []).filter((p) => codeSlug(p.program) === slug);
  if (!match.length) return htmlResponse(render404(), 404);
  const program = match[0].program;
  return htmlResponse(renderProcedureList({
    title: trunc(`${program} — активни процедури и финансиране | Euro-Funding`, 65),
    description: trunc(`Активни и предстоящи процедури по програма ${program} за България — статус, срокове и допустими кандидати.`, 165),
    canonicalPath: `/procedures/programs/${slug}`,
    h1: `${program} — процедури за финансиране`,
    intro: `Процедури за кандидатстване по програма ${program}.`,
    crumbLabel: trunc(program, 60), items: match,
  }));
}

const CANDIDATE = {
  business: { where: "category != 'youth' OR category IS NULL", h1: "Процедури за бизнес и предприятия", intro: "Процедури за европейско и национално финансиране, подходящи за фирми, МСП и предприемачи в България." },
  youth: { where: "category = 'youth'", h1: "Процедури за младежка заетост", intro: "Процедури с фокус върху младежката заетост и подкрепа за млади хора в България." },
};
export async function handleCandidateLanding(request, env, url) {
  const m = /^\/procedures\/candidates\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).toLowerCase();
  const c = CANDIDATE[slug];
  if (!c) return htmlResponse(render404(), 404);
  const { results } = await env.DB.prepare(`SELECT id, name, program, status, deadline FROM projects WHERE ${c.where} ORDER BY deadline_date`).all();
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
  const { results } = await env.DB.prepare(
    "SELECT id, name, program, status, deadline FROM projects WHERE deadline_date >= ?1 AND deadline_date <= ?2 AND status IN ('open','closing_soon') ORDER BY deadline_date"
  ).bind(iso(today), iso(to)).all();
  const h1 = `Процедури с краен срок до ${days} дни`;
  const intro = `Активни процедури за европейско финансиране, чийто краен срок изтича до ${days} дни. Планирайте кандидатстването навреме.`;
  return htmlResponse(renderProcedureList({
    title: trunc(`${h1} | Euro-Funding`, 65), description: trunc(intro, 165),
    canonicalPath: `/procedures/deadlines/${slug}`, h1, intro, crumbLabel: `Срок до ${days} дни`, items: results || [],
  }));
}

// Обвивки над renderListHTML: procedure-списък (връзки към detail) и общ списък.
function renderProcedureList(opts) {
  return renderListHTML({ ...opts, items: opts.items.map((p) => ({
    href: `${SITE}/procedures/${canonicalSlug(p)}`,
    name: p.name,
    meta: `${STATUS_LABEL[p.status] || ""}${p.program ? " · " + p.program : ""}${p.deadline ? " · срок: " + p.deadline : ""}`,
  })) });
}
function renderGenericList(opts) { return renderListHTML(opts); }

// Главен handler: връща Response за /procedures/:slug или null (не е такъв път).
export async function handleProcedurePage(request, env, url) {
  const m = /^\/procedures\/([^/]+)\/?$/.exec(url.pathname);
  if (!m) return null;
  const reqSlug = decodeURIComponent(m[1]).toLowerCase();
  const p = await findProcedureBySlug(env, reqSlug);
  if (!p) {
    return new Response(render404(reqSlug), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const canonical = canonicalSlug(p);
  if (canonical && canonical !== reqSlug) {
    return Response.redirect(`${SITE}/procedures/${canonical}`, 301);
  }
  const docs = await env.DB.prepare("SELECT title, doc_type, source_url FROM documents WHERE project_id = ?1 ORDER BY id").bind(p.id).all();
  const html = renderProcedureHTML(p, docs.results || []);
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
