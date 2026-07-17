# Ingestion — country connectors

Обща архитектура за внасяне на процедури от официалните източници на всяка държава.
**Няма 26 копия** — общата логика е в `core/`, всяка държава има само per-source
конфигурация + мапинги в `countries/<cc>/`.

## Структура
- `core/CountryConnector.js` — абстрактен единен интерфейс + споделени детерминистични
  помощни функции (hash, content hash, fingerprint, toIsoDate, normalizeStatus,
  validate). Бъдещи core модули: http (retry/backoff/rate limit), parse, persist (D1).
- `countries/<cc>/index.js` — connector на държавата (имплементира интерфейса).
- `index.js` — регистър `getConnector(countryCode, sources)`.

## Единен интерфейс (`CountryConnector`)
`discoverSources, fetchProgrammes, fetchCalls, fetchProcedureDetails, fetchDocuments,
normalizeProcedure, calculateContentHash, validateProcedure, mapStatus,
mapCandidateTypes, mapRegions, getOfficialUrl`.

Всеки `normalizeProcedure` връща запис с `country_code`, `source_id`,
`source_procedure_id` (или стабилен fingerprint), `official_url`, `original_language`,
`content_hash` — готов за upsert в D1 `projects` с уникален ключ
`(country_code, source_id, source_procedure_id)`.

## Статуси
- **BG** — reference. Реалният ingestion в момента е външен (Claude Scheduled Task
  пише в D1). Stub-ът тук е еталон + бъдеща точка за консолидация.
- **RO** — scaffold. Официалните източници са проверени (виж `docs/sources/ro.md`),
  но форматът не е финализиран (JS-rendered портали) → `fetchCalls` още не връща данни;
  RO **не** е активна.

## Правила
Само официални източници; никакво измисляне на липсващи данни; dedup по content hash;
процедура не се затваря след един пропуснат sync; активиране само след dry run + QA
(виж `docs/country-source-methodology.md` и `docs/multi-country-rollout-plan.md`).
