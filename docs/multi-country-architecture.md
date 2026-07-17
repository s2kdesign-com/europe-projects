# Multi‑country архитектура — Европроекти / euro‑funds.eu

Статус: жив документ. Последна редакция: 2026‑07‑18.

## 1. Цел
Превръщане на платформата от само‑България в обща платформа за 27‑те държави
членки на ЕС, **без** 26 копия на приложението. Една кодова база, един data model,
отделни connectors за държавите, централен регистър на източниците, задължително
country filtering, отделно състояние за език и за държава.

## 2. Текущо състояние (as‑is), проверено на 2026‑07‑18
- **Frontend:** Next.js 15 `output: "export"` (чист статичен export) + ръчно написан
  Cloudflare Worker (`worker.js`, `worker/*.js`) + D1.
- **Данни:** таблица `projects` (= процедурите). Всички записи са български. Обслужват
  се от Worker‑а без country филтър:
  - `GET /api/projects` → `SELECT … FROM projects ORDER BY status, deadline_date`
  - `GET /api/project?id=` → една процедура + документи
  - `documents` (FK по `project_id`), `snapshots` (дневно резюме).
- **Ingestion:** в репото **няма** scraper. Данните се поддържат външно (Claude
  Scheduled Task пише в D1). Затова „адаптиране на България connector“ на практика
  означава: дефинираме общ connector интерфейс + reference stub за BG, а реалният
  ingestion остава в Scheduled Task, докато не се пренесе.
- **i18n:** react‑i18next, `bg.json` е източникът на истината; другите 25 езика се
  генерират динамично през Google Translation v3 (Worker) + D1 `translation_cache`.
  Езикът се пази в профил/localStorage — **отделно** от държавата.
- **Auth:** Google OAuth (Worker), `users/sessions/oauth_accounts`, роли/админ.
- **D1 таблици (as‑is):** projects, documents, snapshots, users, sessions,
  oauth_accounts, oauth_state, user_profiles, user_preferences, saved_procedures,
  changelog_entries, translation_cache, error_log, feedback.

## 3. Целева архитектура (to‑be)

### 3.1 Данни (D1)
Нови таблици (additive, без да пипаме съществуващите данни):
- `countries` — регистър на 27‑те държави (seed + статуси на покритие/ingestion).
- `funding_sources` — централен регистър на официалните източници, per държава.
- `source_audit_log` — одит на всяка проверка на източник (доказателства).
- `country_sync_state` — състояние на дневната синхронизация per държава (cursor,
  next_run_at, брой записи, грешки).
- `source_sync_runs` — метрики per source run.

Разширения на съществуващи таблици (additive колони, default‑и, backfill BG):
- `projects`: `country_code` (NOT NULL след backfill, default 'BG'), `source_id`,
  `source_procedure_id`, `source_programme_id`, `original_language`, `official_url`,
  `managing_authority`, `regions_json`, `source_published_at`, `source_updated_at`,
  `first_seen_at`, `last_seen_at`, `last_verified_at`, `content_hash`, `source_status`,
  `ingestion_status`, `ai_analysis_status`, `translation_status`, `data_quality_score`,
  `data_quality_flags_json`.
- `documents`: наследяват `country_code` и attribution през процедурата (добавяме
  `country_code`, `source_id` за бърз филтър/одит).
- `user_profiles`: `preferred_country`, `country_mode` ('auto'|'manual'),
  `country_detection_enabled`, `country_updated_at`.

Индекси: `projects(country_code,status)`, `(country_code,deadline_date)`,
`(country_code,program)`, `(country_code,category)`, `(country_code,last_updated)`,
`(country_code,content_hash)`, уникален `(country_code,source_id,source_procedure_id)`;
`funding_sources(country_code)`, `(enabled)`, `(verified)`, `(source_health)`,
`(next_run_at)`, `(country_code,priority)`.

### 3.2 Разделяне език ↔ държава
Два независими стейта:
- **Език** (вече съществува): `user_preferences.language` + localStorage.
- **Държава** (ново): `CountryContext` + `eurofunds_country_v1` (guest) +
  `user_profiles.preferred_country` (профил).
След ръчен избор на държава **не** сменяме автоматично езика и обратно.

### 3.3 Country resolution (приоритет)
1. Изричен country в URL (когато route‑ът го поддържа: `/countries/:slug/...`).
2. Manual preference от профила (logged‑in).
3. Manual guest preference от localStorage.
4. Cloudflare `request.cf.country` (приблизително, **без** raw IP).
5. Region subtag от `navigator.languages` (напр. `ro-RO` → RO).
6. България (временен fallback).

`detectionSource ∈ {url, profile, local, cloudflare, browser_locale, fallback}`.
`countryMode ∈ {auto, manual}`. Automatic detection **никога** не се записва като manual.

### 3.4 Connector архитектура
`src/ingestion/core/` — споделени части: HTTP client, retry/backoff, rate limiting,
HTML parsing, date/currency нормализация, content hashing, dedup, document download,
encoding detection, source logging, telemetry, D1 persistence.
`src/ingestion/countries/<cc>/` — per държава connector, имплементиращ единния
интерфейс (`CountryConnector`): `discoverSources, fetchProgrammes, fetchCalls,
fetchProcedureDetails, fetchDocuments, normalizeProcedure, calculateContentHash,
validateProcedure, mapStatus, mapCandidateTypes, mapRegions, getOfficialUrl`.
**Никакво** копиране на цялата BG логика — само per‑source конфигурация + мапинги.

### 3.5 Оркестрация
`CountrySyncOrchestrator` (country‑aware, а не 26 копия): избира държави/източници с
настъпил `next_run_at`, обработва последователно, пази continuation cursor в
`country_sync_state`, retries/backoff, per‑source rate limit, content hashes срещу
повторно изпращане, не затваря процедура при един пропуснат sync (изисква няколко
последователни липси или официален closed статус), пише метрики в `source_sync_runs`,
продължава при грешка в една държава без да блокира останалите; translation + AI
analysis само след успешни normalization + validation.

### 3.6 API (country‑aware)
Всички публични data endpoints приемат и валидират `country`:
`GET /api/projects?country=RO`, `/api/project?id=…` (държавата идва от самата
процедура), бъдещи `/api/overview?country=`, `/api/calendar?country=`,
`/api/sources?country=`. Default при липса = BG (съвместимост). Невалиден код → 400.
Cache key включва country+locale+route+filters+data version.

### 3.7 Frontend
`CountryProvider/CountryContext/useCountry()` на върха; country selector във footer,
профил и информационния модал; `CountryLogoMark` (локални SVG знамена като фон зад
продуктовото лого); `CountrySourcesPanel/Page` за официалните източници per държава;
задължителен country филтър във всички изгледи (overview, procedures, calendar, saved,
charts, feed, compare, export, recommendations).

### 3.8 Privacy
Само приблизителен country код от Cloudflare. **Не** се пази raw IP / CF‑Connecting‑IP
/ град / координати / ISP / fingerprint. Няма precise geolocation. Country detection е
отделно от Analytics/Ads consent. Настройка за изключване на автоматичното предложение.

## 4. Съвместимост / безопасност
Всички миграции са additive. България не се трие. Съществуващите BG URL‑и и функции
работят непроменени (country default = BG). Constraints (NOT NULL/уникалност) се
добавят **след** успешен backfill. Rollback: additive колони/таблици може да се
игнорират; данните на BG остават валидни без нови колони.
