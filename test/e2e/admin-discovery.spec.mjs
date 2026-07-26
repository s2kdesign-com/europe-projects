// E2E тестове за администраторските раздели „API & Agents" и „SEO & Discovery".
//
// Изпълнение:
//   npm i -D @playwright/test && npx playwright install chromium
//   BASE_URL=https://euro-funds.eu ADMIN_STORAGE=.auth/admin.json \
//     npx playwright test test/e2e/admin-discovery.spec.mjs
//
// ВАЖНО: /admin изисква Google вход, който не може да се автоматизира надеждно
// (реален OAuth екран). Затова тестовете ползват запазено състояние на сесията:
//
//   1. npx playwright open --save-storage=.auth/admin.json https://euro-funds.eu/login
//   2. Влезте с администраторския акаунт и затворете браузъра.
//   3. Пуснете тестовете с ADMIN_STORAGE=.auth/admin.json
//
// Без ADMIN_STORAGE администраторските сценарии се пропускат (skip), а публичните
// проверки за изтичане на тайни продължават да се изпълняват.

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const STORAGE = process.env.ADMIN_STORAGE || null;

const DESKTOP = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
];
const MOBILE = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
];

// Низове, които НИКОГА не бива да се появят в страницата или в мрежата.
const FORBIDDEN = [
  /sk-[A-Za-z0-9_-]*[A-Za-z0-9]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /"d"\s*:\s*"[A-Za-z0-9_-]{20,}"/,          // частен JWK компонент
  /AUTH_SECRET|AI_CREDENTIALS_MASTER_KEY|GOOGLE_CLIENT_SECRET/,
  /SCHEDULED_TASK_REPORTING_SECRET/,
];

const adminTest = STORAGE ? test : test.skip;

