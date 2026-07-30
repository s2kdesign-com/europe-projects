// Чисти парсери и редакция за SiteDiscoveryValidationService.
// Без мрежа и без D1 — затова са напълно тестваеми (test/discovery-*.test.mjs).

// ---------------------------------------------------------------------------
// Редакция на чувствителни стойности (задължителна ПРЕДИ каквото и да е
// показване в браузъра или запис в D1)
// ---------------------------------------------------------------------------

const SECRET_HEADERS = new Set([
  "authorization", "cookie", "set-cookie", "proxy-authorization",
  "x-api-key", "x-auth-token", "cf-access-jwt-assertion", "x-signature", "x-hmac",
]);

const SECRET_KEY_RE = /(secret|password|passwd|token|api[_-]?key|apikey|client[_-]?secret|private[_-]?key|authorization|session|cookie|jwt|bearer|credential|salt|nonce_secret|master[_-]?key)/i;
const SECRET_VALUE_RE = [
  // Истинските ключове имат ДЪЛГА непрекъсната алфанумерична поредица.
  // Само „sk-…" не стига: „sk" е и кодът на Словакия, а слъгове като
  // sk-sk-minzp-psk-mzp-001-2023-dv-efrr са напълно легитимни.
  /\bsk-[A-Za-z0-9_-]*[A-Za-z0-9]{20,}[A-Za-z0-9_-]*\b/g,
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{4,}/g,   // JWT
  /AIza[0-9A-Za-z_-]{20,}/g,                                        // Google API key
  /\b[0-9a-f]{64}\b/gi,                                             // 64-hex (хешове/ключове)
];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export const REDACTED = "[скрито]";

/** Изчиства низ от токени, ключове и лични имейли. */
export function redactText(text, { keepEmails = false } = {}) {
  if (text == null) return text;
  let out = String(text);
  for (const re of SECRET_VALUE_RE) out = out.replace(re, REDACTED);
  if (!keepEmails) out = out.replace(EMAIL_RE, REDACTED);
  return out;
}

/** Дълбока редакция на обект: маха чувствителни ключове, чисти стойностите. */
export function redactObject(value, depth = 0) {
  if (depth > 6) return REDACTED;
  if (value == null) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactObject(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(k)) { out[k] = REDACTED; continue; }
      out[k] = redactObject(v, depth + 1);
    }
    return out;
  }
  return REDACTED;
}

/** Само безопасните заглавки на отговор — никакви бисквитки/токени. */
export function safeHeaders(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) {
    const key = k.toLowerCase();
    if (SECRET_HEADERS.has(key)) { out[key] = REDACTED; continue; }
    out[key] = redactText(v, { keepEmails: true });
  }
  return out;
}

/** Ограничено и изчистено тяло за preview. */
export function safeBodyPreview(text, limit = 2000) {
  const s = redactText(String(text || ""));
  return { preview: s.slice(0, limit), truncated: s.length > limit, length: s.length };
}

// ---------------------------------------------------------------------------
// Link заглавки (RFC 8288)
// ---------------------------------------------------------------------------

/**
 * Разбор на една или няколко Link заглавки. Връща [{ target, rel, type, params }].
 * Понася запетаи вътре в кавички и няколко rel стойности.
 */
export function parseLinkHeader(headerValue) {
  const raw = Array.isArray(headerValue) ? headerValue.join(", ") : String(headerValue || "");
  if (!raw.trim()) return [];
  const links = [];
  // Разделяме по запетая, само когато сме извън <...> и извън кавички.
  let depth = 0, quoted = false, current = "";
  const parts = [];
  for (const ch of raw) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") depth++;
    else if (!quoted && ch === ">") depth--;
    if (ch === "," && depth === 0 && !quoted) { parts.push(current); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);

  for (const part of parts) {
    const m = /<([^>]*)>\s*(.*)$/.exec(part.trim());
    if (!m) continue;
    // Стойността в кавички може да съдържа „;" (напр.
    // type="application/openapi+json;version=3.1"), затова разделяме ръчно.
    const params = {};
    const attrs = [];
    let buf = "", q = false;
    for (const ch of m[2]) {
      if (ch === '"') { q = !q; buf += ch; continue; }
      if (ch === ";" && !q) { attrs.push(buf); buf = ""; continue; }
      buf += ch;
    }
    if (buf.trim()) attrs.push(buf);
    for (const attr of attrs) {
      const a = /^\s*([A-Za-z*_-]+)\s*=\s*(.*?)\s*$/.exec(attr);
      if (a) params[a[1].toLowerCase()] = a[2].replace(/^"|"$/g, "");
    }
    const rels = String(params.rel || "").split(/\s+/).filter(Boolean);
    if (!rels.length) { links.push({ target: m[1], rel: "", type: params.type || null, params }); continue; }
    for (const rel of rels) links.push({ target: m[1], rel, type: params.type || null, params });
  }
  return links;
}

