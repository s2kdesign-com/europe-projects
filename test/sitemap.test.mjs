// Тестове за динамичния sitemap + XSL. node test/sitemap.test.mjs
// Мокваме env.DB, за да проверим чистата логика на generateSitemap без D1.
import assert from "node:assert/strict";
import { generateSitemap, sitemapStylesheet } from "../worker/sitemap.js";
import { codeSlug } from "../app/lib/slug.js";

let n = 0;
const t = typeof it === "function" ? it : (name, fn) => { const r = fn(); if (r && r.then) return r.then(() => { n++; console.log("ok -", name); }); n++; console.log("ok -", name); return r; };

const mkEnv = (rows) => ({ DB: { prepare: () => ({ all: async () => ({ results: rows }) }) } });
const ROWS = [
  { id: "bg:eufunds:proc-a", program: "Program X", last_updated: "2026-07-20", first_seen: "2026-07-01" },
  { id: "ro:ro-x:proc-b", program: "Program X", last_updated: "2026-07-19", first_seen: "2026-07-02" },
  { id: "hu:hu-y:proc-c", program: "Program Y", last_updated: null, first_seen: "2026-07-03" },
];

async function build(rows = ROWS) {
  const res = await generateSitemap(mkEnv(rows));
  const xml = await res.text();
  return { res, xml };
}

await t("XML декларацията е на позиция 0 (без whitespace/BOM преди нея)", async () => {
  const { xml } = await build();
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.equal(xml.charCodeAt(0), 0x3c); // '<' — няма BOM
});

await t("Има XSL stylesheet PI веднага след декларацията", async () => {
  const { xml } = await build();
  assert.match(xml, /^<\?xml[^\n]*\?>\n<\?xml-stylesheet type="text\/xsl" href="\/sitemap\.xsl"\?>\n<urlset /);
});

await t("Правилен sitemap namespace", async () => {
  const { xml } = await build();
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
});

await t("Content-Type application/xml + nosniff + edge cache 1ч", async () => {
  const { res } = await build();
  assert.equal(res.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("cache-control"), /s-maxage=3600/);
  assert.equal(res.status, 200);
});

await t("Всеки <url> има <loc>; всички са абсолютни https://euro-funds.eu", async () => {
  const { xml } = await build();
  const urls = (xml.match(/<url>/g) || []).length;
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.equal(urls, locs.length);
  assert.ok(locs.length > 0);
  for (const l of locs) { assert.ok(l && l.startsWith("https://euro-funds.eu/"), "bad loc: " + l); }
});

await t("Няма дублирани <loc> (дори при повтарящ се запис)", async () => {
  const { xml } = await build([...ROWS, ROWS[0]]); // дублиран proc-a
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.equal(locs.length, new Set(locs).size);
});

await t("Няма admin/profile/login/saved/api URL-и", async () => {
  const { xml } = await build();
  for (const bad of ["/admin", "/profile", "/login", "/saved", "/api/"]) {
    assert.ok(!xml.includes("euro-funds.eu" + bad), "leaked private route: " + bad);
  }
});

await t("Няма localhost / .workers.dev", async () => {
  const { xml } = await build();
  assert.ok(!/localhost|workers\.dev/.test(xml));
});

await t("lastmod е валиден W3C формат (YYYY-MM-DD)", async () => {
  const { xml } = await build();
  const lms = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]);
  assert.ok(lms.length > 0);
  for (const d of lms) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

await t("Няма неескейпнати & или <>\"' в <loc>", async () => {
  const { xml } = await build();
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => m[1]);
  for (const l of locs) {
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(l), "unescaped &: " + l);
    assert.ok(!/[<>"']/.test(l), "raw special char: " + l);
  }
});

await t("Реалната процедура присъства с коректен lastmod (интеграция)", async () => {
  const { xml } = await build();
  const slug = codeSlug("bg:eufunds:proc-a");
  const loc = `https://euro-funds.eu/procedures/${slug}`;
  assert.ok(xml.includes(`<loc>${loc}</loc>`), "procedure URL missing");
  // блокът на тази процедура трябва да има lastmod 2026-07-20
  const block = xml.split(`<loc>${loc}</loc>`)[1].split("</url>")[0];
  assert.match(block, /<lastmod>2026-07-20<\/lastmod>/);
});

await t("Процедура без last_updated ползва first_seen (не текуща дата)", async () => {
  const { xml } = await build();
  const slug = codeSlug("hu:hu-y:proc-c");
  const block = xml.split(`/procedures/${slug}</loc>`)[1].split("</url>")[0];
  assert.match(block, /<lastmod>2026-07-03<\/lastmod>/);
});

await t("Под лимитите (<50000 URL, well-formed затваряне)", async () => {
  const { xml } = await build();
  const urls = (xml.match(/<url>/g) || []).length;
  assert.ok(urls < 50000);
  assert.ok(xml.trim().endsWith("</urlset>"));
});

await t("При грешка в D1 → поне статичните URL-и (fallback)", async () => {
  const env = { DB: { prepare: () => ({ all: async () => { throw new Error("d1 down"); } }) } };
  const xml = await (await generateSitemap(env)).text();
  assert.ok(xml.includes("<loc>https://euro-funds.eu/</loc>"));
  assert.ok(xml.includes("<loc>https://euro-funds.eu/procedures</loc>"));
  assert.ok(xml.trim().endsWith("</urlset>"));
});

await t("sitemapStylesheet: 200, application/xml, валиден XSLT с sm namespace", async () => {
  const res = sitemapStylesheet();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  const xsl = await res.text();
  assert.ok(xsl.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xsl.includes('xmlns:xsl="http://www.w3.org/1999/XSL/Transform"'));
  assert.ok(xsl.includes('xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert.ok(xsl.includes("count(sm:urlset/sm:url)"));
  assert.ok(xsl.includes("Euro-Funding"));
});

console.log(`\n${n} passed (sitemap)`);