test.describe("Администрация · API & Agents и SEO & Discovery", () => {
  if (STORAGE) test.use({ storageState: STORAGE });

  adminTest("1–3. отваря администрацията и раздела API & Agents със summary карти", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Администрация/i })).toBeVisible();

    await page.getByRole("tab", { name: /API & Agents/i }).click();
    await expect(page.getByText(/Готовност за агенти/i)).toBeVisible();

    // Summary картите трябва да са налични и с реален статус (не празни).
    const cards = page.locator(".disc-sum");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
    for (const label of ["Публично API", "OpenAPI", "API каталог", "Markdown за агенти", "Link заглавки"]) {
      await expect(page.locator(".disc-sum-title", { hasText: label })).toBeVisible();
    }
    expect(errors, "конзолни грешки: " + errors.join(" | ")).toHaveLength(0);
  });

  adminTest("4. пуска ограничена валидация и вижда сървърен прогрес", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /API & Agents/i }).click();

    // Валидация само на Link заглавките — по-кратка от пълния одит.
    await page.getByRole("button", { name: /Валидирай отново/i }).first().click();

    const progress = page.locator(".disc-progress");
    await expect(progress).toBeVisible({ timeout: 20_000 });
    await expect(progress.getByText(/Текуща група/i)).toBeVisible();

    // 5. Прогресът преживява презареждане — истината е в базата.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /API & Agents/i }).click();
    // Или още работи, или вече е завършил — и в двата случая има реален резултат.
    await expect(
      page.locator(".disc-progress, .disc-score-main").first()
    ).toBeVisible({ timeout: 30_000 });
  });

  adminTest("5–6. инспектира публичен endpoint и вижда реалния отговор", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /API & Agents/i }).click();

    await page.getByRole("button", { name: /^Тествай$/ }).first().click();
    const drawer = page.locator(".disc-drawer");
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByText(/Отговор от продукцията/i)).toBeVisible();
    await expect(drawer.getByText(/Тяло \(съкратено и изчистено\)/i)).toBeVisible();

    // Тялото не бива да съдържа бисквитки или токени.
    const body = await drawer.locator(".disc-json").innerText();
    for (const re of FORBIDDEN) expect(body, `тайна в preview: ${re}`).not.toMatch(re);
    expect(body.toLowerCase()).not.toContain("set-cookie");
  });

  adminTest("7–9. Link заглавки, API каталог и OpenAPI показват реални стойности", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /API & Agents/i }).click();

    await expect(page.getByRole("heading", { name: /Link заглавки за откриване/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /API каталог \(RFC 9727\)/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /OpenAPI спецификация/i })).toBeVisible();

    // Адресите сочат към продукционния хост, не към workers.dev или localhost.
    const links = await page.locator(".disc-url a").evaluateAll((as) => as.map((a) => a.href));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href, `неочакван хост: ${href}`).not.toMatch(/workers\.dev|localhost|127\.0\.0\.1/);
    }
  });

  adminTest("10. OAuth статусът отразява реалната архитектура", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /API & Agents/i }).click();

    const card = page.locator(".prof-card", { hasText: "OAuth и OpenID Connect откриване" });
    await expect(card).toBeVisible();
    // Четирите роли се показват поотделно и всяка има ясно да/не.
    for (const role of ["Вход с Google", "Издава собствени токени", "OAuth Authorization Server", "OpenID Provider"]) {
      await expect(card.getByText(new RegExp(role, "i"))).toBeVisible();
    }
    // Никога не се показват тайни.
    const text = await card.innerText();
    for (const re of FORBIDDEN) expect(text).not.toMatch(re);
  });

  adminTest("11–14. SEO & Discovery: sitemap, robots и метаданни", async ({ page }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /SEO & Discovery/i }).click();

    await expect(page.getByRole("heading", { name: /Динамичен XML sitemap/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Robots и политика за обхождане/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Одит на метаданните/i })).toBeVisible();
    expect(errors, errors.join(" | ")).toHaveLength(0);
  });

  adminTest("15–17. процедурно SEO, структурирани данни и социални визитки", async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /SEO & Discovery/i }).click();

    await expect(page.getByRole("heading", { name: /SEO на процедурите/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Структурирани данни/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Социални визитки/i })).toBeVisible();

    // Разделът за външни AI агенти е отделен от вътрешните AI модели.
    await expect(page.getByRole("heading", { name: /Оптимизация за AI агенти и обхождащи/i })).toBeVisible();
    await expect(page.getByText(/Вътрешните AI модели на системата се управляват/i)).toBeVisible();
  });

  for (const vp of DESKTOP) {
    adminTest(`18a. desktop ${vp.name}: няма хоризонтално преливане`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: /API & Agents/i }).click();
      await page.waitForTimeout(600);
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(m.scroll, `overflow на ${vp.name}`).toBeLessThanOrEqual(m.client + 1);
    });
  }

  for (const vp of MOBILE) {
    adminTest(`18b. мобилно ${vp.name}: табовете работят и няма преливане`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });

      const tab = page.getByRole("tab", { name: /SEO & Discovery/i });
      await expect(tab).toBeVisible();
      await tab.click();
      await page.waitForTimeout(600);

      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(m.scroll, `overflow на ${vp.name}`).toBeLessThanOrEqual(m.client + 1);

      // Бутоните не се пречупват на два реда.
      const tall = await page.locator(".disc-actions button").evaluateAll((els) =>
        els.filter((e) => e.getBoundingClientRect().height > 60).length
      );
      expect(tall, "бутон на два реда").toBe(0);

      // Обобщаващите карти стават 1–2 колони.
      const cols = await page.locator(".disc-sum-grid").first().evaluate((el) =>
        getComputedStyle(el).gridTemplateColumns.split(" ").length
      ).catch(() => 1);
      expect(cols).toBeLessThanOrEqual(2);
    });
  }

  adminTest("19. никаква тайна не се появява в мрежовите отговори", async ({ page }) => {
    const suspicious = [];
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/api/admin/discovery/")) return;
      const ct = res.headers()["content-type"] || "";
      if (!ct.includes("json")) return;
      const text = await res.text().catch(() => "");
      for (const re of FORBIDDEN) if (re.test(text)) suspicious.push(`${url} → ${re}`);
      if (/set-cookie/i.test(text)) suspicious.push(`${url} → set-cookie в тялото`);
    });

    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: /API & Agents/i }).click();
    await page.waitForTimeout(2500);
    await page.getByRole("tab", { name: /SEO & Discovery/i }).click();
    await page.waitForTimeout(2500);

    expect(suspicious, suspicious.join(" | ")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Публични проверки — изпълняват се и БЕЗ администраторска сесия
// ---------------------------------------------------------------------------

test.describe("Публично: административните API-та са защитени", () => {
  test("20. /api/admin/discovery/* връща 401 без сесия", async ({ request }) => {
    for (const path of [
      "/api/admin/discovery/overview",
      "/api/admin/discovery/runs",
      "/api/admin/discovery/signals",
      "/api/admin/discovery/procedures",
    ]) {
      const res = await request.get(`${BASE_URL}${path}`);
      expect([401, 403], `${path} върна ${res.status()}`).toContain(res.status());
      const body = await res.text();
      for (const re of FORBIDDEN) expect(body).not.toMatch(re);
    }
  });

  test("21. стартиране на одит без сесия е отказано", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/admin/discovery/runs`, { data: { groups: ["api"] } });
    expect([401, 403]).toContain(res.status());
  });

  test("22. администрацията не се индексира", async ({ request }) => {
    const robots = await (await request.get(`${BASE_URL}/robots.txt`)).text();
    expect(robots).toMatch(/Disallow:\s*\/admin/);
  });
});
