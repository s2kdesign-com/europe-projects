// Google OAuth 2.0 / OpenID Connect — authorization code + PKCE, сървърна размяна
// на кода и проверка на ID токена чрез Google JWKS. Само Web Crypto.

import { b64urlFromBytes, randomToken } from "./util.js";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const SCOPES = "openid email profile"; // само базова идентичност

export function callbackUrl(requestUrl, env) {
  const base = (env.APP_URL || `${requestUrl.protocol}//${requestUrl.host}`).replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
}

export async function createPkce() {
  const verifier = randomToken(32); // ~43 символа base64url
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = b64urlFromBytes(digest);
  return { verifier, challenge };
}

export function buildAuthUrl(env, { state, nonce, challenge, redirectUri }) {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

export async function exchangeCode(env, { code, verifier, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error("token_exchange_failed");
  return res.json();
}

// --- JWKS кеш (в рамките на изолата) ---
let jwksCache = { keys: null, exp: 0 };
async function getJwk(kid) {
  if (!jwksCache.keys || Date.now() > jwksCache.exp) {
    const res = await fetch(JWKS_URI);
    if (!res.ok) throw new Error("jwks_fetch_failed");
    const data = await res.json();
    // Google връща Cache-Control; по-просто: кешираме за 1 час.
    jwksCache = { keys: data.keys || [], exp: Date.now() + 3600 * 1000 };
  }
  return jwksCache.keys.find((k) => k.kid === kid);
}

function decodeSegment(seg) {
  const pad = seg.length % 4 === 0 ? "" : "=".repeat(4 - (seg.length % 4));
  const bin = atob(seg.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function jsonSegment(seg) {
  return JSON.parse(new TextDecoder().decode(decodeSegment(seg)));
}

// Проверява подпис (RS256 през JWKS) и задължителните claim-ове.
export async function verifyIdToken(env, idToken, expectedNonce) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("idtoken_malformed");
  const header = jsonSegment(parts[0]);
  if (header.alg !== "RS256") throw new Error("idtoken_alg");
  const jwk = await getJwk(header.kid);
  if (!jwk) throw new Error("idtoken_kid");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = decodeSegment(parts[2]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!valid) throw new Error("idtoken_signature");

  const claims = jsonSegment(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.includes(claims.iss)) throw new Error("idtoken_iss");
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error("idtoken_aud");
  if (typeof claims.exp !== "number" || claims.exp < now - 5) throw new Error("idtoken_expired");
  if (claims.iat && claims.iat > now + 300) throw new Error("idtoken_iat");
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error("idtoken_nonce");
  if (!claims.email) throw new Error("idtoken_no_email");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new Error("email_not_verified");
  return claims;
}
