// Динамичен sitemap.xml от D1: статичните индексируеми маршрути + всяка процедура
// (loc = каноничния slug, lastmod = реалната дата на промяна) + landing страниците
// по статус. Само canonical, публични, HTTP 200 URL-и. Без /saved, /profile и др.

import { codeSlug } from "../app/lib/slug.js";

const SITE = "https://euro-funds.eu";

const STATIC = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/procedures", changefreq: "daily", priority: "0.9" },
  { path: "/calendar", changefreq: "weekly", priority: "0.7" },
  { path: "/changelog", changefreq: "weekly", priority: "0.6" },
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

export async function generateSitemap(env) {
  let body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  for (const s of STATIC) body += urlEntry(`${SITE}${s.path}`, null, s.changefreq, s.priority);
  for (const slug of STATUS_SLUGS) body += urlEntry(`${SITE}/procedures/status/${slug}`, null, "daily", "0.6");

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, last_updated, first_seen FROM projects ORDER BY last_updated DESC"
    ).all();
    for (const p of results || []) {
      const slug = codeSlug(p.id);
      if (!slug) continue;
      const lastmod = isoDate(p.last_updated) || isoDate(p.first_seen);
      body += urlEntry(`${SITE}/procedures/${slug}`, lastmod, "weekly", "0.7");
    }
  } catch { /* при грешка връщаме поне статичните URL-и */ }

  body += `</urlset>\n`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