/** Открива дублирани (rel, target) двойки. */
export function duplicateLinks(links) {
  const seen = new Map();
  const dups = [];
  for (const l of links) {
    const key = `${l.rel} ${l.target}`;
    if (seen.has(key)) dups.push(key);
    else seen.set(key, true);
  }
  return [...new Set(dups)];
}

// ---------------------------------------------------------------------------
// robots.txt (RFC 9309) + Content Signals
// ---------------------------------------------------------------------------

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  const unknown = [];
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) { unknown.push(rawLine.trim()); continue; }
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], allow: [], disallow: [], contentSignal: null, crawlDelay: null }; groups.push(current); }
      current.agents.push(value);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === "sitemap") { sitemaps.push(value); continue; }
    if (!current) { current = { agents: ["*"], allow: [], disallow: [], contentSignal: null, crawlDelay: null }; groups.push(current); }
    if (field === "allow") current.allow.push(value);
    else if (field === "disallow") current.disallow.push(value);
    else if (field === "crawl-delay") current.crawlDelay = value;
    else if (field === "content-signal") current.contentSignal = value;
    else unknown.push(`${field}: ${value}`);
  }
  return { groups, sitemaps, unknown };
}

/** Разбор на `search=yes, ai-train=no` → { search: "yes", ... } */
export function parseContentSignal(value) {
  const out = {};
  for (const part of String(value || "").split(",")) {
    const m = /^\s*([a-z-]+)\s*=\s*(yes|no)\s*$/i.exec(part);
    if (m) out[m[1].toLowerCase()] = m[2].toLowerCase();
  }
  return out;
}

/**
 * Прилага robots правилата към път (най-дългото съвпадение печели; при равна
 * дължина Allow побеждава — както при Google).
 */
export function robotsAllows(group, path) {
  if (!group) return true;
  const match = (patterns) => {
    let best = -1;
    for (const p of patterns) {
      if (!p) continue;
      const re = new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$"));
      if (re.test(path)) best = Math.max(best, p.length);
    }
    return best;
  };
  const a = match(group.allow);
  const d = match(group.disallow);
  if (d < 0) return true;
  if (a < 0) return false;
  return a >= d;
}

