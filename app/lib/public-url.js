// Canonical slugs are assigned once in public_routes, never derived by truncating IDs.
export function procedurePath(p) {
  return '/procedures/' + (p.public_slug || encodeURIComponent(p.id));
}
export function officialSource(p) {
  for (const value of [p.official_url, p.link]) {
    try { const u = new URL(value); if (['http:', 'https:'].includes(u.protocol)) return u.href; } catch {}
  }
  return null;
}
export function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c'); }
