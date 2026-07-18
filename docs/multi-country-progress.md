# Multi‑country rollout — прогрес

Статус: жив документ. Поддържа се след всяка завършена стъпка.
Последна редакция: 2026‑07‑18 (run-20260718-0820).

Легенда за статуси: `not_started, researching, sources_verified,
connector_in_progress, connector_ready, dry_run_passed, backfilling, active,
degraded, blocked`.

Колони: `Research` (проучени портали), `Sources verified` (официалност доказана в
`funding_sources`+`source_audit_log`), `Connector` (код по единния интерфейс),
`Dry run` (fetch без запис), `Backfill` (реални данни в D1), `Daily sync`
(country‑aware orchestrator), `UI enabled` (показва се публично), `QA`.

| Country | Research | Sources verified | Connector | Dry run | Backfill | Daily sync | UI enabled | QA |
|---------|----------|------------------|-----------|---------|----------|------------|------------|----|
| BG България (reference) | ✓ | ✓ (5 източника) | ✓ (Scheduled Task) | ✓ | ✓ | ✓ | ✓ | ✓ |
| RO Румъния | ✓ | partial (4; формат неуточнен) | connector_in_progress | ✗ | ✗ | ✗ | ✗ | ✗ |
| GR Гърция | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| PL Полша | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| HR Хърватия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| CZ Чехия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| PT Португалия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| SK Словакия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| HU Унгария | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| SI Словения | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| IT Италия | portal ✓ | portal verified (ЕК; regional adapters) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| ES Испания | portal ✓ | portal verified (ЕК; regional adapters) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| DE Германия | portal ✓ | portal verified (ЕК; Länder adapters) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| FR Франция | portal ✓ | portal verified (ЕК; regional adapters) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| LT Литва | portal ✓ | portal verified (ЕК; esinvesticijos.lt за проверка) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| LV Латвия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| EE Естония | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| NL Нидерландия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| BE Белгия | portal ✓ | portal verified (ЕК; регионални програми) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| SE Швеция | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| FI Финландия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| AT Австрия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| IE Ирландия | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| DK Дания | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| CY Кипър | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| MT Малта | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |
| LU Люксембург | portal ✓ | portal verified (ЕК) | researching | ✗ | ✗ | ✗ | ✗ | ✗ |

Забележка (2026-07-18): Всичките 27 държави имат записан официален национален
портал във `funding_sources` (verified=1, enabled=0 до QA) с доказателство в
`source_audit_log` — официалният списък на ЕК „National single portals“
(commission.europa.eu). „portal ✓“ = порталът е потвърден; техническият формат
(API/RSS/HTML/JS) и пълното покритие се установяват при rollout-а на държавата.

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
| Country-aware профил: региони/програми/валута/етикети от D1 | ✓ (v2.27.0) profile-options API + confirm при смяна |
| country_regions seed за ВСИЧКИТЕ 27 държави (394 региона) | ✓ (v2.28.0) + ADMIN_LABELS за всички |
| Country-aware profile completion + sticky save бар | ✓ (v2.28.0) |
| Saved UI филтър „Текуща/Всички държави“ | ⏳ остава (модел готов; смисъл при 2-ра държава с данни) |
| Country URL routes `/countries/:slug/...` / Playwright | ⏳ остава |
| Municipalities level 2 | ⏳ по решение: municipality е free text; level 2 в схемата е подготвен |
| RO/HR connector | ⏳ blocked (JS-rendered портали) — Scheduled Task продължава проучването |

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
- **2026-07-18 rollout check (run-20260718-0000):** raw fetch на `mfe.gov.ro/informatii-de-interes-public/anunturi/`
  потвърди `requires_javascript=0` — server-rendered HTML таблица (Data publicare|Titlu|Descriere|
  Categorie anunt|Status), но извадката съдържа само архивни записи от 2019‑2020, не текущия програмен
  период 2021‑2027 — нужен е верният URL/секция за актуални покани преди implementация на parser.
  `oportunitati-ue.gov.ro/en/apeluri/` пак върна празно тяло на суров fetch → JS-rendered SPA
  потвърдено повторно; нужна е browser automation или открит JSON/API endpoint зад страницата.
  Доказателства записани в `source_audit_log` (ro-mfe, ro-oportunitati). `rollout_status` остава
  `sources_verified` — не е готов connector.
- **2026-07-18 rollout check #2 (run-20260718-0820):** проверен и алтернативен URL
  `mfe.gov.ro/pocidif/calendar-apeluri-de-proiecte-pocidif/` (календар на apeluri по
  текущата програма POCIDIF 2021‑2027, намерен чрез търсене) — страницата също връща
  празно тяло на суров fetch, т.е. вероятно е JS-rendered или динамично зареждан списък,
  не статичен HTML. `oportunitati-ue.gov.ro/en/apeluri/` потвърдено отново празно.
  Доказателства записани в `source_audit_log`. Няма открит structured/API endpoint.
  `rollout_status` остава `sources_verified` (blocked за production sync); следваща
  стъпка си остава browser automation или директен контакт за API достъп.