export function groupForAgent(parsed, agent) {
  const lower = String(agent || "*").toLowerCase();
  let star = null;
  for (const g of parsed.groups) {
    for (const a of g.agents) {
      const al = a.toLowerCase();
      if (al === lower) return g;
      if (al === "*") star = star || g;
    }
  }
  return star;
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

export function parseSitemap(xml) {
  const text = String(xml || "");
  const entries = [];
  const urlBlocks = text.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const block of urlBlocks) {
    const loc = (/<loc>([\s\S]*?)<\/loc>/.exec(block) || [])[1];
    const lastmod = (/<lastmod>([\s\S]*?)<\/lastmod>/.exec(block) || [])[1];
    const changefreq = (/<changefreq>([\s\S]*?)<\/changefreq>/.exec(block) || [])[1];
    const priority = (/<priority>([\s\S]*?)<\/priority>/.exec(block) || [])[1];
    const alternates = [...block.matchAll(/hreflang="([^"]+)"\s+href="([^"]+)"/g)].map((m) => ({ hreflang: m[1], href: m[2] }));
    if (loc) entries.push({ loc: loc.trim(), lastmod: lastmod ? lastmod.trim() : null, changefreq: changefreq || null, priority: priority || null, alternates });
  }
  return {
    entries,
    hasXmlDeclaration: /^\s*<\?xml/.test(text),
    hasNamespace: text.includes("http://www.sitemaps.org/schemas/sitemap/0.9"),
    hasStylesheet: /<\?xml-stylesheet/.test(text),
    bytes: text.length,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** Пълна проверка на sitemap срещу продукционния хост и частните маршрути. */
export function analyseSitemap(parsed, { origin, privateMatcher }) {
  const locs = parsed.entries.map((e) => e.loc);
  const counts = new Map();
  for (const l of locs) counts.set(l, (counts.get(l) || 0) + 1);
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([l]) => l);

  const invalid = [];
  const wrongHost = [];
  const privateUrls = [];
  const withQuery = [];
  const badLastmod = [];

  for (const e of parsed.entries) {
    let u = null;
    try { u = new URL(e.loc); } catch { invalid.push(e.loc); continue; }
    if (u.protocol !== "https:") invalid.push(e.loc);
    if (u.origin !== origin) wrongHost.push(e.loc);
    if (u.search) withQuery.push(e.loc);
    if (privateMatcher && privateMatcher(u.pathname)) privateUrls.push(e.loc);
    if (e.lastmod && !ISO_DATE.test(e.lastmod)) badLastmod.push(e.loc);
  }

  // Само валидните дати участват — иначе „вчера" би станало „най-нов lastmod".
  const lastmods = parsed.entries.map((e) => e.lastmod).filter((d) => d && ISO_DATE.test(d)).sort();
  const byType = {};
  for (const e of parsed.entries) {
    const p = (() => { try { return new URL(e.loc).pathname; } catch { return ""; } })();
    const t = classifySitemapPath(p);
    byType[t] = (byType[t] || 0) + 1;
  }

  return {
    total: parsed.entries.length,
    unique: counts.size,
    duplicates,
    invalid,
    wrongHost,
    privateUrls,
    withQuery,
    badLastmod,
    withLastmod: lastmods.length,
    newestLastmod: lastmods.length ? lastmods[lastmods.length - 1] : null,
    byType,
    overLimit: parsed.entries.length > 50000,
    bytesOverLimit: parsed.bytes > 50 * 1024 * 1024,
  };
}

export function classifySitemapPath(p) {
  if (p === "/" || p === "") return "home";
  if (/^\/procedures\/programs\/.+/.test(p)) return "programLanding";
  if (p === "/procedures/programs") return "programIndex";
  if (/^\/procedures\/status\/.+/.test(p)) return "statusLanding";
  if (/^\/procedures\/candidates\/.+/.test(p)) return "candidateLanding";
  if (/^\/procedures\/deadlines\/.+/.test(p)) return "deadlineLanding";
  if (/^\/procedures\/.+/.test(p)) return "procedure";
  if (/^\/(bg|en|de)(\/|$)/.test(p)) return "locale";
  return "static";
}

// ---------------------------------------------------------------------------
// HTML метаданни, JSON-LD, социални тагове, hreflang
// ---------------------------------------------------------------------------

const attr = (html, re) => { const m = re.exec(html); return m ? m[1].trim() : null; };

export function extractMetadata(html) {
  const h = String(html || "");
  const canonicals = [...h.matchAll(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/gi)].map((m) => m[1]);
  const h1s = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]*>/g, "").trim());
  const alternates = [...h.matchAll(/<link[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/gi)].map((m) => ({ hreflang: m[1], href: m[2] }));
  return {
    title: attr(h, /<title>([\s\S]*?)<\/title>/i),
    description: attr(h, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i),
    robots: attr(h, /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i),
    lang: attr(h, /<html[^>]+lang="([^"]*)"/i),
    canonical: canonicals[0] || null,
    canonicalCount: canonicals.length,
    h1: h1s[0] || null,
    h1Count: h1s.length,
    alternates,
    og: {
      title: attr(h, /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i),
      description: attr(h, /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i),
      type: attr(h, /<meta[^>]+property="og:type"[^>]+content="([^"]*)"/i),
      url: attr(h, /<meta[^>]+property="og:url"[^>]+content="([^"]*)"/i),
      image: attr(h, /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/i),
      imageAlt: attr(h, /<meta[^>]+property="og:image:alt"[^>]+content="([^"]*)"/i),
      siteName: attr(h, /<meta[^>]+property="og:site_name"[^>]+content="([^"]*)"/i),
      locale: attr(h, /<meta[^>]+property="og:locale"[^>]+content="([^"]*)"/i),
    },
    twitter: {
      card: attr(h, /<meta[^>]+name="twitter:card"[^>]+content="([^"]*)"/i),
      title: attr(h, /<meta[^>]+name="twitter:title"[^>]+content="([^"]*)"/i),
      description: attr(h, /<meta[^>]+name="twitter:description"[^>]+content="([^"]*)"/i),
    },
    jsonLd: extractJsonLd(h),
    bytes: h.length,
  };
}

