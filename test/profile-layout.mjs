import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { firefox } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../app/lib/i18n/locales.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.LAYOUT_ARTIFACT_DIR||await mkdtemp(path.join(tmpdir(),'euro-profile-layout-'));
await mkdir(output,{recursive:true});
await build({entryPoints:[path.join(root,'test/fixtures/profile-layout.jsx')],bundle:true,outfile:path.join(output,'fixture.js'),
  jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff2':'dataurl'},
  plugins:[{name:'offline-ui-translations',setup(build){
    build.onLoad({filter:/i18n[\\/]ui-translate\.js$/},()=>({contents:`import {createContext,useContext} from 'react';
      import {useTranslation} from 'react-i18next';import labels from './premium-labels.json';
      export const UiTrContext=createContext(text=>text);export const useUiTr=()=>useContext(UiTrContext);
      export function useUiTranslate(){const {i18n}=useTranslation();return text=>labels[text]?.[i18n.language]||text;}`,
      resolveDir:path.join(root,'app/lib/i18n'),loader:'js'}));
  }}]});
const js=await readFile(path.join(output,'fixture.js')),css=await readFile(path.join(output,'fixture.css'));
const server=createServer((request,response)=>{
  const type=request.url==='/fixture.js'?'js':request.url==='/fixture.css'?'css':'html';
  response.setHeader('content-type',type==='js'?'application/javascript':type==='css'?'text/css':'text/html');
  response.end(type==='js'?js:type==='css'?css:'<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;const results=[];
try{
  browser=await firefox.launch({headless:true});const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  for(const lang of LOCALE_CODES){
    await page.goto(origin+'/?lang='+lang);await page.locator('.premium-plan').last().waitFor();
    for(const width of [1440,1280,1024,768,390,320]){
      await page.setViewportSize({width,height:1000});
      const geometry=await page.evaluate(()=>{
        const bounds=el=>el.getBoundingClientRect();
        const overflowing=[...document.querySelectorAll('.card,.premium-plan,.notification-time,.card-meta .mrow,.card-actions button,.card-actions a')]
          .filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className);
        const pairs=[...document.querySelectorAll('.card-personal-actions')].every(row=>{
          const [a,b]=[...row.children].map(bounds);return Math.abs(a.top-b.top)<1&&a.right<=b.left&&b.right<=bounds(row).right+1;
        });
        return {overflowing,pairs,pageFits:document.documentElement.scrollWidth<=innerWidth+1};
      });
      assert.deepEqual(geometry,{overflowing:[],pairs:true,pageFits:true},lang+' '+width);
      if(['bg','en','de','fr','es'].includes(lang)&&[1280,768,390].includes(width))await page.screenshot({path:path.join(output,lang+'-'+width+'.png'),fullPage:true});
      results.push({lang,width,passed:true});
    }
    // Actual shared actions and keyboard-accessible plan radios.
    await page.locator('.card-personal-actions button').nth(0).click();
    assert.equal(await page.locator('.card-personal-actions button').nth(0).getAttribute('aria-pressed'),'true');
    await page.locator('.card-personal-actions button').nth(1).click();
    assert.equal(await page.locator('.card-personal-actions button').nth(1).getAttribute('aria-pressed'),'true');
    await page.locator('input[name="premium-plan"]').first().focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('input[name="premium-plan"]:checked').inputValue(),'annual');
    await page.locator('#daily-notification-hour').selectOption('23');assert.equal(await page.locator('#daily-notification-hour').inputValue(),'23');
    await page.locator('.card-primary-actions a').first().click();await page.locator('.drawer').waitFor();
    for(const width of [1280,768,390,320]){
      await page.setViewportSize({width,height:1000});
      const drawer=await page.evaluate(()=>[...document.querySelectorAll('.drawer,.drawer-head,.drawer-scroll,.drawer-actions,.drawer-actions .btn,.doc-content')]
        .filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.className));
      assert.deepEqual(drawer,[],lang+' drawer '+width);
    }
    if(lang==='de')await page.screenshot({path:path.join(output,'de-drawer-mobile.png')});
  }
  await page.goto(origin+'/?lang=en&premium=1');await page.locator('#premium').getByText('Premium is active',{exact:true}).waitFor();
  assert.equal(await page.locator('input[name="premium-plan"]').count(),0);
  assert.deepEqual(errors,[]);await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.log('ok - '+results.length+' language/viewport layouts, 100 drawer layouts, 25 interaction sets and Premium state; screenshots: '+output);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
