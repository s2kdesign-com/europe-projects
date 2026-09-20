import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { allocateRoutes, routeEntities, ensurePublicRoutes, findPublicProcedure } from '../worker/public-routes.js';
import { generateSitemap } from '../worker/sitemap.js';
import { renderProcedureHTML, renderProcedureShell, handleProcedurePage, handleCountryLanding } from '../worker/procedure-page.js';
import { procedurePath, officialSource } from '../app/lib/public-url.js';
import { directoryHtml } from '../worker/public-directory.js';
import { executeCheck } from '../worker/discovery/validation.js';
import { CURRENT_CHECKS_SQL } from '../worker/discovery/handlers.js';
import { classifySitemapPath } from '../worker/discovery/parsers.js';
import { procedureMetadata, programMetadata } from '../worker/seo-metadata.js';
import { needsDeadlineReview } from '../app/lib/deadline-review.js';

const test = typeof it === 'function' ? it : async(name,fn)=>{await fn();console.log('ok - '+name);};
function fixture(rows) {
  const db=new DatabaseSync(':memory:');
  const fields='id,name,program,priority,category,status,deadline,deadline_date,budget,budget_amount_eur,eligible,link,notes,is_new,first_seen,last_updated,year,country_code,official_url,managing_authority,original_language,source_id'.split(',');
  db.exec(`CREATE TABLE projects (${fields.map(f=>f+' TEXT'+(f==='id'?' PRIMARY KEY':'')).join(',')}); CREATE TABLE documents (id INTEGER, project_id TEXT, title TEXT,doc_type TEXT,content TEXT,source_url TEXT);`);
  db.exec(fs.readFileSync(new URL('../migrations/0026_public_routes.sql',import.meta.url),'utf8'));
  for(const r of rows) db.prepare(`INSERT INTO projects (${fields}) VALUES (${fields.map(()=>'?')})`).run(...fields.map(f=>r[f]??null));
  const prepare=sql=>{
    let values=[];
    const stmt={bind(...v){values=v;return stmt;},async all(){const args=[];const q=sql.replace(/\?(\d+)/g,(_,i)=>{args.push(values[Number(i)-1]);return '?';});return {results:db.prepare(q).all(...args)};},async first(){return (await stmt.all()).results[0]||null;},async run(){return stmt.all();}};return stmt;
  };
  return {env:{ASSETS:{fetch:async()=>new Response('<html><head><title>List</title></head><body><div id="procedure-bootstrap"></div></body></html>')},DB:{prepare,batch:qs=>Promise.all(qs.map(q=>q.run()))}},db};
}
const common={country_code:'BG',source_id:'source',program:'Programme',name:'Same call title',status:'open',last_updated:'2026-09-17',original_language:'en',official_url:'https://example.org/call'};
const rows=[{...common,id:'x'.repeat(60)+'AAA'},{...common,id:'x'.repeat(60)+'BBB'},{...common,id:'BG:MixedCase:Call'},{...common,id:'programs'}];

await test('Procedure shell preserves app assets, replaces list metadata and safely preloads public detail',()=>{
  const shell='<html><head><title>List</title><meta name="description" content="List"><meta property="og:url" content="https://euro-funds.eu/procedures"><link rel="canonical" href="https://euro-funds.eu/procedures"><link rel="stylesheet" href="/_next/app.css"><script src="/_next/app.js" async></script></head><body><div id="procedure-bootstrap"></div><main>Dashboard</main></body></html>';
  const p={...common,id:'DE:call',public_slug:'de-call',name:'$& </script><script>alert(1)</script>'};
  const documents=[{id:1,title:'Guidelines',content:'Full public details </script>',source_url:'https://example.org/doc'}];
  const doc=new JSDOM(renderProcedureShell(shell,p,documents)).window.document;
  assert.equal(doc.querySelectorAll('title').length,1);
  assert.equal(doc.querySelectorAll('link[rel=canonical]').length,1);
  assert.equal(doc.querySelector('link[rel=canonical]').href,'https://euro-funds.eu/procedures/de-call');
  assert.ok(doc.querySelector('link[href="/_next/app.css"]'));
  assert.ok(doc.querySelector('script[src="/_next/app.js"]'));
  assert.equal(doc.querySelector('#procedure-title').textContent,p.name);
  assert.deepEqual(JSON.parse(doc.querySelector('#procedure-data').textContent),{project:p,documents,ok:true});
  assert.equal(doc.querySelectorAll('script:not([type]):not([src])').length,0);
  assert.equal(doc.querySelectorAll('style').length,0);
  assert.throws(()=>renderProcedureShell('<html></html>',p,[]),/missing_bootstrap/);
});

