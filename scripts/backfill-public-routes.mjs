// Usage: node scripts/backfill-public-routes.mjs inventory.json crawl.json output.sql
// Inputs are read-only public inventory and a live crawl of legacy URL identities.
import fs from 'node:fs';
import { allocateRoutes, routeEntities } from '../worker/public-routes.js';
import { codeSlug } from '../app/lib/slug.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const [inventory,crawl,output]=process.argv.slice(2);
if(!inventory||!crawl||!output) throw new Error('Expected inventory, crawl, output SQL paths');
const raw=read(inventory), rows=raw[0]?.results || raw;
const owners=new Map();
for(const p of read(crawl).pages) {
  const entity=p.jsonld?.find(j=>j['@type']==='MonetaryGrant' && j.identifier);
  if(entity) owners.set('procedure:'+new URL(p.url).pathname.split('/').pop(),entity.identifier);
}
const entities=routeEntities(rows);
// Legacy program pages grouped all countries/sources. Keep their route for the
// first deterministic scoped group and give the other groups independent URLs.
for(const e of entities.filter(e=>e.kind==='program').sort((a,b)=>a.entity_id.localeCompare(b.entity_id))) {
  const key=e.kind+':'+codeSlug(e.label); if(!owners.has(key)) owners.set(key,e.entity_id);
}
const routes=await allocateRoutes(entities,[],owners);
if(routes.filter(r=>r.kind==='procedure').length!==rows.length) throw new Error('Inventory coverage mismatch');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const sql=routes.map(r=>`INSERT INTO public_routes(kind,entity_id,slug) VALUES (${quote(r.kind)},${quote(r.entity_id)},${quote(r.slug)}) ON CONFLICT(kind,entity_id) DO NOTHING;`).join('\n');
fs.writeFileSync(output,sql+'\n');
console.log(JSON.stringify({records:rows.length,routes:routes.length,preserved:routes.filter(r=>owners.get(r.kind+':'+r.slug)===r.entity_id).length}));
