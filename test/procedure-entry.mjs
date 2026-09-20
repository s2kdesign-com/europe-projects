// Exercise the real exported Next bundle and Worker composition, not a component mock.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firefox } from 'playwright';
import { renderProcedureShell } from '../worker/procedure-page.js';
import { procedurePath } from '../app/lib/public-url.js';
import { LOCALE_CODES } from '../app/lib/i18n/locales.js';
import labels from '../app/lib/i18n/premium-labels.json' with { type: 'json' };

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.PROCEDURE_ARTIFACT_DIR || path.join(root,'.next','procedure-checks');
await mkdir(output,{recursive:true});
const shell=await readFile(path.join(root,'out/procedures.html'),'utf8');
const project={id:'DE:de-esf:zusammenhalt-staerken-3',public_slug:'de-de-esf-zusammenhalt-staerken-3',
  name:'3. Förderaufruf "Zusammenhalt stärken - Menschen verbinden"',program:'ESF Plus',country_code:'DE',
  original_language:'de',status:'open',deadline:'28.02.2027',deadline_date:'2027-02-28',last_updated:'2026-09-20',
  official_url:'https://example.org/official',budget:'EUR 200,000',eligible:'Non-profit organisations',notes:'Procedure entry regression fixture',doc_count:1};
const documents=[{id:1,project_id:project.id,title:'Application guidelines',doc_type:'guidelines',content:'Application requirements and eligible costs.',source_url:'https://example.org/guidelines'}];
const other={...project,id:'LV:other',public_slug:'lv-other',name:'Latvian procedure',country_code:'LV'};
const canonical=procedurePath(project);
let listFails=false;
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://local');
    if(url.pathname.startsWith('/api/')){
      let data={ok:true,authenticated:false};
      if(url.pathname==='/api/projects'){
        if(listFails){res.writeHead(503,{'content-type':'application/json'});return res.end('{"ok":false}');}
        data={ok:true,projects:[project,other],snapshot:null};
      }
      if(url.pathname==='/api/project')data={project:url.searchParams.get('id')===other.id?other:project,documents,ok:true};
      if(url.pathname==='/api/geo')data={country:'LV'};
      if(url.pathname==='/api/countries')data={countries:[]};
      if(url.pathname==='/api/i18n/translate-batch'){
        let body='';for await(const part of req)body+=part;
        const input=JSON.parse(body);
        data={ok:true,translations:input.items.map(x=>({...x,translated:true,translatedText:labels[x.text]?.[input.targetLanguage] || x.text}))};
      }
      res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(data));
    }
    if(url.pathname===canonical || url.pathname===procedurePath(other)){
      res.writeHead(200,{'content-type':'text/html'});
      return res.end(renderProcedureShell(shell,url.pathname===canonical?project:other,documents));
    }
    const rel=url.pathname==='/'?'index.html':url.pathname==='/procedures'?'procedures.html':decodeURIComponent(url.pathname.slice(1));
    const filename=path.resolve(root,'out',rel);
    if(!filename.startsWith(path.resolve(root,'out')+path.sep))throw Error('outside root');
    const content=await readFile(filename);
    const type=filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.json')?'application/json':filename.endsWith('.svg')?'image/svg+xml':filename.endsWith('.txt')?'text/x-component':'text/html';
    res.writeHead(200,{'content-type':type});res.end(content);
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try {
  browser=await firefox.launch({headless:true});
  const context=await browser.newContext({locale:'en-GB',viewport:{width:1366,height:900}});
  await context.addInitScript(()=>localStorage.setItem('eurofunds_country_v1',JSON.stringify({country:'LV',mode:'manual',confirmed:true})));
  await context.route('https://**',route=>route.abort());
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && /hydration|Minified React/.test(m.text()))errors.push(m.text());});
  await page.goto(origin+canonical+'?fbclid=facebook-regression&lang=en');
  await page.locator('[role="dialog"] #drawer-title').waitFor();
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  assert.equal(await page.locator('#drawer-title').textContent(),project.name);
  assert.equal(await page.locator('#procedure-fallback').count(),0);
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://euro-funds.eu'+canonical);
  assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'),'https://euro-funds.eu'+canonical);
  assert.equal(new URL(page.url()).pathname,canonical);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('eurofunds_country_v1')).country),'LV');
  await page.evaluate(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value;}}});});
  await page.locator('.drawer-actions button').nth(1).click();
  assert.equal(await page.evaluate(()=>window.__copied),origin+canonical);
  await page.locator('.drawer-actions button').first().click();
  assert.equal(await page.locator('.drawer-actions button').first().getAttribute('aria-pressed'),'true');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('.drawer-actions button').nth(2).click();
  assert.match((await downloadPromise).suggestedFilename(),/\.ics$/);
  await page.locator('.drawer-close').focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('.drawer')!==null),true);
  await page.screenshot({path:path.join(output,'direct-desktop.png')});
  // New visitors must not be interrupted by automatic welcome/cookie/push overlays.
  await page.waitForTimeout(5500);
  assert.equal(await page.locator('[role="dialog"]').count(),1);
  await page.locator('.drawer-close').click();
  await page.waitForURL('**/procedures?lang=en');
  assert.equal(await page.locator('[role="dialog"] #drawer-title').count(),0);
  await page.goBack();await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('h1#drawer-title').count(),1);
  await page.goForward();await page.waitForURL('**/procedures?lang=en');
  // Dismiss onboarding for the remaining ordinary navigation checks.
  await page.evaluate(()=>{localStorage.setItem('evroproekti_system_intro_v1','1');localStorage.setItem('evroproekti_cookie_consent_v1',JSON.stringify({necessary:true,analytics:false,version:1}));});
  await page.goto(origin+'/procedures?q=Latvian');
  await page.locator('.card a.details').first().click();
  await page.waitForURL('**/procedures/lv-other?q=Latvian');
  await page.locator('#drawer-title').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForURL('**/procedures?q=Latvian');
  await page.goBack();await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('#drawer-title').textContent(),other.name);
  await page.reload();await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('#drawer-title').textContent(),other.name);
  const newTab=await context.newPage();await newTab.goto(origin+canonical);await newTab.locator('#drawer-title').waitFor();
  assert.equal(await newTab.locator('#drawer-title').textContent(),project.name);await newTab.close();
  // Legacy IDs continue to open the correct cross-country record.
  await page.goto(origin+'/procedures?id='+encodeURIComponent(project.id));
  await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('#drawer-title').textContent(),project.name);
  // Direct procedure content must survive a failing background catalog request.
  listFails=true;
  await page.goto(origin+canonical);await page.locator('#drawer-title').waitFor();
  assert.equal(await page.locator('#drawer-title').textContent(),project.name);
  listFails=false;
  let layouts=0;
  for(const lang of LOCALE_CODES){
    await page.goto(origin+canonical+'?lang='+lang);await page.locator('#drawer-title').waitFor();
    await page.waitForFunction(lang=>document.documentElement.lang===lang,lang);
    for(const width of [1366,768,390,320]){
      await page.setViewportSize({width,height:900});
      const overflowing=await page.evaluate(()=>[...document.querySelectorAll('.drawer,.drawer-head,.drawer-scroll,.drawer-actions,.drawer-actions .btn')].filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className));
      assert.deepEqual(overflowing,[],lang+' '+width);layouts++;
    }
  }
  await page.screenshot({path:path.join(output,'direct-mobile.png')});
  // The complete initial HTML remains readable and uses the app stylesheet without JS.
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const fallback=await noJs.newPage();await fallback.goto(origin+canonical);
  assert.equal(await fallback.locator('#procedure-title').textContent(),project.name);
  assert.equal(await fallback.locator('a[href="https://example.org/guidelines"]').count(),1);
  assert.equal(await fallback.locator('#procedure-fallback .drawer').evaluate(el=>getComputedStyle(el).display),'grid');
  await fallback.screenshot({path:path.join(output,'no-js-mobile.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,layouts,checks:['direct','tracking','metadata','hydration','close','back-forward','filter-return','reload','legacy-id','catalog-failure','no-javascript','new-tab','saved-country','copy','save','calendar','focus'],output},null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
