# Multi‑country rollout план — Европроекти

Статус: жив документ. Последна редакция: 2026‑07‑18.
Виж и: `multi-country-architecture.md`, `multi-country-progress.md`,
`country-source-methodology.md`, `scheduled-task-country-rollout.md`.

## 0. Принципи
- Една кодова база, additive промени, България = reference implementation.
- Държава се смята за интегрирана **само** при: проверени официални източници,
  работещ connector, успешен dry run, реално внесени данни, deduplication, source
  attribution, тестове, source health статус. Иначе — статус в progress файла.
- Оставяй системата работеща след всеки логически етап.

## 1. Фази на изпълнение (глобални)
1. **Foundation (без държавни данни):** миграции (countries, funding_sources,
   audit, sync state, sync runs), additive колони + BG backfill, seed на 27 държави,
   CountryContext, country resolution, country‑aware API (default BG), локални знамена.
2. **UI на държавата:** информационен модал (секция „Вашата държава“ + Cloudflare
   предложение + privacy бележка), footer selector, профил настройка + `PATCH
   /api/profile/country`, `CountryLogoMark`, `CountrySourcesPanel/Page`, empty/loading/
   error states при смяна на държава, country‑aware saved филтър, country URL routes.
3. **Ingestion ядро:** `src/ingestion/core` + единен `CountryConnector` интерфейс +
   BG reference stub; `CountrySyncOrchestrator`; актуализиран Scheduled Task prompt.
4. **Държави по приоритет:** за всяка — proучване → верификация → connector → fixtures
   → unit tests → dry run → staging import → data‑quality QA → limited backfill → full
   backfill → daily sync → UI activation → monitoring.

## 2. Приоритет на държавите
- Етап 1: **RO, GR, PL, HR**
- Етап 2: **CZ, PT, SK, HU, SI**
- Етап 3 (големи/регионално фрагментирани → regional adapters): **IT, ES, DE, FR**
- Етап 4 (балтийски/скандинавски/по‑малки): **LT, LV, EE, NL, BE, SE, FI, AT, IE, DK**
- Етап 5: **CY, MT, LU**
Всички 27 се добавят веднага в registry; показване на реални процедури — само след QA.
Държава с един частичен източник **не** се маркира като „напълно покрита“.

## 3. Разбивка по задачи и зависимости

| # | Задача | Зависи от | Резултат |
|---|--------|-----------|----------|
| T1 | Миграции countries/funding_sources/audit | — | schema готова |
| T2 | Миграции country columns + BG backfill | T1 | projects.country_code=BG |
| T3 | Миграции country_sync_state/source_sync_runs | T1 | sync schema |
| T4 | Seed 27 държави | T1 | countries попълнена |
| T5 | Локални SVG знамена | — | public/flags/*.svg |
| T6 | Country registry (frontend) | T4,T5 | app/lib/country/* |
| T7 | Resolution + store + Provider | T6 | useCountry() |
| T8 | Worker country filtering + /api/geo | T2 | ?country= |
| T9 | Информационен модал: секция държава | T7,T8 | предложение+избор |
| T10 | Footer country selector | T7 | избор във footer |
| T11 | Профил държава + PATCH /api/profile/country | T7 | профилна държава |
| T12 | CountryLogoMark | T5,T7 | лого със знаме |
| T13 | Sources panel/page + /sources routes | T1,T8 | публични източници |
| T14 | Ingestion core + connector interface | T1..T3 | src/ingestion/* |
| T15 | BG reference connector stub | T14 | еталон |
| T16 | CountrySyncOrchestrator | T14 | оркестратор |
| T17 | Scheduled Task prompt update | T16 | resumable rollout |
| T18 | RO: sources → connector → dry run → QA → activate | T14..T17 | RO активна |
| T19+ | Следващи държави по приоритет | T18 | … |

## 4. Migrations, testing, rollout
- **Migrations:** additive; constraints след backfill; провери брой записи преди/след;
  staging тест преди prod.
- **Testing:** unit (country resolution, preference, cloudflare suggestion, locale
  fallback, invalid country, mode, login sync, API filtering, source registry,
  connector interface, normalization, dedup, hashing, cache keys) + integration
  (Cloudflare=RO → modal → confirm → само RO → footer sources → знаме → смяна на BG →
  abort стари заявки → само BG → refresh запазва → login записва в профил → друго
  устройство възстановява) + Playwright на 360/390/430/768/1440.
- **Rollout:** per държава през 13‑те стъпки (виж progress). UI activation само след QA.
- **Monitoring:** admin изглед за rollout status/source health/sync; alerts при 3
  последователни source failures, рязък спад, 0 records от активен source, промяна на
  HTML, надвишен invalid threshold, липса на успешен sync над периода.
- **Rollback:** additive → безопасно игнориране; BG данните валидни без новите колони;
  без destructive стъпки при временни source failures.

## 5. Изпълнение в текущата сесия (виж progress за точния статус)
Реализирано: foundation‑слоят (миграции, seed, BG backfill, country registry/context/
resolution, country‑aware API default BG, знамена за стъпка 1, RO source research +
connector scaffold). Останалото — по progress таблицата и списъка „Остава“.
