// Markdown content negotiation за AI агенти.
//
// Заявка с `Accept: text/markdown` към публична страница връща markdown версия на
// съдържанието, генерирана ДИРЕКТНО от D1 — а не конвертирана от HTML. Причината:
// сайтът е статичен Next.js export (SPA shell), който пълни данните с JavaScript,
// затова HTML→Markdown конвертор (вкл. вграденият в Cloudflare) би върнал почти
// празен документ. Тук агентът получава реалните процедури, срокове и бюджети.
//
// HTML остава по подразбиране за браузъри — те никога не пращат text/markdown.
// Виж https://llmstxt.org/ и
// https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/

import { procedurePath, officialSource } from "../../app/lib/public-url.js";
import { ensurePublicRoutes, findPublicProcedure } from "../public-routes.js";
import { agentLinkHeader } from "./discovery.js";
import { needsDeadlineReview, DEADLINE_REVIEW_NOTICE } from '../../app/lib/deadline-review.js';

const SITE = "https://euro-funds.eu";
const BRAND = "Euro-Funding";

const STATUS_LABEL = { open: "Отворена", closing_soon: "Изтича скоро", upcoming: "Предстояща", closed: "Приключена" };
const STATUS_SLUG = { open: "open", closing_soon: "closing-soon", upcoming: "upcoming", closed: "closed" };

// ---------------------------------------------------------------------------
// Content negotiation
// ---------------------------------------------------------------------------

/**
 * Разбор на Accept заглавката: връща true само ако клиентът ИЗРИЧНО е поискал
 * markdown с ненулево q. Браузърите пращат text/html,... и никога не съвпадат,
 * затова HTML остава подразбиране без риск от подмяна на нормалния изглед.
 * `*​/*` НЕ се брои за markdown — иначе curl/агент без предпочитание би получил md.
 */
export function wantsMarkdown(request) {
  const accept = request.headers && request.headers.get ? request.headers.get("Accept") : null;
  if (!accept) return false;
  let mdQ = -1;
  let htmlQ = -1;
  for (const raw of String(accept).split(",")) {
    const parts = raw.trim().split(";");
    const type = parts[0].trim().toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const p of parts.slice(1)) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
      if (m) { const v = Number(m[1]); if (Number.isFinite(v)) q = v; }
    }
    if (type === "text/markdown" || type === "text/x-markdown") mdQ = Math.max(mdQ, q);
    else if (type === "text/html" || type === "application/xhtml+xml") htmlQ = Math.max(htmlQ, q);
  }
  if (mdQ <= 0) return false;
  return mdQ >= htmlQ; // при равенство печели изричното markdown искане
}

/**
 * Оценка на токените (за x-markdown-tokens). Кирилицата се токенизира доста
 * по-плътно от латиницата, затова броим двата вида символи поотделно вместо
 * универсалното „символи / 4".
 */
export function estimateTokens(text) {
  const s = String(text || "");
  if (!s) return 0;
  let cyr = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if ((c >= 0x0400 && c <= 0x04ff) || (c >= 0x0500 && c <= 0x052f)) cyr++;
  }
  const other = s.length - cyr;
  return Math.max(1, Math.ceil(cyr / 2.2 + other / 4));
}

export function markdownResponse(markdown, { canonicalUrl, maxAge = 300, status = 200 } = {}) {
  const headers = {
    "content-type": "text/markdown; charset=utf-8",
    "cache-control": `public, max-age=${maxAge}`,
    "vary": "Accept",
    "x-markdown-tokens": String(estimateTokens(markdown)),
    "x-robots-tag": "index, follow",
  };
  // Агент, който чете markdown, трябва да открие API-то оттам — иначе
  // разчита на HTML вариант, който изобщо не е поискал.
  const links = [agentLinkHeader()];
  if (canonicalUrl) links.unshift(`<${canonicalUrl}>; rel="canonical"`);
  headers.link = links.join(", ");
  return new Response(markdown, { status, headers });
}

// ---------------------------------------------------------------------------
// Markdown помощни
// ---------------------------------------------------------------------------

const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const cell = (v) => clean(v).replace(/\|/g, "\\|") || "—";
const trunc = (v, n) => { const s = clean(v); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };

