# Multi‑country rollout — прогрес

Статус: жив документ. Поддържа се след всяка завършена стъпка.
Последна редакция: 2026‑07‑18.

Легенда за статуси: `not_started, researching, sources_verified,
connector_in_progress, connector_ready, dry_run_passed, backfilling, active,
degraded, blocked`.

Колони: `Research` (проучени портали), `Sources verified` (официалност доказана в
`funding_sources`+`source_audit_log`), `Connector` (код по единния интерфейс),
`Dry run` (fetch без запис), `Backfill` (реални данни в D1), `Daily sync`
(country‑aware orchestrator), `UI enabled` (показва се публично), `QA`.

| Country | Research | Sources verified | Connector | Dry run | Backfill | Daily sync | UI enabled | QA |
|---------|----------|------------------|-----------|---------|----------|------------|------------|----|
| BG България (reference) | ✓ | ✓ | ✓ (external Scheduled Task) | ✓ | ✓ | ✓ | ✓ | ✓ |
| RO Румъния | ✓ | partial | connector_in_progress | ✗ | ✗ | ✗ | ✗ | ✗ |
| GR Гърция | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| PL Полша | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| HR Хърватия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| CZ Чехия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| PT Португалия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| SK Словакия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| HU Унгария | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| SI Словения | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| IT Италия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| ES Испания | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| DE Германия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| FR Франция | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| LT Литва | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| LV Латвия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| EE Естония | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| NL Нидерландия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| BE Белгия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| SE Швеция | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| FI Финландия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| AT Австрия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| IE Ирландия | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| DK Дания | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| CY Кипър | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| MT Малта | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |
| LU Люксембург | ✗ | ✗ | not_started | ✗ | ✗ | ✗ | ✗ | ✗ |

## Foundation (общо, не per държава)
| Компонент | Статус |
|-----------|--------|
| D1: `countries` таблица + seed 27 | ✓ приложено |
| D1: `funding_sources` + `source_audit_log` | ✓ приложено |
| D1: `country_sync_state` + `source_sync_runs` | ✓ приложено |
| D1: additive колони `projects`/`documents` + BG backfill | ✓ приложено |
| D1: профил country колони | ✓ приложено |
| Frontend country registry (`app/lib/country/*`) | ✓ |
| CountryContext/Provider/useCountry | ✓ |
| Country resolution (cf.country, locale, profile, guest) | ✓ |
| Worker `?country=` филтър (default BG) + `/api/geo` | ✓ |
| Локални SVG знамена — всичките 27 държави + fallback | ✓ (v2.22.1) |
| CountryProvider монтиран в дървото (layout) | ✓ (v2.22.0) |
| DashboardShell country-aware fetch (`?country=`) + abort/skeleton | ✓ (v2.22.0) |
| Информационен модал: секция „Вашата държава“ | ✓ (v2.22.0) |
| Footer country selector | ✓ (v2.22.0) |
| Профил държава + `PATCH /api/profile/country` + auto toggle | ✓ (v2.22.0) |
| CountryLogoMark (знаме зад логото) | ✓ (v2.22.0) |
| CountrySourcesPanel/Page + `/sources` + `/api/sources` | ✓ (v2.22.0) |
| Ingestion core + `CountryConnector` интерфейс | ✓ scaffold |
| BG reference connector stub | ✓ scaffold |
| CountrySyncOrchestrator (код-скелет) | ✓ (v2.22.1) `src/ingestion/core` |
| BG официални източници seed-нати в funding_sources | ✓ (5 източника) |
| saved_procedures.country_code (migration 0011, backfill BG) | ✓ (v2.22.1) |
| Scheduled Task — multi-country prompt ПРИЛОЖЕН директно | ✓ (v2.23.0) виж claude-scheduled-task-all-countries.md |
| Migration 0012: cursor + locks + scheduled_sync_runs | ✓ приложено в prod |
| scheduler.js (cursor/locks/timeout) + 22 unit теста | ✓ (v2.23.0) |
| Saved UI филтър „Текуща/Всички държави“ | ⏳ остава (модел готов; смисъл при 2-ра държава с данни) |
| Country URL routes `/countries/:slug/...` / Playwright | ⏳ остава |

## Забележки за RO
- Официални портали (проверени чрез търсене, gov домейни): **MIPE — mfe.gov.ro**
  (управляващ орган / централен хъб), **oportunitati‑ue.gov.ro** (единна точка за
  достъп, изброява активните покани), **mysmis2021.gov.ro** (подаване; отхвърля
  ботове), **fonduri‑ue.ro** (2014‑2020 legacy).
- `Sources verified = partial`: официалността е потвърдена, но техническият формат
  не е финализиран — `oportunitati‑ue.gov.ro` връща празно на суров fetch и MySMIS
  отхвърля ботове → вероятно JS‑rendered (`requires_javascript=1`), нужна е browser
  automation или намиране на structured endpoint. Затова RO **не** е активна.
- Следваща стъпка за RO: потвърди listing формата (search endpoint/RSS/HTML под JS),
  запиши в `funding_sources`, имплементирай `fetchCalls`, fixtures, dry run.
