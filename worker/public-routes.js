import { codeSlug } from '../app/lib/slug.js';

export const RESERVED = new Set(['programs', 'status', 'candidates', 'deadlines', 'countries']);
export const programKey = p => JSON.stringify([p.country_code || '', p.source_id || '', p.program]);

export async function routeSuffix(key) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

// All callers share the same allocation rule. Existing routes are never reassigned.
export async function allocateRoutes(entities, existing = [], legacyOwners = new Map()) {
  const byKey = new Map(existing.map(r => [r.kind + ':' + r.entity_id, r]));
  const used = new Set(existing.map(r => r.kind + ':' + r.slug));
  for (const slug of RESERVED) used.add('procedure:' + slug);
  const additions = [];
  // Backfill old winners first. New records always get a digest suffix so arrivals
  // cannot steal an established route or depend on database enumeration order.
  const sorted = [...entities].sort((a,b) => Number(legacyOwners.get(b.kind+':'+codeSlug(b.label)) === b.entity_id) - Number(legacyOwners.get(a.kind+':'+codeSlug(a.label)) === a.entity_id) || a.entity_id.localeCompare(b.entity_id));
  for (const e of sorted) {
    const key = e.kind + ':' + e.entity_id;
    if (byKey.has(key)) continue;
    const base = codeSlug(e.label) || e.kind;
    const digest = await routeSuffix(key);
    let slug = legacyOwners.get(e.kind + ':' + base) === e.entity_id && !used.has(e.kind + ':' + base) ? base : `${base}-${digest.slice(0,16)}`;
    if (used.has(e.kind + ':' + slug)) slug = `${base}-${digest}`;
    if (used.has(e.kind + ':' + slug)) throw new Error('Public route collision: ' + key);
    const r = { kind: e.kind, entity_id: e.entity_id, slug };
    used.add(e.kind + ':' + slug); byKey.set(key,r); additions.push(r);
  }
  return additions;
}

export function routeEntities(projects) {
  const entries = new Map();
  for (const p of projects) {
    entries.set('procedure:'+p.id, {kind:'procedure', entity_id:p.id, label:p.id});
    if (p.program) entries.set('program:'+programKey(p), {kind:'program', entity_id:programKey(p), label:p.program});
  }
  return [...entries.values()];
}

export async function ensurePublicRoutes(env) {
  // Promise is request-scoped (the router copies env), never an isolate-wide DB cache.
  if (env.publicRoutesReady) return env.publicRoutesReady;
  env.publicRoutesReady = (async () => {
    const {results: missing} = await env.DB.prepare(`SELECT id, program, country_code, source_id FROM public_projects WHERE public_slug IS NULL OR (program IS NOT NULL AND program != '' AND program_slug IS NULL)`).all();
    if (!missing.length) return;
    const {results: existing} = await env.DB.prepare('SELECT kind, entity_id, slug FROM public_routes').all();
    const additions = await allocateRoutes(routeEntities(missing), existing);
    for (let i=0; i<additions.length; i+=80) {
      await env.DB.batch(additions.slice(i,i+80).map(r => env.DB.prepare('INSERT INTO public_routes(kind, entity_id, slug) VALUES (?1,?2,?3) ON CONFLICT(kind,entity_id) DO NOTHING').bind(r.kind,r.entity_id,r.slug)));
    }
  })();
  return env.publicRoutesReady;
}

export async function findPublicProcedure(env, slug) {
  await ensurePublicRoutes(env);
  // Exact ID first: raw IDs are case-sensitive and can contain punctuation.
  const exact = await env.DB.prepare('SELECT * FROM public_projects WHERE id = ?1').bind(slug).first();
  if (exact) return exact;
  return env.DB.prepare(`SELECT * FROM public_projects WHERE public_slug = ?1 OR id IN (SELECT entity_id FROM public_route_aliases WHERE kind='procedure' AND alias=?1)`).bind(slug).first();
}
