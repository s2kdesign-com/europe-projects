// i18n одит на администраторските раздели „API & Agents" и „SEO & Discovery".
//
// Проверява две неща, които спецификацията изисква:
//   1) всеки преводим низ е регистриран в batch масива (иначе остава на
//      български, когато интерфейсът е на друг език);
//   2) протоколни имена, HTTP методи, медийни типове и пътища НЕ се превеждат.
//
//   node test/i18n-admin-audit.mjs
// регистриран в batch масива, иначе остава на български при чужд UI език.
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(p, new URL("../", import.meta.url)), "utf8");

const page = read("app/admin/page.jsx");
const { SUMMARY_TEMPLATES } = await import("../app/admin/discovery-summaries.js");

// Регистрираните низове: DISCOVERY_LABELS + ADMIN_LABELS + SUMMARY_LABELS
const grab = (name) => {
  const i = page.indexOf(`const ${name} = [`);
  if (i < 0) return [];
  const j = page.indexOf("\n];", i);
  const end = j < 0 ? page.indexOf("\n].concat", i) : j;
  return [...page.slice(i, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
};
const registered = new Set([...grab("DISCOVERY_LABELS"), ...grab("ADMIN_LABELS"), ...Object.values(SUMMARY_TEMPLATES)]);

const FILES = ["app/admin/ApiAgentsTab.jsx", "app/admin/SeoDiscoveryTab.jsx", "app/admin/discovery-ui.jsx"];
// Технически низове, които НЕ се превеждат по спецификация.
const NO_TRANSLATE = /^(GET|POST|PUT|DELETE|HEAD|PATCH|OpenAPI|PKCE|CORS|HTML|Markdown|JSON|XML|XSL|API|SEO|TTFB|Cache-Control|CF cache|Vary|Link|Code|html lang|og:[a-z]+|twitter:[a-z]+|application\/[\w+.-]+|text\/[\w+.-]+|[a-z_]+_[a-z_]+|[/.][\w/.-]*|\d+|—|\*|Facebook|LinkedIn|X|RFC \d+|Content-Signal|robots\.txt|sitemap|llms\.txt|Build ID|ES256|JWKS|Bearer|OAuth|OpenID|Google|Cloudflare|D1|Worker|Twitter|Euro-Funding|schema\.org|sitemaps\.org 0\.9|llmstxt\.org|RFC 8288|RFC 9727|RFC 9309|RFC 7517|RFC 8414|RFC 9728|RFC 6596|OpenID Connect Discovery 1\.0|Content negotiation|OpenAPI 3\.1|RFC 9727 status|no-store|s-maxage=3600|25 \+ bg|bg, en, de)$/;

let missing = [], checked = 0;
for (const f of FILES) {
  const src = read(f);
  const strings = [
    ...[...src.matchAll(/\btl\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/\b(?:titleKey|textKey|labelKey|confirmKey)\s*=\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/\b(?:titleKey|textKey|labelKey|confirmKey):\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
  ].map((s) => s.replace(/\\"/g, '"'));
  for (const s of new Set(strings)) {
    checked++;
    if (NO_TRANSLATE.test(s)) continue;
    if (!registered.has(s)) missing.push(`${f}: "${s}"`);
  }
}
console.log(`Регистрирани низа за batch превод: ${registered.size}`);
console.log(`Проверени преводими низа в новите раздели: ${checked}`);
if (missing.length) {
  console.log(`\n❌ НЕ са в batch масива (${missing.length}):`);
  for (const m of missing) console.log("   " + m);
} else {
  console.log("\n✅ Всеки преводим низ е регистриран.");
}

// Правило от спецификацията: протоколни имена/методи/媒 типове НЕ се превеждат.
const leaked = [...registered].filter((s) => /^(GET|POST|PUT|DELETE|PATCH|HEAD|application\/[\w+.-]+|text\/[\w+.-]+|operationId|authorization_code|refresh_token|client_credentials|api-catalog|service-desc|service-doc)$/.test(s));
console.log(leaked.length ? `\n❌ Технически низове в масива за превод: ${leaked.join(", ")}` : "✅ Няма протоколни имена в масива за превод.");
process.exitCode = missing.length || leaked.length ? 1 : 0;
