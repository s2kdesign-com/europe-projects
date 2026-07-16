// E2E тест за хоризонтален overflow на мобилно + видимост на cookie банера.
//
// Проверява първопричината, която беше поправена: скритата за екранни четци
// таблица (<div className="sr-only"><table>…) не разширява layout viewport-а и
// няма хоризонтален скрол на нито една мобилна резолюция; cookie банерът стои
// изцяло във viewport-а и трите му бутона се виждат напълно.
//
// Изпълнение:
//   npm i -D @playwright/test && npx playwright install chromium
//   BASE_URL=http://localhost:3000 npx playwright test test/e2e/mobile-overflow.spec.mjs
// (по подразбиране тества локалния билд; подайте BASE_URL за друг адрес.)

import { test, expect, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const MOBILE_WIDTHS = [320, 360, 375, 390, 412, 430];
const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";

// Помага банерът да се покаже (5s intro таймер) и стабилизира изгледа.
async function openWithBanner(page) {
  await page.goto(BASE_URL + "/?tab=overview", { waitUntil: "domcontentloaded" });
  // изчистваме евентуален запазен consent, за да се покаже банерът
  await page.evaluate(() => { try { document.cookie = "evp_consent=; Max-Age=0; path=/"; } catch {} });
  await page.waitForTimeout(6000);
}

// Истинската ширина на устройството е documentElement.clientWidth (не зависи от
// емулирания скролбар). Overflow има, ако scrollWidth я надвишава.
async function metrics(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return {
      innerWidth: window.innerWidth,
      clientWidth: de.clientWidth,
      scrollWidth: de.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
}

for (const width of MOBILE_WIDTHS) {
  test(`няма хоризонтален overflow @ ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 820 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA,
    });
    const page = await context.newPage();
    await openWithBanner(page);

    // 1) преди скрол
    let m = await metrics(page);
    expect(m.scrollWidth, `scrollWidth<=clientWidth @${width} (преди скрол)`).toBeLessThanOrEqual(m.clientWidth);
    expect(m.scrollWidth, "scrollWidth<=innerWidth (критерий от спецификацията)").toBeLessThanOrEqual(m.innerWidth);

    // 2) скрол до средата, до дъното и обратно нагоре — стабилно без overflow
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    m = await metrics(page);
    expect(m.scrollWidth, `scrollWidth<=clientWidth @${width} (след скрол)`).toBeLessThanOrEqual(m.clientWidth);

    // 3) документът не може да се мести хоризонтално
    const scrolledX = await page.evaluate(() => { window.scrollTo(500, 0); const x = window.scrollX; window.scrollTo(0, 0); return x; });
    expect(scrolledX, "няма хоризонтален скрол").toBe(0);

    await context.close();
  });

  test(`cookie банерът и трите бутона са изцяло във viewport @ ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 820 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA,
    });
    const page = await context.newPage();
    await openWithBanner(page);

    const banner = page.locator(".cookie-banner");
    await expect(banner).toBeVisible();
    const box = await banner.boundingBox();
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box.x, "банерът не излиза вляво").toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, "банерът не излиза вдясно").toBeLessThanOrEqual(vw + 0.5);

    const btns = page.locator(".cookie-actions .btn");
    await expect(btns).toHaveCount(3);
    const boxes = [];
    for (let i = 0; i < 3; i++) {
      const btn = btns.nth(i);
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();
      const b = await btn.boundingBox();
      expect(b.x, `бутон ${i} не излиза вляво`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `бутон ${i} не излиза вдясно`).toBeLessThanOrEqual(vw + 0.5);
      expect(b.height, `бутон ${i} touch target ≥ 44px`).toBeGreaterThanOrEqual(44);
      boxes.push(b);
    }
    // без припокриване по вертикала
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y, `бутон ${i} не се припокрива с предходния`).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 0.5);
    }
    await context.close();
  });
}

// Desktop/таблет: банерът е хоризонтална лента и не чупи изгледа.
test("desktop банерът е компактна лента без overflow @ 1440px", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await openWithBanner(page);
  const m = await metrics(page);
  expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
  await context.close();
});
