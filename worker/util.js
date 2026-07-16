// Помощни функции за Worker-а (Web Crypto, бисквитки, отговори).
// Без Node-only зависимости — всичко работи в Cloudflare Workers.

export const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
export const ok = (data = {}, headers = {}) => json({ ok: true, ...data }, 200, headers);
export const err = (code, status = 400, headers = {}) => json({ ok: false, error: code }, status, headers);

export function nowISO() {
  return new Date().toISOString();
}
export function isoPlusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
export function uuid() {
  return crypto.randomUUID();
}

// ---- base64url ----
export function b64urlFromBytes(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function bytesFromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64urlFromString(s) {
  return b64urlFromBytes(new TextEncoder().encode(s));
}
export function stringFromB64url(s) {
  return new TextDecoder().decode(bytesFromB64url(s));
}

// ---- random ----
export function randomToken(nBytes = 32) {
  const b = new Uint8Array(nBytes);
  crypto.getRandomValues(b);
  return b64urlFromBytes(b);
}

// ---- hashing / hmac ----
export async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Хеш на сесиен токен: keyed (HMAC с AUTH_SECRET), за да не стига само изтичане на БД.
export async function hashSessionToken(secret, token) {
  return hmacHex(secret || "dev-insecure-secret", token);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- cookies ----
export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function serializeCookie(name, value, opts = {}) {
  const p = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge != null) p.push(`Max-Age=${opts.maxAge}`);
  if (opts.expires) p.push(`Expires=${opts.expires}`);
  p.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly !== false) p.push("HttpOnly");
  if (opts.secure) p.push("Secure");
  p.push(`SameSite=${opts.sameSite || "Lax"}`);
  return p.join("; ");
}

// Продукция ли е? (https origin) — за Secure бисквитки.
export function isSecure(url) {
  return url.protocol === "https:";
}

// Валидиране на return-to срещу open-redirect: приемаме само относителни пътища
// в рамките на приложението (започващи с една наклонена черта, без //).
export function safeReturnTo(value, fallback = "/") {
  if (typeof value !== "string" || !value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("://")) return fallback;
  return value;
}