await test('Missing procedure is a real 404 and unavailable shell is a non-cacheable 503',async()=>{
  const {env,db}=fixture(rows);
  const missing=new URL('https://euro-funds.eu/procedures/missing');
  assert.equal((await handleProcedurePage(new Request(missing),env,missing)).status,404);
  const p=await findPublicProcedure(env,rows[0].id);
  env.ASSETS.fetch=async()=>new Response('Unavailable',{status:503});
  const url=new URL('https://euro-funds.eu'+procedurePath(p)+'?fbclid=test');
  const response=await handleProcedurePage(new Request(url),env,url);
  assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
  db.close();
});

await test('Current audit replaces retired samples and retains other categories after partial runs',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE agent_readiness_runs(id TEXT PRIMARY KEY, status TEXT, started_at TEXT);
    CREATE TABLE agent_readiness_check_results(id INTEGER PRIMARY KEY,run_id TEXT,category TEXT,check_code TEXT,resource_url TEXT,status TEXT,sequence INTEGER);
    INSERT INTO agent_readiness_runs VALUES ('old','completed','2026-07-01'),('full','completed','2026-09-01'),('partial','completed','2026-09-02'),('active','running','2026-09-03');
    INSERT INTO agent_readiness_check_results VALUES
    (1,'old','metadata','metadata:/retired','/retired','failed',1),
    (2,'old','social','social.image',NULL,'failed',2),
    (3,'full','metadata','metadata:/current','/current','passed',1),
    (4,'full','social','social.image','/og-image.png','passed',2),
    (5,'full','sitemap','sitemap','/sitemap.xml','passed',3),
    (6,'partial','sitemap','sitemap','/sitemap.xml','failed',1),
    (7,'active','metadata','metadata:/current','/current','passed',1);`);
  assert.deepEqual(db.prepare(CURRENT_CHECKS_SQL).all().map(r=>r.id).sort(),[3,4,6]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM agent_readiness_check_results').get().n,7);
  db.close();
});
await test('Country pagination is never counted as a procedure',()=>{
  for(const path of ['/procedures/countries/bg','/procedures/countries/lt/page/2'])assert.equal(classifySitemapPath(path),'countryLanding');
  assert.equal(classifySitemapPath('/procedures/real-call'),'procedure');
});
await test('Concise metadata keeps editions and distinguishes duplicates and page types',()=>{
  const peers=rows.map((r,i)=>({...r,name:'Same lengthy introductory words '.repeat(7)+' edition '+(i<2?'2026':i)}));
  const meta=peers.map(p=>procedureMetadata(p,peers));
  assert.equal(new Set(meta.map(m=>m.title)).size,peers.length);
  for(const m of meta){assert.ok(m.title.length<=120);assert.ok(m.description.length<=210);assert.ok(!m.title.includes('x'.repeat(60)));}
  const p={...common,name:'LIFE',program:'LIFE',program_slug:'life'};
  assert.notEqual(procedureMetadata(p).title,programMetadata(p,[p]).title);
  assert.match(meta[0].title,/2026/);
});
await test('Elapsed deadline warns without declaring rolling or multi-window calls closed',()=>{
  const p={status:'open',deadline_date:'2026-09-14',deadline:'First window September; second March 2027'};
  assert.equal(needsDeadlineReview(p,new Date('2026-09-19')),true);
  assert.equal(p.status,'open');
  assert.equal(needsDeadlineReview({...p,deadline_date:'2026-09-19'},new Date('2026-09-19')),false);
  assert.equal(needsDeadlineReview({...p,deadline_date:'2026-02-30'}),false);
  assert.equal(needsDeadlineReview({...p,status:'closed'}),false);
});

await test('Registry preserves the old winner and permanently separates collisions and reserved routes',async()=>{
  const old=new Map([['procedure:'+'x'.repeat(60),rows[1].id]]);
  const routes=await allocateRoutes(routeEntities(rows),[],old);
  assert.equal(routes.find(r=>r.entity_id===rows[1].id).slug,'x'.repeat(60));
  assert.equal(new Set(routes.map(r=>r.kind+':'+r.slug)).size,routes.length);
  assert.notEqual(routes.find(r=>r.entity_id==='programs').slug,'programs');
  assert.deepEqual(await allocateRoutes(routeEntities([...rows].reverse()),routes),[]);
});
await test('Real SQLite migration, lazy registration, exact raw IDs and canonical identities agree',async()=>{
  const {env,db}=fixture(rows);await ensurePublicRoutes(env);
  for(const r of rows){const p=await findPublicProcedure(env,r.id);assert.equal((await findPublicProcedure(env,p.public_slug)).id,r.id); const res=await handleProcedurePage(new Request('https://euro-funds.eu'+procedurePath(p)),env,new URL('https://euro-funds.eu'+procedurePath(p)));assert.equal(res.status,200);assert.match(await res.text(),new RegExp('"identifier":"'+r.id+'"'));}
  const raw=new URL('https://euro-funds.eu/procedures/'+encodeURIComponent(rows[2].id));
  assert.equal((await handleProcedurePage(new Request(raw),env,raw)).status,301);
  db.close();
});
await test('Sitemap has strict XML, unique routes and more than 2000 records without truncation',async()=>{
  const inventory=Array.from({length:2105},(_,i)=>({...common,id:'call-'+i}));
  const {env,db}=fixture(inventory);const res=await generateSitemap(env);assert.equal(res.status,200);
  const doc=new JSDOM(await res.text(),{contentType:'application/xml'}).window.document;
  const locs=[...doc.querySelectorAll('loc')].map(n=>n.textContent);
  assert.equal(locs.length,new Set(locs).size);
  for(const r of (await env.DB.prepare('SELECT * FROM public_projects').all()).results) assert.ok(locs.includes('https://euro-funds.eu'+procedurePath(r)));
  assert.equal(doc.querySelectorAll('parsererror').length,0);
  const plain = await generateSitemap(env, 'text');
  assert.equal(plain.status,200);assert.match(plain.headers.get('content-type'),/^text\/plain/);
  assert.deepEqual((await plain.text()).trim().split('\n'),locs);
  db.close();
});
await test('Database failure returns retryable 503 and never an incomplete 200 sitemap',async()=>{
  const res=await generateSitemap({DB:{prepare(){throw Error('outage')}}});assert.equal(res.status,503);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('retry-after'),'300');
  assert.equal((await generateSitemap({DB:{prepare(){throw Error('outage')}}},'text')).status,503);
});
await test('Sources, JSON-LD semantics, language and hostile script text are handled truthfully',()=>{
  const p={...rows[0],public_slug:'call',name:'A </script><script>alert(1)</script>',eligible:'SMEs',deadline_date:'2026-10-01'};
  const html=renderProcedureHTML(p,[]);const doc=new JSDOM(html).window.document;
  const data=[...doc.querySelectorAll('script[type="application/ld+json"]')].map(n=>JSON.parse(n.textContent));
  const grant=data.find(n=>n['@type']==='MonetaryGrant');assert.equal(grant.identifier,p.id);assert.ok(!grant.inLanguage&&!grant.audience&&!grant.validThrough&&!grant.funder);
  assert.equal(data.find(n=>n['@type']==='WebPage').inLanguage,'en');assert.match(html,/en_US/);
  assert.equal(doc.querySelectorAll('script:not([type])').length,0);assert.ok(doc.querySelector('a[href="https://example.org/call"]'));
  assert.equal(officialSource({official_url:'javascript:alert(1)',link:'https://example.org'}),'https://example.org/');
});
await test('Visible directory navigation reaches paginated, canonical country listings',async()=>{
  const {env,db}=fixture(Array.from({length:101},(_,i)=>({...common,id:'call-'+i})));
  assert.match(await directoryHtml(env),/href="\/procedures\/countries\/bg"/);
  const url=new URL('https://euro-funds.eu/procedures/countries/bg/page/2');const res=await handleCountryLanding(new Request(url),env,url);assert.equal(res.status,200);const doc=new JSDOM(await res.text()).window.document;assert.equal(doc.querySelector('link[rel=canonical]').href,url.href);assert.ok(doc.querySelector('a[href="/procedures/countries/bg"]'));db.close();
});
await test('Coverage checker rejects two records sharing one URL and excludes the programs index',async()=>{
  const xml='<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://euro-funds.eu/procedures/programs</loc></url><url><loc>https://euro-funds.eu/procedures/a</loc></url></urlset>';
  const result=await executeCheck({code:'seo.sitemap.coverage',category:'sitemap'},{origin:'https://euro-funds.eu',fetchImpl:async()=>new Response(xml,{headers:{'content-type':'application/xml'}}),db:{procedureSlugs:async()=>[{id:'A',slug:'a'},{id:'B',slug:'a'}]}});
  assert.notEqual(result.status,'passed');assert.equal(result.safeDetails.collisions,1);assert.equal(result.safeDetails.sitemapProcedures,1);
});
