// Динамичен sitemap.xml от D1: статичните индексируеми маршрути + всяка процедура
// (loc = каноничния slug, lastmod = реалната дата на промяна) + landing страниците
// по статус. Само canonical, публични, HTTP 200 URL-и. Без /saved, /profile и др.

import { ensurePublicRoutes } from "./public-routes.js";

const SITE = "https://euro-funds.eu";

const STATIC = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/procedures", changefreq: "daily", priority: "0.9" },
  { path: "/calendar", changefreq: "weekly", priority: "0.7" },
  { path: "/about", changefreq: "weekly", priority: "0.7" },
  { path: "/changelog", changefreq: "weekly", priority: "0.5" },
  { path: "/how-ai-works", changefreq: "monthly", priority: "0.5" },
  { path: "/sources", changefreq: "weekly", priority: "0.6" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
  { path: "/cookies", changefreq: "monthly", priority: "0.3" },
];

// Landing по статус (curated).
const STATUS_SLUGS = ["open", "closing-soon", "upcoming", "closed"];

function urlEntry(loc, lastmod, changefreq, priority) {
  let x = `  <url>\n    <loc>${loc}</loc>\n`;
  if (lastmod) x += `    <lastmod>${lastmod}</lastmod>\n`;
  if (changefreq) x += `    <changefreq>${changefreq}</changefreq>\n`;
  if (priority) x += `    <priority>${priority}</priority>\n`;
  x += "  </url>\n";
  return x;
}
function isoDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

