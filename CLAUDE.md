# Европроекти (euro-funds.eu) — насоки за работа

AI платформа за откриване/анализ на европейско и национално финансиране. Multi-country
(27 ЕС държави), България = reference. Next.js 15 `output: "export"` (статичен, БЕЗ SSR)
+ ръчен Cloudflare Worker (`worker.js` + `worker/*.js`) + Cloudflare D1.

> **Мрежа от памет:** централен хъб = `C:\claude\daily-dashboard\CLAUDE.md` + `memory/projects/evroproekti.md` там; главен индекс `C:\claude\CLAUDE.md`. Персистентната
> междусесийна памет е в Claude memory (`evroproekti-*` файлове). Прогрес по държави:
> `docs/multi-country-progress.md`. Последна синхронизация на паметта: 2026-07-24.

## Състояние (2026-07-24)
- Worker `evroproekti-dashboard` е деплойнат и се обновява (last modified 24.07) — старият
  open item „redeploy за admin console" изглежда решен; при съмнение провери `/admin` онлайн.
- Multi-country: 26 държави active/partial (BG 42 процедури към 18.07; BE connector_ready,
  под прага ≥3). Цикли 4–6 приключени; `daily-eu-country-sync` върти round-robin.
- D1: account Office@s2kdesign.com (`9c3fcd4952bcf0c295532e9884377d37`),
  DB `evroproekti-dashboard` (`d5f1bb40-3729-4c11-ae06-efbd4b5c9760`).

## Желязно правило при ВСЯКА промяна
1. Вдигни `APP_VERSION` в `app/lib/version.js` (единствен източник на версията).
2. Prepend запис в `CHANGELOG_ENTRIES` (`app/lib/changelog-data.js`).
3. Обнови `CHANGELOG.md`.
4. INSERT в D1 `changelog_entries` (колоната е `content`, НЕ content_json; изрични
   `created_at`/`updated_at` с `datetime('now')`; в MCP заявки НЕ подавай null като
   param — пиши NULL литерал).

## Забрани
- НЕ измисляй данни — статистики само от реални snapshot-и (`country_daily_statistics`);
  липсващото се показва честно („Няма структурирани данни“).
- НЕ съхранявай raw IP (само `request.cf.country`); език ≠ държава — не ги свързвай.
- НЕ пипай Google OAuth потока (Authorization Code + PKCE в Worker-а) без изрично искане.
- НЕ hardcode-вай български региони/програми/BGN — всичко country-aware от D1.
- API ключове: само AES-256-GCM в D1 (`AI_CREDENTIALS_MASTER_KEY`); никога plaintext,
  никога към frontend-а.
- Активиране на държава само след QA (≥3 валидни процедури); само официални източници.

## Архитектура — ключови точки
- Country state: САМО `CountryProvider`/`useCountry()`. Резолюция: URL slug → profile
  manual → guest localStorage → Cloudflare country → browser locale → BG fallback.
- i18n: `bg.json` е source of truth; 25 езика auto-generated (Google Translation v3 в
  Worker-а). Страници с много низове: `useUiTranslate(labels)` + `UiTrContext`.
- Профил: региони/програми/валута от `GET /api/countries/profile-options?country=XX`;
  етикети през `countryAdminLabels()`; оборот през `revenueRanges(currency)`;
  смяна на държава → confirm + чистене само на несъвместимите полета.
- `country_regions`: 394 региона за всички 27 държави (level 1). Municipality е free
  text по решение (level 2 подготвен, не seed-нат). Програмите са динамични от
  `projects.program` (без отделна таблица). Candidate types — универсални.
- Дневната синхронизация е Claude Scheduled Task `evroproekti-bulgaria-dneven-monitoring`
  (cron 0 8 * * *) — променя се през scheduled-tasks API, не през файлове. Динамични
  държави от D1, cursor round-robin, locks, отчети в `scheduled_sync_runs` +
  `ai_execution_runs` + snapshot в `country_daily_statistics`. Multi-country задачата е
  `daily-eu-country-sync` (виж docs/claude-scheduled-task-all-countries.md).
- AI: `worker/ai/*`; активен системен модел gpt-5.6-terra; daily review модел се
  управлява от Scheduled Tasks (desired ≠ actual). Цени: `app/lib/ai-pricing.js`.
- JS-blocked портали (playbook от docs/multi-country-progress.md): meta tags на detail
  страници → прес/новинарски секции → съседни официални домейни → WebSearch с потвърден
  official_url.

## Билд/валидация (Cowork sandbox)
- Mount презапис чупи файлове в bash-изгледа → при нужда `rm` + Write наново.
- Пълен `npm install`/`next build` НЕ завършва в sandbox-а (фоновите процеси умират) —
  валидирай с esbuild bundle (`/tmp/estool/node_modules/esbuild/bin/esbuild`; за .jsx:
  `--loader:.jsx=jsx --external:react ...`) + `node test/*.test.mjs` (74 теста).
- Деплоят е РЪЧЕН от потребителя: `cd dashboard && git add -A && git commit && git push
  && npm run deploy`. D1 миграциите се прилагат през Cloudflare connector (само additive)
  и се записват и в `migrations/`.

## Документация
`docs/multi-country-{architecture,progress,rollout-plan}.md`,
`country-source-methodology.md`, `claude-scheduled-task-all-countries.md`, `sources/*.md`.
Персистентната памет между сесиите е в Claude memory (evroproekti-* файлове).
