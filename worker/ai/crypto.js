// AES-256-GCM криптиране на AI API ключове (само server-side, WebCrypto).
// Master key: Cloudflare secret AI_CREDENTIALS_MASTER_KEY (base64, 32 байта) —
// НЕ е в D1, НЕ е във frontend bundle, НЕ се връща от API, НЕ се логва.
// WebCrypto AES-GCM влага auth tag-а в края на ciphertext-а → encryption_tag = null.

const te = new TextEncoder();
const td = new TextDecoder();

function b64encode(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function isCryptoConfigured(env) {
  return typeof env.AI_CREDENTIALS_MASTER_KEY === "string" && env.AI_CREDENTIALS_MASTER_KEY.length >= 32;
}

async function importMasterKey(env) {
  if (!isCryptoConfigured(env)) throw new Error("master_key_not_configured");
  // Приема base64 (32 байта) или суров низ ≥32 знака (хешира се до 256 бита).
  let raw;
  try {
    const decoded = b64decode(env.AI_CREDENTIALS_MASTER_KEY.trim());
    raw = decoded.length === 32 ? decoded : new Uint8Array(await crypto.subtle.digest("SHA-256", decoded));
  } catch {
    raw = new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(env.AI_CREDENTIALS_MASTER_KEY)));
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Криптира plain text ключ → { ciphertext, iv } (base64). */
export async function encryptSecret(env, plaintext) {
  const key = await importMasterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(plaintext));
  return { ciphertext: b64encode(ct), iv: b64encode(iv) };
}

/** Декриптира (само server-side; никога не се връща към браузъра). */
export async function decryptSecret(env, ciphertextB64, ivB64) {
  const key = await importMasterKey(env);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64decode(ivB64) }, key, b64decode(ciphertextB64));
  return td.decode(pt);
}

/** Стабилен fingerprint (SHA-256 hex, първите 16 знака) — за одит без разкриване. */
export async function fingerprintSecret(plaintext) {
  const d = await crypto.subtle.digest("SHA-256", te.encode(plaintext));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Редакция на тайни в текст за логове (sk-…, api keys, bearer, заглавки). */
export function redactSecrets(text) {
  if (!text) return text;
  return String(text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-••••")
    .replace(/(x-api-key\s*[:=]\s*)\S+/gi, "$1••••")
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?\S+/gi, "$1$2••••")
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9_-]{8,}/gi, "$1••••");
}
