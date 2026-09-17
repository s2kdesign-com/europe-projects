// Public-edge check: never uses SELF_FETCH or credentials. --full crawls every URL.
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import fs from 'node:fs';
const origin=process.env.SEO_ORIGIN || 'https://euro-funds.eu';
const full=process.argv.includes('--full');
const report={started:new Date().toISOString(),origin,full,errors:[],pages:[]};
const fail=s=>report.errors.push(s);
async function get(path, options={}) {
  const response=await fetch(new URL(path,origin),{...options,signal:AbortSignal.timeout(30000)});
  return {response,text:options.method==='HEAD'?'':await response.text()};
}
const sm=await get('/sitemap.xml');
if(sm.response.status!==200) throw Error('Sitemap HTTP '+sm.response.status);
if(!/xml/.test(sm.response.headers.get('content-type'))) throw Error('Sitemap content-type is not XML');
if(XMLValidator.validate(sm.text)!==true) throw Error('Invalid sitemap XML');
const xml=new XMLParser().parse(sm.text);
const entries=Array.isArray(xml.urlset?.url)?xml.urlset.url:[xml.urlset?.url].filter(Boolean);
if(!entries.length) throw Error('Sitemap contains no URLs');
const urls=entries.map(e=>e.loc), unique=new Set(urls);
if(urls.length!==unique.size) fail('Duplicate sitemap locs');
for(const url of urls){const u=new URL(url);if(u.origin!==origin||u.search||/^\/(admin|login|profile|saved|api)(\/|$)/.test(u.pathname)) fail('Invalid sitemap URL '+url);}
const countries=JSON.parse((await get('/api/countries')).text).countries;
const records=[];
for(const country of countries){const d=JSON.parse((await get('/api/projects?country='+country.code)).text);if(!d.ok||!Array.isArray(d.projects))throw Error('Inventory unavailable '+country.code);records.push(...d.projects);}
const identities=new Map();
for(const p of records){const url=origin+'/procedures/'+p.public_slug;if(!p.public_slug)fail('Missing route '+p.id);if(identities.has(url))fail('Route collision '+p.id);identities.set(url,p.id);if(!unique.has(url))fail('Missing from sitemap '+p.id);}
const head=await get('/sitemap.xml',{method:'HEAD'});
if(head.response.status!==200||!/xml/.test(head.response.headers.get('content-type')))fail('HEAD sitemap failed');
const robots=await get('/robots.txt');if(!robots.text.includes(origin+'/sitemap.xml'))fail('robots.txt missing sitemap');
const jobs=full ? urls : [...new Set([origin+'/',origin+'/procedures',origin+'/procedures/programs',...urls.filter(u=>u.includes('/countries/')).slice(0,2),...[...identities.keys()].filter((_,i)=>i%Math.max(1,Math.floor(identities.size/20))===0)])];
let index=0;
const attr=(html,pattern)=>html.match(pattern)?.[1]||null;
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
async function worker(){while(index<jobs.length){const url=jobs[index++];try{
 const {response,text}=await get(url);const canonical=attr(text,/<link\s+rel="canonical"\s+href="([^"]+)"/i);
 const title=attr(text,/<title>([^<]*)<\/title>/i);const description=attr(text,/<meta name="description" content="([^"]*)"/i);
 const jsonld=[...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
 const identifier=jsonld.find(n=>n['@type']==='MonetaryGrant')?.identifier;
 const links=[...text.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map(m=>{try{return new URL(decode(m[1]),url).href.split('#')[0]}catch{return ''}}).filter(u=>u.startsWith(origin));
 if(response.status!==200)fail(url+' HTTP '+response.status);
 if(canonical!==url)fail(url+' canonical '+canonical);
 if(/<meta name="(?:robots|googlebot)" content="[^"]*noindex/.test(text)||/noindex/.test(response.headers.get('x-robots-tag')||''))fail(url+' noindex');
 if(identities.has(url)&&identities.get(url)!==identifier)fail(url+' identity mismatch '+identifier);
 if(!title||!description)fail(url+' missing metadata');
 report.pages.push({url,status:response.status,canonical,title,description,identifier,links});
 }catch(e){fail(url+' '+e.message)}
 if(index%100===0)console.log('Checked '+index+'/'+jobs.length);
}}
await Promise.all(Array.from({length:4},worker));
if(full){
 const pages=new Map(report.pages.map(p=>[p.url,p])), reached=new Set(), queue=[origin+'/'];
 while(queue.length){const url=queue.shift();if(reached.has(url))continue;reached.add(url);for(const link of pages.get(url)?.links||[])if(pages.has(link)&&!reached.has(link))queue.push(link);}
 const orphaned=[...identities.keys()].filter(u=>!reached.has(u));if(orphaned.length)fail(orphaned.length+' orphaned procedure URLs');
 for(const key of ['title','description']){const seen=new Map();for(const p of report.pages){if(seen.has(p[key]))fail('Duplicate '+key+': '+p.url+' and '+seen.get(p[key]));seen.set(p[key],p.url);}}
 report.reachableProcedures=identities.size-orphaned.length;
}
report.records=records.length;report.sitemapUrls=urls.length;report.checked=report.pages.length;report.finished=new Date().toISOString();
const output=process.env.SEO_REPORT || 'seo-report.json';fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,pages:undefined},null,2));
if(report.errors.length)process.exitCode=1;