function frontmatter(fields) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === "") continue;
    lines.push(`${k}: ${JSON.stringify(String(v))}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function table(headers, rows) {
  if (!rows.length) return "_Няма записи._\n";
  const out = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const r of rows) out.push(`| ${r.map(cell).join(" | ")} |`);
  return out.join("\n") + "\n";
}

function agentFooter() {
  return [
    "",
    "---",
    "",
    "## За агенти",
    "",
    `- Машинно четим API: [\`/openapi.json\`](${SITE}/openapi.json) (OpenAPI 3.1)`,
    `- API каталог (RFC 9727): [\`/.well-known/api-catalog\`](${SITE}/.well-known/api-catalog)`,
    `- Документация: [\`/docs/api\`](${SITE}/docs/api)`,
    `- Здравен статус: [\`/api/health\`](${SITE}/api/health)`,
    `- Автентикация (OAuth 2.1 + PKCE): [\`/.well-known/oauth-authorization-server\`](${SITE}/.well-known/oauth-authorization-server)`,
    `- Всяка публична страница връща markdown при \`Accept: text/markdown\`.`,
    "",
    "Данните се структурират с изкуствен интелект от официални национални и европейски",
    "източници и **не заменят официалната документация** по процедурата. Винаги проверявайте",
    "оригиналния документ, посочен в „Официален източник“.",
    "",
  ].join("\n");
}