export function extractJsonLd(html) {
  const blocks = [...String(html || "").matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  return blocks.map((m) => {
    try {
      const parsed = JSON.parse(m[1]);
      return { valid: true, type: parsed["@type"] || null, context: parsed["@context"] || null, data: parsed };
    } catch (e) {
      return { valid: false, type: null, context: null, error: String(e.message).slice(0, 120) };
    }
  });
}

/** Проверки върху JSON-LD блок: контекст, тип, продукционни URL-и, липсващи полета. */
export function validateJsonLd(block, { origin }) {
  const problems = [];
  if (!block.valid) return { type: null, problems: ["invalid_json"] };
  const ctx = String(block.context || "");
  if (!/schema\.org/.test(ctx)) problems.push("context");
  if (!block.type) problems.push("missing_type");
  const json = JSON.stringify(block.data || {});
  for (const m of json.matchAll(/"(https?:\/\/[^"]+)"/g)) {
    const v = m[1];
    if (/localhost|127\.0\.0\.1|workers\.dev/.test(v)) problems.push("non_production_url");
    else if (v.startsWith("http://")) problems.push("insecure_url");
  }
  if (/aggregateRating|reviewCount|ratingValue/.test(json)) problems.push("rating_without_source");
  const required = { MonetaryGrant: ["name"], BreadcrumbList: ["itemListElement"], Organization: ["name"], WebSite: ["name", "url"] };
  for (const f of required[block.type] || []) {
    if (block.data && (block.data[f] == null || block.data[f] === "")) problems.push(`missing_${f}`);
  }
  return { type: block.type, problems: [...new Set(problems)] };
}

/** Езиков код валиден ли е (BCP 47, опростено) + x-default. */
export function isValidHreflang(code) {
  const c = String(code || "").trim();
  if (c === "x-default") return true;
  return /^[a-z]{2,3}(-[A-Za-z]{2,4})?(-[A-Za-z]{2}|-\d{3})?$/.test(c);
}

// ---------------------------------------------------------------------------
// Markdown „смислено съдържание"
// ---------------------------------------------------------------------------

/**
 * Разпознава празна SPA обвивка, представена като markdown. Изисква реални
 * заглавия, достатъчно текст и връзки — не само frontmatter.
 */
export function analyseMarkdown(text) {
  const s = String(text || "");
  const body = s.replace(/^---[\s\S]*?\n---\n/, "");
  const headings = (body.match(/^#{1,6} .+$/gm) || []).length;
  const links = (body.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  const tableRows = (body.match(/^\|.+\|$/gm) || []).length;
  const words = body.split(/\s+/).filter(Boolean).length;
  const hasFrontmatter = /^---\n[\s\S]*?\n---/.test(s);
  const looksLikeHtml = /<html|<!doctype|<div|<script/i.test(body);
  const meaningful = headings >= 1 && words >= 60 && !looksLikeHtml;
  return { bytes: s.length, headings, links, tableRows, words, hasFrontmatter, looksLikeHtml, meaningful };
}

/** Търси в текст следи от лични/административни данни, които не бива да изтичат. */
export function detectLeakage(text) {
  const s = String(text || "");
  const found = [];
  if (/\/api\/admin|\/api\/internal/.test(s)) found.push("admin_route");
  if (/\bsk-[A-Za-z0-9_-]*[A-Za-z0-9]{20,}[A-Za-z0-9_-]*\b|AIza[0-9A-Za-z_-]{20,}/.test(s)) found.push("api_key");
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./.test(s)) found.push("jwt");
  if (/"?(client_secret|AUTH_SECRET|MASTER_KEY|private_jwk)"?\s*[:=]/i.test(s)) found.push("secret_field");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)) found.push("private_key");
  return found;
}