export async function generateSitemap(env, format = 'xml') {
  try {
    await ensurePublicRoutes(env);
    const {results: rows} = await env.DB.prepare("SELECT id, public_slug, program_slug, country_code, status, last_updated, first_seen FROM public_projects ORDER BY id").all();
    const validSlug = s => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s || '');
    if (!rows || rows.some(p=>!validSlug(p.public_slug) || (p.program_slug && !validSlug(p.program_slug)) || (p.country_code && !/^[A-Z]{2}$/.test(p.country_code))) || new Set(rows.map(p=>p.public_slug)).size !== rows.length) throw new Error('Incomplete or collided procedure route inventory');
    const newest = items => items.map(p=>isoDate(p.last_updated)||isoDate(p.first_seen)).filter(Boolean).sort().pop();
    let body = '<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    const entries = new Map();
    const add = (path, date) => { if(entries.has(path)) throw new Error('Duplicate sitemap URL'); entries.set(path,date); };
    for (const s of STATIC) add(s.path, ['/','/procedures','/calendar'].includes(s.path) ? newest(rows) : null);
    add('/procedures/programs',newest(rows));
    for (const slug of STATUS_SLUGS) add('/procedures/status/'+slug,newest(rows.filter(p=>p.status===slug.replace('-','_'))));
    // Membership changes with time: omit a speculative lastmod on deadline directories.
    for (const slug of ['business','youth']) add('/procedures/candidates/'+slug,null);
    for (const slug of ['next-7-days','next-30-days','next-90-days']) add('/procedures/deadlines/'+slug,null);
    for (const slug of new Set(rows.map(p=>p.program_slug).filter(Boolean))) add('/procedures/programs/'+slug,newest(rows.filter(p=>p.program_slug===slug)));
    for (const country of new Set(rows.map(p=>p.country_code).filter(Boolean))) {
      const group=rows.filter(p=>p.country_code===country);
      for(let page=1;page<=Math.ceil(group.length/100);page++) add('/procedures/countries/'+country.toLowerCase()+(page===1?'':'/page/'+page),newest(group));
    }
    for(const p of rows) add('/procedures/'+p.public_slug,isoDate(p.last_updated)||isoDate(p.first_seen));
    for(const [path,date] of entries) body += urlEntry(SITE+path,date);
    body += '</urlset>\n';
    if(entries.size>50000 || new TextEncoder().encode(body).length>50*1024*1024) throw new Error('Sitemap requires splitting');
    // Google's supported plain-text format provides an independent submission
    // without changing canonical addresses or relaxing delivery checks.
    if (format === 'text') return new Response([...entries.keys()].map(path => SITE+path).join('\n')+'\n', {headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=0, s-maxage=300','x-content-type-options':'nosniff'}});
    return new Response(body,{headers:{'content-type':'application/xml; charset=utf-8','x-content-type-options':'nosniff','cache-control':'public, max-age=0, s-maxage=300'}});
  } catch(error) {
    console.error('sitemap_generation_failed', error.message);
    return new Response('Sitemap temporarily unavailable. Please retry.',{status:503,headers:{'content-type':'text/plain; charset=utf-8','retry-after':'300','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
}

// Четим browser изглед на sitemap-а (XSLT 1.0). Търсачките игнорират stylesheet-а и
// четат чистия XML — данните НЕ се променят. Самостоятелен: без JS/външни библиотеки.
const SITEMAP_XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9" exclude-result-prefixes="sm">
<xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>
<xsl:template match="/">
<html lang="bg">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,follow"/>
<title>Euro-Funding — XML Sitemap</title>
<style>
:root{--pri:#0b6ea3;--ink:#0f172a;--muted:#64748b;--line:#e3e8ef;--bg:#f6f8fa;--surface:#fff}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
.wrap{max-width:1100px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:22px;margin:0 0 4px;display:flex;align-items:center;gap:10px}
.badge-brand{background:var(--pri);color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700}
.lead{color:var(--muted);font-size:14px;margin:6px 0 2px}
.count{font-size:14px;margin:2px 0 18px}
.count strong{font-size:18px;color:var(--pri)}
.twrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:640px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{background:#eef3f8;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);position:sticky;top:0}
tr:last-child td{border-bottom:none}
td.url{max-width:560px}
td.url a{color:var(--pri);text-decoration:none;word-break:break-all}
td.url a:hover{text-decoration:underline}
.type{display:inline-block;font-size:11px;font-weight:700;border-radius:20px;padding:2px 9px;white-space:nowrap}
.t-home{background:#e0f2fe;color:#075985}
.t-proc{background:#dcfce7;color:#166534}
.t-list{background:#ede9fe;color:#5b21b6}
.t-info{background:#fef9c3;color:#854d0e}
.t-legal{background:#f1f5f9;color:#475569}
.t-other{background:#f1f5f9;color:#475569}
.nowrap{white-space:nowrap;color:var(--muted)}
footer{margin-top:18px;color:var(--muted);font-size:12px}
@media(max-width:560px){.wrap{padding:16px 10px}h1{font-size:18px}}
</style>
</head>
<body>
<div class="wrap">
<h1><span class="badge-brand">Euro-Funding</span> XML Sitemap</h1>
<p class="lead">Генерира се динамично от базата на Euro-Funding (Cloudflare D1) и се обновява с новите процедури. Този изглед е само за хора — търсачките четат чистия XML.</p>
<p class="count">Общо URL адреси: <strong><xsl:value-of select="count(sm:urlset/sm:url)"/></strong></p>
<div class="twrap">
<table>
<thead><tr><th>Тип</th><th>URL</th><th>Last modified</th><th>Change freq.</th><th>Priority</th></tr></thead>
<tbody>
<xsl:for-each select="sm:urlset/sm:url">
<xsl:variable name="u" select="sm:loc"/>
<tr>
<td>
<xsl:choose>
<xsl:when test="$u='https://euro-funds.eu/'"><span class="type t-home">Начало</span></xsl:when>
<xsl:when test="contains($u,'/terms') or contains($u,'/privacy') or contains($u,'/cookies')"><span class="type t-legal">Правна</span></xsl:when>
<xsl:when test="contains($u,'/procedures/status/') or contains($u,'/procedures/deadlines/') or contains($u,'/procedures/candidates/') or contains($u,'/procedures/programs') or contains($u,'/procedures/countries/')"><span class="type t-list">Листинг</span></xsl:when>
<xsl:when test="contains($u,'/procedures/')"><span class="type t-proc">Процедура</span></xsl:when>
<xsl:when test="contains($u,'/procedures')"><span class="type t-list">Процедури</span></xsl:when>
<xsl:when test="contains($u,'/about') or contains($u,'/sources') or contains($u,'/calendar') or contains($u,'/how-ai-works') or contains($u,'/changelog')"><span class="type t-info">Инфо</span></xsl:when>
<xsl:otherwise><span class="type t-other">Друга</span></xsl:otherwise>
</xsl:choose>
</td>
<td class="url"><a href="{$u}"><xsl:value-of select="$u"/></a></td>
<td class="nowrap"><xsl:value-of select="sm:lastmod"/></td>
<td class="nowrap"><xsl:value-of select="sm:changefreq"/></td>
<td class="nowrap"><xsl:value-of select="sm:priority"/></td>
</tr>
</xsl:for-each>
</tbody>
</table>
</div>
<footer>Euro-Funding · euro-funds.eu · Sitemap протокол 0.9</footer>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
`;

export function sitemapStylesheet() {
  return new Response(SITEMAP_XSL, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