function head({ title, description, url, extra = {} }) {
  return frontmatter({
    title,
    description,
    url,
    site: BRAND,
    language: "bg",
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Заявки към D1
// ---------------------------------------------------------------------------

async function latestStats(env) {
  const last = await env.DB.prepare(
    "SELECT MAX(snapshot_date) AS d FROM country_daily_statistics WHERE publish_status='published'"
  ).first().catch(() => null);
  if (!last || !last.d) return { date: null, rows: [] };
  const { results } = await env.DB.prepare(
    `SELECT s.country_code, s.total_procedures, s.active_procedures, s.upcoming_procedures,
            s.published_budget_eur, s.budget_procedure_count, c.name_bg, c.english_name, c.slug
     FROM country_daily_statistics s JOIN countries c ON c.code = s.country_code
     WHERE s.snapshot_date = ?1 AND s.publish_status='published' ORDER BY s.total_procedures DESC`
  ).bind(last.d).all().catch(() => ({ results: [] }));
  return { date: last.d, rows: results || [] };
}

function procedureRow(p) {
  return [
    `[${trunc(p.name, 90)}](${SITE}${procedurePath(p)})`,
    STATUS_LABEL[p.status] || p.status,
    p.program,
    p.deadline,
    p.country_code,
  ];
}

// ---------------------------------------------------------------------------
// Страници
// ---------------------------------------------------------------------------

async function homeMarkdown(env) {
  const stats = await latestStats(env);
  const totals = stats.rows.reduce(
    (a, r) => ({
      total: a.total + (r.total_procedures || 0),
      active: a.active + (r.active_procedures || 0),
      upcoming: a.upcoming + (r.upcoming_procedures || 0),
    }),
    { total: 0, active: 0, upcoming: 0 }
  );
  const soon = await env.DB.prepare(
    `SELECT public_slug, program_slug, id, name, program, status, deadline, deadline_date, country_code FROM public_projects
     WHERE status IN ('open','closing_soon') AND deadline_date IS NOT NULL AND deadline_date >= date('now')
     ORDER BY deadline_date LIMIT 25`
  ).all().catch(() => ({ results: [] }));

  const out = [];
  out.push(head({
    title: `${BRAND} — европейско финансиране за 27-те държави от ЕС`,
    description: "Ежедневно обновяван преглед на отворени и предстоящи процедури за европейско финансиране в 27-те държави от ЕС — срокове, бюджети и допустими кандидати, от официални източници.",
    url: `${SITE}/`,
    extra: stats.date ? { data_snapshot: stats.date } : {},
  }));
  out.push(`# ${BRAND} — европейско финансиране за 27-те държави от ЕС\n`);
  out.push(
    "Платформа, която събира процедурите за европейско и национално финансиране от официалните",
    "национални източници на 27-те държави от ЕС, структурира ги с изкуствен интелект и ги показва",
    "с единни срокове, статуси, бюджети и допустими кандидати. Изходният език на съдържанието е",
    "български; интерфейсът се превежда на 25 езика.\n"
  );

  if (stats.date) {
    out.push("## Обхват на данните\n");
    out.push(`Последен публикуван snapshot: **${stats.date}**. Общо процедури: **${totals.total}**, ` +
      `от които активни: **${totals.active}**, предстоящи: **${totals.upcoming}**.\n`);
    out.push(table(
      ["Държава", "Общо", "Активни", "Предстоящи", "Публикуван бюджет (EUR)"],
      stats.rows.slice(0, 30).map((r) => [
        `${r.name_bg || r.english_name || r.country_code} (${r.country_code})`,
        r.total_procedures,
        r.active_procedures,
        r.upcoming_procedures,
        r.published_budget_eur ? Math.round(r.published_budget_eur).toLocaleString("bg-BG") : "няма структурирани данни",
      ])
    ));
  }

  out.push("\n## Процедури с най-близък краен срок\n");
  out.push(table(["Процедура", "Статус", "Програма", "Краен срок", "Държава"], (soon.results || []).map(procedureRow)));

  out.push("\n## Раздели\n");
  out.push([
    `- [Всички процедури](${SITE}/procedures) — филтри по статус, програма, срок и кандидат`,
    `- [Програми](${SITE}/procedures/programs) — процедури, групирани по оперативна програма`,
    `- [Отворени процедури](${SITE}/procedures/status/${STATUS_SLUG.open})`,
    `- [Изтичащи до 30 дни](${SITE}/procedures/deadlines/next-30-days)`,
    `- [За бизнес и предприятия](${SITE}/procedures/candidates/business)`,
    `- [Младежка заетост](${SITE}/procedures/candidates/youth)`,
    `- [Официални източници](${SITE}/sources)`,
    `- [За платформата и статистики](${SITE}/about)`,
    `- [Как работи изкуственият интелект](${SITE}/how-ai-works)`,
    `- [Промени по системата](${SITE}/changelog)`,
    "",
  ].join("\n"));

  out.push(agentFooter());
  return out.join("\n");
}

async function proceduresMarkdown(env, url, country) {
  const { results } = await env.DB.prepare(
    `SELECT public_slug, program_slug, id, name, program, status, deadline, deadline_date, country_code, budget, eligible
     FROM public_projects WHERE country_code = ?1 ORDER BY
       CASE status WHEN 'closing_soon' THEN 0 WHEN 'open' THEN 1 WHEN 'upcoming' THEN 2 ELSE 3 END,
       deadline_date`
  ).bind(country).all().catch(() => ({ results: [] }));
  const rows = results || [];
  const byStatus = (st) => rows.filter((r) => r.status === st);

  const out = [];
  out.push(head({
    title: `Процедури за европейско финансиране (${country}) | ${BRAND}`,
    description: `Пълен списък на процедурите за финансиране за държава ${country} — статус, програма, краен срок и допустими кандидати.`,
    url: `${SITE}/procedures?country=${country}`,
    extra: { country, count: String(rows.length) },
  }));
  out.push(`# Процедури за финансиране — ${country}\n`);
  out.push(`Общо ${rows.length} процедури. Данните са от официални национални източници и се обновяват автоматично.\n`);
  for (const [st, label] of [["closing_soon", "Изтича скоро"], ["open", "Отворени"], ["upcoming", "Предстоящи"], ["closed", "Приключени"]]) {
    const items = byStatus(st);
    if (!items.length) continue;
    out.push(`\n## ${label} (${items.length})\n`);
    out.push(table(["Процедура", "Статус", "Програма", "Краен срок", "Държава"], items.map(procedureRow)));
  }
  out.push(`\nДруга държава: \`${SITE}/procedures?country=XX\` (двубуквен код по ISO 3166-1 alpha-2).`);
  out.push(`JSON: \`${SITE}/api/projects?country=${country}\`\n`);
  out.push(agentFooter());
  return out.join("\n");
}

async function procedureDetailMarkdown(env, slug) {
  const p = await findPublicProcedure(env, String(slug || ""));
  if (!p) return null;

  const docs = await env.DB.prepare(
    "SELECT title, doc_type, content, source_url FROM documents WHERE project_id = ?1 ORDER BY id"
  ).bind(p.id).all().catch(() => ({ results: [] }));
  const canonical = `${SITE}${procedurePath(p)}`;

  const out = [];
  out.push(head({
    title: trunc(p.name, 110),
    description: trunc(`Процедура ${p.name}. Програма: ${p.program || "—"}. Статус: ${STATUS_LABEL[p.status] || p.status || "—"}. Краен срок: ${p.deadline || "—"}.`, 300),
    url: canonical,
    extra: {
      identifier: p.id,
      country: p.country_code,
      status: p.status,
      deadline: p.deadline_date || p.deadline,
      program: p.program,
    },
  }));
  out.push(`# ${clean(p.name)}\n`);

  const facts = [
    ["Идентификатор", p.id],
    ["Държава", p.country_code],
    ["Програма", p.program],
    ["Приоритет / ос", p.priority],
    ["Статус", STATUS_LABEL[p.status] || p.status],
    ["Краен срок", p.deadline],
    ["Крайна дата (ISO)", p.deadline_date],
    ["Бюджет", p.budget],
    ["Бюджет (EUR, структуриран)", p.budget_amount_eur != null ? Math.round(p.budget_amount_eur).toLocaleString("bg-BG") : null],
    ["Валута на бюджета", p.budget_currency],
    ["Допустими кандидати", p.eligible],
    ["Управляващ орган", p.managing_authority],
    ["Първо засичане", p.first_seen],
    ["Последна промяна", p.last_updated],
  ].filter(([, v]) => v != null && String(v).trim() !== "");
  out.push(table(["Поле", "Стойност"], facts));
  if (needsDeadlineReview(p)) out.push(`\n> ${DEADLINE_REVIEW_NOTICE}\n`);

  if (p.notes) out.push(`\n## Бележки\n\n${clean(p.notes)}\n`);

  out.push("\n## Официален източник\n");
  const links = [];
  if (p.official_url) links.push(`- Официална страница: ${p.official_url}`);
  if (p.link && p.link !== p.official_url) links.push(`- Обявление: ${p.link}`);
  links.push(`- Тази страница (HTML): ${canonical}`);
  links.push(`- JSON: ${SITE}/api/project?id=${encodeURIComponent(p.id)}`);
  out.push(links.join("\n") + "\n");

  const dl = docs.results || [];
  out.push(`\n## Документи (${dl.length})\n`);
  if (!dl.length) {
    out.push("_Няма публикувани документи към тази процедура._\n");
  } else {
    for (const d of dl) {
      out.push(`### ${clean(d.title) || "Документ"}\n`);
      if (d.doc_type) out.push(`*Тип: ${clean(d.doc_type)}*\n`);
      if (d.source_url) out.push(`Оригинален файл: ${d.source_url}\n`);
      if (d.content) out.push(String(d.content).trim() + "\n");
    }
  }
  out.push(agentFooter());
  return out.join("\n");
}

async function listLandingMarkdown(env, { title, description, url, intro, sql, binds = [] }) {
  const { results } = await env.DB.prepare(sql).bind(...binds).all().catch(() => ({ results: [] }));
  const out = [];
  out.push(head({ title, description, url }));
  out.push(`# ${title}\n`);
  out.push(intro + "\n");
  out.push(table(["Процедура", "Статус", "Програма", "Краен срок", "Държава"], (results || []).map(procedureRow)));
  out.push(agentFooter());
  return out.join("\n");
}

async function calendarMarkdown(env, country) {
  const { results } = await env.DB.prepare(
    `SELECT public_slug, program_slug, id, name, program, status, deadline, deadline_date, country_code FROM public_projects
     WHERE country_code = ?1 AND deadline_date IS NOT NULL AND deadline_date >= date('now')
     ORDER BY deadline_date LIMIT 200`
  ).bind(country).all().catch(() => ({ results: [] }));
  const rows = results || [];
  const byMonth = new Map();
  for (const r of rows) {
    const key = String(r.deadline_date).slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(r);
  }
  const out = [];
  out.push(head({
    title: `Календар на крайните срокове (${country}) | ${BRAND}`,
    description: `Предстоящите крайни срокове за кандидатстване по процедури за финансиране в държава ${country}, подредени по месец.`,
    url: `${SITE}/calendar?country=${country}`,
    extra: { country, count: String(rows.length) },
  }));
  out.push(`# Календар на крайните срокове — ${country}\n`);
  out.push(`${rows.length} предстоящи крайни срока. Датите са както са обявени от официалния източник.\n`);
  for (const [month, items] of [...byMonth.entries()].sort()) {
    out.push(`\n## ${month} (${items.length})\n`);
    out.push(table(["Краен срок", "Процедура", "Статус", "Програма"], items.map((p) => [
      p.deadline_date,
      `[${trunc(p.name, 90)}](${SITE}${procedurePath(p)})`,
      STATUS_LABEL[p.status] || p.status,
      p.program,
    ])));
  }
  if (!rows.length) out.push("_Няма предстоящи крайни срокове за тази държава._\n");
  out.push(agentFooter());
  return out.join("\n");
}

async function sourcesMarkdown(env, country) {
  const { results } = await env.DB.prepare(
    `SELECT name, authority_name, authority_type, base_url, calls_url, source_type, source_level,
            official, verified, source_health, update_frequency, coverage_description
     FROM funding_sources WHERE country_code = ?1 ORDER BY priority`
  ).bind(country).all().catch(() => ({ results: [] }));
  const out = [];
  out.push(head({
    title: `Официални източници на данни (${country}) | ${BRAND}`,
    description: `Регистър на официалните национални и европейски източници, от които се събират процедурите за държава ${country}.`,
    url: `${SITE}/sources?country=${country}`,
  }));
  out.push(`# Официални източници — ${country}\n`);
  out.push("Платформата събира данни само от официални източници. Всеки източник се проверява периодично.\n");
  out.push(table(
    ["Източник", "Орган", "Ниво", "Адрес", "Проверен", "Състояние"],
    (results || []).map((r) => [
      r.name, r.authority_name, r.source_level, r.calls_url || r.base_url, r.verified ? "да" : "не", r.source_health || "неизвестно",
    ])
  ));
  out.push(`\nJSON: \`${SITE}/api/sources?country=${country}\`\n`);
  out.push(agentFooter());
  return out.join("\n");
}

async function aboutMarkdown(env) {
  const stats = await latestStats(env);
  const out = [];
  out.push(head({
    title: `За платформата | ${BRAND}`,
    description: "Как работи Euro-Funding: обхват, източници, методология и реални статистики от последния публикуван snapshot.",
    url: `${SITE}/about`,
  }));
  out.push(`# За ${BRAND}\n`);
  out.push(
    "Euro-Funding следи процедурите за европейско и национално финансиране в 27-те държави от ЕС.",
    "Данните се извличат автоматично от официалните национални портали, структурират се с изкуствен",
    "интелект (нормализиране на срокове, статуси, бюджети и допустими кандидати) и се публикуват",
    "без ръчна редакция на фактите. Липсващите стойности се показват честно като липсващи —",
    "платформата не попълва предположения.\n"
  );
  if (stats.date) {
    out.push(`## Статистики (snapshot ${stats.date})\n`);
    out.push(table(
      ["Държава", "Общо", "Активни", "Предстоящи", "Процедури с бюджет"],
      stats.rows.map((r) => [
        `${r.name_bg || r.country_code} (${r.country_code})`,
        r.total_procedures, r.active_procedures, r.upcoming_procedures, r.budget_procedure_count,
      ])
    ));
  } else {
    out.push("_Няма публикуван snapshot в момента._\n");
  }
  out.push(agentFooter());
  return out.join("\n");
}

async function changelogMarkdown(env) {
  const { results } = await env.DB.prepare(
    "SELECT version, title, summary, category, published_at, affected_route, content FROM changelog_entries ORDER BY published_at DESC, id DESC LIMIT 25"
  ).all().catch(() => ({ results: [] }));
  const out = [];
  out.push(head({
    title: `Промени по системата | ${BRAND}`,
    description: "Хронология на промените по платформата — нови функции, подобрения, поправки и промени в данните.",
    url: `${SITE}/changelog`,
  }));
  out.push("# Промени по системата\n");
  for (const e of results || []) {
    out.push(`## ${e.version} — ${clean(e.title)}\n`);
    out.push(`*${e.published_at} · ${e.category}${e.affected_route ? ` · ${e.affected_route}` : ""}*\n`);
    if (e.summary) out.push(clean(e.summary) + "\n");
    let items = [];
    try { items = JSON.parse(e.content || "[]"); } catch { items = []; }
    if (Array.isArray(items) && items.length) out.push(items.map((i) => `- ${clean(i)}`).join("\n") + "\n");
  }
  out.push(`\nJSON: \`${SITE}/api/changelog\`\n`);
  out.push(agentFooter());
  return out.join("\n");
}

/** llms.txt — кратка карта на сайта за езикови модели (llmstxt.org). */
export async function llmsTxt(env) {
  const stats = await latestStats(env).catch(() => ({ date: null, rows: [] }));
  const total = stats.rows.reduce((a, r) => a + (r.total_procedures || 0), 0);
  return [
    `# ${BRAND}`,
    "",
    "> Ежедневно обновяван регистър на процедурите за европейско и национално финансиране в",
    "> 27-те държави от ЕС — статуси, крайни срокове, бюджети и допустими кандидати, събрани",
    "> от официални национални източници и структурирани с изкуствен интелект.",
    "",
    total ? `Обхват към ${stats.date}: ${total} процедури.` : "",
    "",
    "Всяка страница по-долу връща markdown при `Accept: text/markdown`.",
    "",
    "## Основни страници",
    "",
    `- [Начало](${SITE}/): обзор, статистики по държави и процедури с най-близък срок`,
    `- [Процедури](${SITE}/procedures): пълен списък с филтри (\`?country=XX\`)`,
    `- [Програми](${SITE}/procedures/programs): групиране по оперативна програма`,
    `- [Официални източници](${SITE}/sources): регистър на източниците по държава`,
    `- [За платформата](${SITE}/about): методология и реални статистики`,
    `- [Как работи ИИ](${SITE}/how-ai-works): моделите и техните роли`,
    `- [Промени](${SITE}/changelog): хронология на версиите`,
    "",
    "## API",
    "",
    `- [OpenAPI 3.1](${SITE}/openapi.json): пълна спецификация на публичното API`,
    `- [API каталог](${SITE}/.well-known/api-catalog): RFC 9727 linkset`,
    `- [Документация](${SITE}/docs/api): описание на endpoint-ите и автентикацията`,
    `- [Здравен статус](${SITE}/api/health): наличност и версия`,
    `- [OAuth 2.1 метаданни](${SITE}/.well-known/oauth-authorization-server): достъп до личните данни на потребител`,
    `- [auth.md](${SITE}/auth.md): как агент да се регистрира сам (ID-JAG, потвърден имейл, анонимно)`,
    `- [Агентски индекс](${SITE}/.well-known/agent-index.json): регистърът зад DNS записа _index._agents (DNS-AID)`,
    `- [Skill-ове за агенти](${SITE}/.well-known/agent-skills/index.json): инструкции за търсене на процедури, достъп и държави`,
    `- [MCP Server Card](${SITE}/.well-known/mcp/server-card.json): MCP сървър на \`POST ${SITE}/mcp\` — Streamable HTTP, само за четене`,
    "",
    "## Условия",
    "",
    `- [Условия за ползване](${SITE}/terms)`,
    `- [Поверителност](${SITE}/privacy)`,
    "",
    "Съдържанието не заменя официалната документация по процедурите.",
    "",
  ].filter((l) => l !== "").join("\n");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const STATUS_FROM_SLUG = { otvoreni: "open", "izticasht-srok": "closing_soon", predstoyashti: "upcoming", priklyuchili: "closed" };
const CANDIDATE_WHERE = {
  business: { where: "category != 'youth' OR category IS NULL", h1: "Процедури за бизнес и предприятия" },
  youth: { where: "category = 'youth'", h1: "Процедури за младежка заетост" },
};
const DEADLINE_DAYS = { "next-7-days": 7, "next-30-days": 30, "next-90-days": 90 };

const PROC_COLS = "public_slug, program_slug, id, name, program, status, deadline, deadline_date, country_code";

/** Маха /bg /en /de префикса — markdown-ът е на изходния език (bg). */
function stripLocale(pathname) {
  const m = /^\/(bg|en|de)(\/.*)?$/.exec(pathname);
  if (!m) return pathname;
  return m[2] || "/";
}

/**
 * Връща markdown Response за поддържан публичен път, или null (пътят няма
 * markdown представяне → продължава нормалната HTML обработка).
 */
export async function handleMarkdown(request, env, url, { defaultCountry = "BG", normalizeCountry } = {}) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const path = stripLocale(url.pathname).replace(/\/+$/, "") || "/";
  const rawCountry = url.searchParams.get("country");
  const country = (normalizeCountry ? normalizeCountry(rawCountry) : rawCountry) || defaultCountry;
  await ensurePublicRoutes(env);
  const canonical = `${SITE}${path}`;
  const md = async (text, maxAge) => markdownResponse(text, { canonicalUrl: canonical, maxAge });

  if (path === "/") return md(await homeMarkdown(env));
  if (path === "/procedures") return md(await proceduresMarkdown(env, url, country));
  if (path === "/about") return md(await aboutMarkdown(env), 600);
  if (path === "/sources") return md(await sourcesMarkdown(env, country), 600);
  if (path === "/changelog") return md(await changelogMarkdown(env), 600);
  if (path === "/calendar") return md(await calendarMarkdown(env, country));

  if (path === "/procedures/programs") {
    const { results } = await env.DB.prepare(
      "SELECT program, program_slug, COUNT(*) AS n FROM public_projects WHERE program IS NOT NULL AND program != '' GROUP BY program_slug ORDER BY n DESC"
    ).all().catch(() => ({ results: [] }));
    const body = [
      head({ title: "Програми за европейско финансиране", description: "Оперативни програми и национални източници — брой процедури по програма.", url: `${SITE}/procedures/programs` }),
      "# Програми за финансиране\n",
      table(["Програма", "Процедури", "Адрес"], (results || []).map((r) => [r.program, r.n, `${SITE}/procedures/programs/${r.program_slug}`])),
      agentFooter(),
    ].join("\n");
    return md(body, 600);
  }

  let m = /^\/procedures\/programs\/([^/]+)$/.exec(path);
  if (m) {
    const slug = decodeURIComponent(m[1]).toLowerCase();
    const { results } = await env.DB.prepare(`SELECT ${PROC_COLS} FROM public_projects`).all().catch(() => ({ results: [] }));
    const match = (results || []).filter((p) => p.program_slug === slug);
    if (!match.length) return null;
    const program = match.find((x) => x.program) ? match.find((x) => x.program).program : slug;
    const body = [
      head({ title: `${program} — процедури за финансиране`, description: trunc(`Активни и предстоящи процедури по програма ${program}.`, 200), url: `${SITE}/procedures/programs/${slug}` }),
      `# ${clean(program)} — процедури за финансиране\n`,
      table(["Процедура", "Статус", "Програма", "Краен срок", "Държава"], match.map(procedureRow)),
      agentFooter(),
    ].join("\n");
    return md(body, 600);
  }

  m = /^\/procedures\/status\/([^/]+)$/.exec(path);
  if (m) {
    const status = STATUS_FROM_SLUG[decodeURIComponent(m[1]).toLowerCase()];
    if (!status) return null;
    const label = STATUS_LABEL[status];
    return md(await listLandingMarkdown(env, {
      title: `${label} процедури за европейско финансиране`,
      description: `Списък на процедурите със статус „${label}“.`,
      url: `${SITE}${path}`,
      intro: `Процедури със статус **${label}**.`,
      sql: `SELECT ${PROC_COLS} FROM public_projects WHERE status = ?1 ORDER BY deadline_date`,
      binds: [status],
    }), 600);
  }

  m = /^\/procedures\/candidates\/([^/]+)$/.exec(path);
  if (m) {
    const c = CANDIDATE_WHERE[decodeURIComponent(m[1]).toLowerCase()];
    if (!c) return null;
    return md(await listLandingMarkdown(env, {
      title: c.h1,
      description: trunc(c.h1 + " — активни и предстоящи процедури.", 200),
      url: `${SITE}${path}`,
      intro: "Процедури, подходящи за тази група кандидати.",
      sql: `SELECT ${PROC_COLS} FROM public_projects WHERE ${c.where} ORDER BY deadline_date`,
    }), 600);
  }

  m = /^\/procedures\/deadlines\/([^/]+)$/.exec(path);
  if (m) {
    const days = DEADLINE_DAYS[decodeURIComponent(m[1]).toLowerCase()];
    if (!days) return null;
    return md(await listLandingMarkdown(env, {
      title: `Процедури с краен срок до ${days} дни`,
      description: `Активни процедури, чийто краен срок изтича до ${days} дни.`,
      url: `${SITE}${path}`,
      intro: `Активни процедури с краен срок до **${days} дни**.`,
      sql: `SELECT ${PROC_COLS} FROM public_projects WHERE deadline_date >= date('now') AND deadline_date <= date('now', '+${days} day') AND status IN ('open','closing_soon') ORDER BY deadline_date`,
    }), 600);
  }

  m = /^\/procedures\/([^/]+)$/.exec(path);
  if (m) {
    const project = await findPublicProcedure(env, decodeURIComponent(m[1]));
    if (!project) return null;
    const canonicalPath = procedurePath(project);
    if (url.pathname !== canonicalPath) return Response.redirect(SITE+canonicalPath,301);
    const body = await procedureDetailMarkdown(env, project.id);
    if (!body) return null;
    return md(body);
  }

  return null;
}