// ---------------------------------------------------------------------------
// SVCB / HTTPS записи (RFC 9460)
// ---------------------------------------------------------------------------

// Резолверите връщат SVCB в ДВА различни вида и това не е по избор на клиента:
//   • Google (dns.google) дава презентационен вид:
//       1 euro-funds.eu. alpn=h2,h3 port=443
//   • Cloudflare (cloudflare-dns.com) дава суров RFC 3597 вид:
//       \# 33 00 01 0a 65 75 72 6f ... 00 01 00 06 02 68 32 02 68 33 ...
// Търсене на низа „alpn" работи само в първия и мълчаливо се проваля във втория.
// Затова тук се разбират и двата.

const SVCB_KEYS = {
  mandatory: 0, alpn: 1, "no-default-alpn": 2, port: 3,
  ipv4hint: 4, ech: 5, ipv6hint: 6, dohpath: 7, ohttp: 8,
};
export const SVCB_KEY_NAMES = Object.fromEntries(Object.entries(SVCB_KEYS).map(([k, v]) => [v, k]));

function parseSvcbWire(text) {
  const hex = text.replace(/^\\#\s*\d+\s*/, "").replace(/\s+/g, "");
  if (!hex || hex.length % 2 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  if (b.length < 3) return null;

  let o = 0;
  const priority = (b[o] << 8) | b[o + 1];
  o += 2;

  // TargetName — некомпресирано DNS име (RFC 9460 §2.2: без указатели).
  const labels = [];
  while (o < b.length) {
    const len = b[o++];
    if (!len) break;
    if (len > 63 || o + len > b.length) return null;
    labels.push(String.fromCharCode(...b.slice(o, o + len)));
    o += len;
  }
  const target = labels.length ? labels.join(".") + "." : ".";

  const keys = [];
  const params = {};
  while (o + 4 <= b.length) {
    const key = (b[o] << 8) | b[o + 1];
    const len = (b[o + 2] << 8) | b[o + 3];
    o += 4;
    if (o + len > b.length) return null;
    const val = b.slice(o, o + len);
    o += len;
    keys.push(key);
    if (key === SVCB_KEYS.alpn) {
      const alpn = [];
      let p = 0;
      while (p < val.length) {
        const n = val[p++];
        if (p + n > val.length) break;
        alpn.push(String.fromCharCode(...val.slice(p, p + n)));
        p += n;
      }
      params.alpn = alpn;
    } else if (key === SVCB_KEYS.port && len === 2) {
      params.port = (val[0] << 8) | val[1];
    }
  }
  return { priority, target, keys, params };
}

function parseSvcbPresentation(text) {
  const m = /^(\d+)\s+(\S+)\s*(.*)$/.exec(text);
  if (!m) return null;
  const keys = [];
  const params = {};
  const re = /([a-zA-Z][a-zA-Z0-9-]*|key\d+)(?:=("?)([^"\s]*)\2)?/g;
  let x;
  while ((x = re.exec(m[3] || ""))) {
    const name = x[1].toLowerCase();
    const value = x[3] || "";
    const numeric = /^key(\d+)$/.exec(name);
    const key = numeric ? Number(numeric[1]) : SVCB_KEYS[name];
    if (key != null) keys.push(key);
    if (name === "alpn") params.alpn = value.split(",").filter(Boolean);
    else if (name === "port") params.port = Number(value);
  }
  return { priority: Number(m[1]), target: m[2], keys, params };
}

/**
 * Разбира един SVCB/HTTPS запис независимо в кой вид го е върнал резолверът.
 * Връща { priority, target, keys: [номера], params: { alpn, port } } или null.
 * priority === 0 значи AliasMode — такъв запис НЕ носи параметри.
 */
export function parseSvcbRecord(data) {
  const text = String(data == null ? "" : data).trim();
  if (!text) return null;
  return text.startsWith("\\#") ? parseSvcbWire(text) : parseSvcbPresentation(text);
}
