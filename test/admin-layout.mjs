import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { firefox } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(path.join(tmpdir(), 'euro-admin-layout-'));
await build({ entryPoints: [path.join(root, 'test/fixtures/admin-layout.jsx')], bundle: true, outfile: path.join(output, 'fixture.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl' }, plugins: [{ name: 'local-translations', setup(build) {
  build.onLoad({ filter: /i18n[\\/]ui-translate\.js$/ }, () => ({ contents: `
    const labels={'Потребители':'Users','Потребител':'User','Роля':'Role','Администратор':'Administrator','Премиум':'Premium','Държава':'Country','Език':'Language','Автоматично':'Automatic','Ръчно':'Manual','По подразбиране':'Default','Обнови':'Refresh','Следваща':'Next','Предишна':'Previous','На страница':'Per page','Страница':'Page','Последна активност':'Last active','Регистриран':'Registered','Подробности':'Details','Изчисти':'Clear','Опитай отново':'Retry','Интеграция на браузъра':'Browser integration'};
    export const useUiTr=()=>text=>new URLSearchParams(location.search).get('lang')==='bg'?text:labels[text]||text;`, loader: 'js' }));
  build.onLoad({ filter: /i18n[\\/]I18nProvider\.jsx$/ }, () => ({ contents: `export const useLanguage=()=>({lang:new URLSearchParams(location.search).get('lang')||'en'});`, loader: 'js' }));
} }] });
const js = await readFile(path.join(output, 'fixture.js')), css = await readFile(path.join(output, 'fixture.css'));
const server = createServer((request, response) => {
  const type = request.url === '/fixture.js' ? 'js' : request.url === '/fixture.css' ? 'css' : 'html';
  response.setHeader('content-type', type === 'js' ? 'application/javascript' : type === 'css' ? 'text/css' : 'text/html');
  response.end(type === 'js' ? js : type === 'css' ? css : '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await firefox.launch({ headless: true });
  const page = await browser.newPage(), browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const lang of ['en', 'bg', 'de', 'fr', 'el']) {
    await page.goto(origin + '/?lang=' + lang); await page.locator('.admin-role').last().waitFor();
    assert.equal(await page.locator('.admin-users-table tbody tr').count(), 50);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const geometry = await page.evaluate(() => ({ pageFits: document.documentElement.scrollWidth <= innerWidth + 1, roleWidths: [...document.querySelectorAll('.admin-role')].every(select => select.getBoundingClientRect().width >= 190), tableScrolls: [...document.querySelectorAll('.table-scroll')].every(table => table.scrollWidth >= table.clientWidth) }));
      assert.deepEqual(geometry, { pageFits: true, roleWidths: true, tableScrolls: true }, `${lang} ${width}`);
    }
  }
  await page.goto(origin + '/?lang=en'); await page.locator('.admin-role').last().waitFor();
  const users = page.locator('section').first(), errors = page.locator('section').nth(1);
  const row = users.locator('tbody tr');
  assert.match(await row.nth(0).locator('td').nth(2).innerText(), /Greece\s+Manual/, 'manual country retains precedence over the automatic observation');
  assert.match(await row.nth(0).locator('td').nth(3).innerText(), /German\s+Manual/);
  assert.match(await row.nth(1).locator('td').nth(2).innerText(), /Germany\s+Automatic/);
  assert.match(await row.nth(1).locator('td').nth(3).innerText(), /Romanian\s+Automatic/, 'automatic language is not inferred from the country');
  assert.match(await row.nth(3).locator('td').nth(2).innerText(), /—\s+Automatic/, 'an unobserved account has no guessed country');
  assert.match(await row.nth(3).locator('td').nth(3).innerText(), /—\s+Automatic/, 'a legacy language default is not presented as observed');
  assert.match(await row.nth(5).locator('td').nth(2).innerText(), /Bulgaria\s+Automatic · Default/);
  await users.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-users-table tbody tr').length === 26);
  await users.locator('.admin-page-size select').selectOption('25');
  await page.waitForFunction(() => document.querySelectorAll('.admin-users-table tbody tr').length === 25);
  await users.locator('.admin-role').first().selectOption('premium');
  await page.waitForFunction(() => document.querySelector('.admin-role').value === 'premium' && !document.querySelector('.admin-role').disabled);
  await errors.locator('summary').first().focus(); await page.keyboard.press('Enter');
  assert.match(await errors.locator('details[open]').innerText(), /iabjs:\/\/navigation_performance_logger_android/);
  assert.match(await errors.locator('.admin-error-message').first().innerText(), /Java object is gone/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, 'admin-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: path.join(output, 'admin-mobile.png'), fullPage: true });
  await page.evaluate(() => { window.fixtureFail = '/api/admin/users'; });
  await users.getByRole('button', { name: 'Refresh' }).click();
  await users.getByRole('alert').waitFor(); assert.match(await users.getByRole('alert').innerText(), /HTTP 503/);
  assert.equal(await users.locator('tbody tr').count(), 25, 'failed refresh retains existing users');
  await page.evaluate(() => { window.fixtureFail = null; });
  await users.getByRole('button', { name: 'Retry' }).click();
  await page.waitForFunction(() => !document.querySelector('section [role="alert"]'));
  await page.evaluate(() => { window.fixtureFail = '/api/admin/users/user-0'; });
  await users.locator('.admin-role').first().selectOption('admin');
  await users.getByRole('alert').waitFor();
  assert.equal(await users.locator('.admin-role').first().inputValue(), 'premium', 'failed role update preserves the original role');
  await page.evaluate(() => { window.fixtureFail = '/api/admin/errors'; });
  page.on('dialog', dialog => dialog.accept());
  await errors.getByRole('button', { name: 'Clear', exact: true }).click();
  await errors.getByRole('alert').waitFor();
  assert.equal(await errors.locator('tbody tr').count(), 50, 'failed clear preserves exception rows');
  await page.evaluate(() => { window.fixtureFail = null; });
  await errors.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('section')[1].innerText.includes('Page 2 / 5'));
  await errors.locator('.admin-page-size select').selectOption('200');
  await page.waitForFunction(() => document.querySelectorAll('.admin-errors-table tbody tr').length === 200);
  await errors.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.admin-errors-table tbody tr').length === 25);
  assert.deepEqual(browserErrors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed: true, layouts: 25, pagination: true, keyboardDetails: true, roleAndClearFailures: true }));
  console.log('ok - 25 admin layouts, pagination, keyboard details, full exception visibility and failed refresh/role/clear controls; screenshots: ' + output);
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
