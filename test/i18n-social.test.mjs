// Тестове за локализираните социални (OG/Twitter) мета тагове. node test/i18n-social.test.mjs
import assert from "node:assert/strict";
import { applyHead } from "../worker/i18n-pages.js";

let n = 0;
const t = typeof it === "function" ? it : (name, fn) => { fn(); n++; console.log("ok -", name); };

// Примерен построен HTML head (както Next.js metadata го емитира).
const SAMPLE = `<!doctype html><html lang="bg"><head>
<title>Заглавие | Европроекти</title>
<meta name="description" content="Българско описание">
<link rel="canonical" href="https://euro-funds.eu/">
<meta property="og:title" content="Заглавие | Европроекти">
<meta property="og:description" content="Българско описание">
<meta property="og:site_name" content="Европроекти">
<meta property="og:image:alt" content="Alt на български">
<meta property="og:url" content="https://euro-funds.eu/">
<meta property="og:locale" content="bg_BG">
<meta name="twitter:title" content="Заглавие | Европроекти">
<meta name="twitter:description" content="Българско описание">
</head><body></body></html>`;

t("английски OG на бара / (ogOnly) — само социалните тагове", () => {
  const out = applyHead(SAMPLE, { title: "Euro Funds — EU funding", desc: "English description", alt: "English alt", locale: "en", brand: "Euro Funds", canonicalUrl: "https://euro-funds.eu/", rest: "/", fullPage: false });
  assert.match(out, /property="og:title" content="Euro Funds — EU funding \| Euro Funds"/);
  assert.match(out, /property="og:description" content="English description"/);
  assert.match(out, /property="og:locale" content="en_US"/);
  assert.match(out, /name="twitter:title" content="Euro Funds — EU funding \| Euro Funds"/);
  assert.match(out, /property="og:image:alt" content="English alt"/);
  // fullPage=false → НЕ променя видимия <title> и <html lang> (клиентът авто-разпознава)
  assert.match(out, /<html lang="bg"/);
  assert.match(out, /<title>Заглавие \| Европроекти<\/title>/);
  // hreflang добавен
  assert.match(out, /hreflang="bg" href="https:\/\/euro-funds\.eu\/bg"/);
  assert.match(out, /hreflang="x-default"/);
});

t("немски OG на /de (fullPage) — сменя и title/lang/локал", () => {
  const out = applyHead(SAMPLE, { title: "EU-Förderung", desc: "Deutsche Beschreibung", alt: "Deutsches Alt", locale: "de", brand: "Euro Funds", canonicalUrl: "https://euro-funds.eu/de", rest: "/", fullPage: true });
  assert.match(out, /<html lang="de"/);
  assert.match(out, /<title>EU-Förderung \| Euro Funds<\/title>/);
  assert.match(out, /property="og:locale" content="de_DE"/);
  assert.match(out, /property="og:title" content="EU-Förderung \| Euro Funds"/);
  assert.match(out, /__I18N_INITIAL="de"/);
  assert.match(out, /rel="canonical" href="https:\/\/euro-funds\.eu\/de"/);
});

t("български /bg — identity (og:locale bg_BG, брандът остава Европроекти)", () => {
  const out = applyHead(SAMPLE, { title: "Заглавие", desc: "Българско описание", alt: "Alt на български", locale: "bg", brand: "Европроекти", canonicalUrl: "https://euro-funds.eu/bg", rest: "/", fullPage: true });
  assert.match(out, /property="og:locale" content="bg_BG"/);
  assert.match(out, /property="og:title" content="Заглавие \| Европроекти"/);
  assert.match(out, /<html lang="bg"/);
  assert.match(out, /rel="canonical" href="https:\/\/euro-funds\.eu\/bg"/);
});

t("липсващ таг → no-op (не чупи HTML)", () => {
  const minimal = `<html lang="bg"><head><title>X | Европроекти</title></head></html>`;
  const out = applyHead(minimal, { title: "Y", desc: "d", alt: "a", locale: "en", brand: "Euro Funds", canonicalUrl: null, rest: "/", fullPage: false });
  assert.ok(out.includes("<title>X | Европроекти</title>")); // непроменен, защото fullPage=false и няма og тагове
});

console.log(`\n${n} passed (i18n-social)`);
