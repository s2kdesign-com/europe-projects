# Claude Scheduled Task — multi-country daily sync (замяна на BG-only задачата)

Дата: 2026-07-18. Статус: **приложено директно** — задачата
`evroproekti-bulgaria-dneven-monitoring` (cron `0 8 * * *`, локално 08:00) беше
актуализирана през scheduled-tasks API с новия prompt по-долу.

## Анализ на старата задача
- **Task:** `evroproekti-bulgaria-dneven-monitoring`, ежедневно 08:00, enabled.
- **Стар prompt:** three-part BG-only workflow — (1) web проучване на eufunds.bg/
  esf.bg/az/ПКИП/НПВУ, (2) сваляне+разархивиране на документи, (3) UPSERT в D1
  `projects`/`documents`/`snapshots`. Прогрес: няма cursor; всяко изпълнение
  започва отначало (само BG, така че беше приемливо). Ново/променено: по `id`
  (стабилен слъг) + `is_new`; без content hash. Грешки: без структуриран отчет.
  Timeout: без continuation. Source health: няма. Пълният стар prompt е запазен
  в историята на файла `C:\Users\svetl\Claude\Scheduled\evroproekti-bulgaria-dneven-monitoring\SKILL.md`.
- Задачата НЕ може сама да променя конфигурацията си; актуализацията е направена
  отвън (от тази сесия) чрез scheduled-tasks API.

## Какво е новото
- Държавите се зареждат **динамично от D1 `countries`** (никакъв hardcoded списък).
- **Persistent cursor** в `scheduled_country_sync_state` (task_key
  `daily-eu-country-sync`) — следващият run продължава от следващата държава
  (round-robin), не от България.
- **Locks** върху `country_sync_state` (locked_at/locked_by/lock_expires_at).
- **Timeout safety** — контролирано спиране + continuation cursor.
- **Run reports** в `scheduled_sync_runs`.
- Група A (production sync): `ingestion_status IN ('connector_ready','active','degraded')`
  + поне 1 verified&enabled източник. Група B: rollout продължава без production запис.
- Логиката е огледална на кодовите модули `src/ingestion/core/scheduler.js`
  (cursor/locks/timeout, тествани с 22 unit теста) и `CountrySyncOrchestrator`.

## Новият prompt (приложен)
Вижте точния текст в SKILL.md на задачата. Резюме на структурата:
0) Настройка (D1 credentials, task key, времеви бюджет) → 1) Зареди cursor +
държави от D1 → 2) Планирай run-а (round-robin от cursor-а, макс 2 държави +
rollout стъпка) → 3) Per държава: lock → източници от D1 → sync по connector
правилата (за BG: пълният досегашен BG workflow, вкл. документи/архиви) →
validate/dedup/upsert → метрики → release lock → премести cursor → 4) Rollout
на следващата неготова държава (само една, без production запис) → 5) Запиши
`scheduled_sync_runs` отчет (rollout прогресът е в `safe_summary`) → 6) Чат
резюме по държави.

**Прогресът е само в D1 (обновено 2026-07-19):** премахната е всякаква работа с
локални файлове. Задачата вече НЕ чете/пише `docs/multi-country-progress.md` (или
друг файл на диска). Rollout/статус прогресът живее в D1: `countries`
(ingestion_status/coverage_status/last_successful_sync_at), кратка rollout бележка в
`scheduled_sync_runs.safe_summary`, cursor в `scheduled_country_sync_state`, блокери
в `source_audit_log`. Файлът `multi-country-progress.md` остава само като исторически
документ и не се поддържа от задачата.

## Ключови забрани (вградени в prompt-а)
Без hardcoded държави; без паралелни държави; не започвай винаги от BG; не губи
progress при timeout; без production sync без готов connector; само verified
източници; без BG connector като fallback; не трий стари записи при source
failure; без повторен AI анализ на unchanged; не пипай Google login/preferences;
**без локални файлове — целият прогрес само в D1**.
