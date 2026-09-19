import { b64urlFromBytes, bytesFromB64url, sha256hex } from '../util.js';

export class PushError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const pushError = (code, status) => new PushError(code, status);

function decode(value, size) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw pushError('invalid_subscription');
  let bytes;
  try { bytes = bytesFromB64url(value); } catch { throw pushError('invalid_subscription'); }
  if (bytes.length !== size || b64urlFromBytes(bytes) !== value) throw pushError('invalid_subscription');
  return bytes;
}

// Only browser-operated push services are valid destinations. Redirects are
// forbidden at send time; arbitrary URLs and private-network addresses never run.
export function validateEndpoint(value) {
  let u;
  try { u = new URL(value); } catch { throw pushError('invalid_subscription'); }
  const host = u.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
    host === 'updates.push.services.mozilla.com' ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (typeof value !== 'string' || value.length > 2048 || !allowed || u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || u.pathname === '/') {
    throw pushError('invalid_subscription');
  }
  return u.href;
}

export async function validateSubscription(body) {
  if (!body || typeof body !== 'object') throw pushError('invalid_subscription');
  if(Object.keys(body).some(key=>!['endpoint','expirationTime','keys','countryCode','replacesEndpointHash'].includes(key)))throw pushError('invalid_subscription');
  if(body.replacesEndpointHash!=null&&!/^[a-f0-9]{64}$/.test(body.replacesEndpointHash))throw pushError('invalid_subscription');
  const endpoint = validateEndpoint(body.endpoint);
  const p256dh = decode(body.keys?.p256dh, 65);
  decode(body.keys?.auth, 16);
  if (p256dh[0] !== 4) throw pushError('invalid_subscription');
  try { await crypto.subtle.importKey('raw', p256dh, {name:'ECDH',namedCurve:'P-256'}, false, []); }
  catch { throw pushError('invalid_subscription'); }
  const expiration = body.expirationTime;
  if (expiration != null && (!Number.isSafeInteger(expiration) || expiration <= Date.now())) throw pushError('expired_subscription');
  return {endpoint, endpointHash:await sha256hex(endpoint), p256dh:body.keys.p256dh, auth:body.keys.auth, expiration:expiration ?? null};
}

export function safeNotificationUrl(value, origin = 'https://euro-funds.eu') {
  try {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return '/profile';
    const u = new URL(value, origin);
    if (u.origin !== new URL(origin).origin || /^\/(api|admin)(\/|$)/.test(u.pathname)) return '/profile';
    return u.pathname + u.search + u.hash;
  } catch { return '/profile'; }
}

export function notificationPayload(type, data = {}) {
  if (!['test','change','deadline','country'].includes(type)) throw pushError('invalid_notification');
  const clean = (v, max) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').slice(0,max);
  return {type, title:clean(data.title || 'Euro-Funds',100), body:clean(data.body,240), url:safeNotificationUrl(data.url), timestamp:new Date().toISOString()};
}

export async function readVapid(env) {
  let stage='missing_binding';
  try {
    if (!env.WEB_PUSH_VAPID_PRIVATE_JWK || !env.WEB_PUSH_VAPID_PUBLIC_KEY || !env.WEB_PUSH_VAPID_SUBJECT) throw Error();
    stage='private_jwk_json';
    const privateInput=env.WEB_PUSH_VAPID_PRIVATE_JWK.trim();
    let jwk;
    if (/^[A-Za-z0-9_-]{43}$/.test(privateInput)) {
      // Some VAPID generators export the private scalar instead of a JWK.
      // Normalize it only on the server and still verify the full key pair below.
      stage='private_scalar_encoding';
      decode(privateInput,32);
      const point=decode(env.WEB_PUSH_VAPID_PUBLIC_KEY,65);
      jwk={kty:'EC',crv:'P-256',d:privateInput,x:b64urlFromBytes(point.slice(1,33)),y:b64urlFromBytes(point.slice(33))};
    } else jwk=JSON.parse(privateInput);
    stage='private_jwk_curve';
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw Error();
    stage='private_jwk_encoding';
    const x=decode(jwk.x,32), y=decode(jwk.y,32); decode(jwk.d,32);
    stage='public_key_encoding';
    const raw=decode(env.WEB_PUSH_VAPID_PUBLIC_KEY,65);
    const expected=new Uint8Array([4,...x,...y]);
    stage='public_key_mismatch';
    if (b64urlFromBytes(expected) !== b64urlFromBytes(raw)) throw Error();
    stage='subject_format';
    const subject=new URL(env.WEB_PUSH_VAPID_SUBJECT);
    if (!['https:','mailto:'].includes(subject.protocol) || subject.username || subject.password) throw Error();
    stage='private_key_import';
    const privateKey=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y,d:jwk.d},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
    stage='public_key_import';
    const publicKey=await crypto.subtle.importKey('raw',raw,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const message=new TextEncoder().encode('Euro-Funds VAPID configuration check');
    stage='private_key_sign';
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,message);
    stage='key_pair_verification';
    if (!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,signature,message)) throw Error();
    return {publicKey:env.WEB_PUSH_VAPID_PUBLIC_KEY,privateKey:jwk.d,subject:env.WEB_PUSH_VAPID_SUBJECT,fingerprint:await sha256hex(env.WEB_PUSH_VAPID_PUBLIC_KEY)};
  } catch { console.error('push_configuration_invalid',stage); throw pushError('push_not_configured',503); }
}

export async function readPushJson(request) {
  if (!/application\/json/i.test(request.headers.get('content-type') || '')) throw pushError('invalid_body');
  const reader=request.body?.getReader();
  if (!reader) throw pushError('invalid_body');
  let text='', size=0;
  const decoder=new TextDecoder();
  while (true) {
    const {done,value}=await reader.read();
    if (done) break;
    size+=value.byteLength;
    if (size>8192) { await reader.cancel(); throw pushError('body_too_large',413); }
    text+=decoder.decode(value,{stream:true});
  }
  try { return JSON.parse(text+decoder.decode()); } catch { throw pushError('invalid_body'); }
}
