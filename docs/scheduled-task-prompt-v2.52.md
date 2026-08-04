# Scheduled Task `daily-eu-country-sync` — промпт v2.52.0 (дълбоко извличане)

> **Как се прилага:** този текст замества съдържанието на SKILL.md на задачата
> (`C:\Users\svetl\Claude\Scheduled\evroproekti-bulgaria-dneven-monitoring\SKILL.md`).
> Задачата НЕ може да променя сама конфигурацията си — промяната се прави отвън.
> Кронът остава `0 */5 * * *` (на всеки 5 часа).
>
> Логиката е огледална на кодовите модули, които вече са в репото и са покрити с
> тестове (`node test/deep-extraction.test.mjs` — 81 проверки):
> `src/ingestion/core/{coverage,quality,anomalies,documents,changes,run-report,scheduler}.js`.
> Промптът не бива да се разминава с тях — те са дефиницията.

---

## 0. Настройка

- D1: база `evroproekti-dashboard` (`d5f1bb40-3729-4c11-ae06-efbd4b5c9760`),
  акаунт `9c3fcd4952bcf0c295532e9884377d37`.
- `task_key` = `daily-eu-country-sync`.
- Времеви бюджет на изпълнение: **безопасен прозорец 50 минути**. Дръж 5 минути резерв
  за записване на cursor и отчет.
- **Всички времена идват от D1** — `datetime('now')`, `date('now')`, `strftime(...)`.
  Никога не пиши час, изчислен от теб.
- **Никакви локални файлове.** Прогрес, cursor, локове и резултати живеят само в D1.
- Генерирай `runId` (напр. `run-<started_at>`), с който подпечатваш всички записи в
  `project_change_history.run_id`, `project_anomalies.run_id`,
  `source_health_history.run_id`, `source_discovery_candidates.run_id`.

Начало на изпълнението:

```sql
SELECT datetime('now') AS started_at;
```

Запиши покритието ПРЕДИ работата (за `*_coverage_before`):

```sql
SELECT
  (SELECT COUNT(*) FROM projects) AS total,
  (SELECT COUNT(DISTINCT d.project_id) FROM documents d) AS with_documents,
  (SELECT COUNT(*) FROM project_details pd WHERE pd.has_primary_document = 1) AS with_primary_document,
  (SELECT COUNT(*) FROM projects p WHERE p.budget_amount_eur IS NOT NULL) AS with_budget,
  (SELECT ROUND(AVG(pd.completeness_score), 1) FROM project_details pd WHERE pd.completeness_score IS NOT NULL) AS avg_quality;
```

---

## 1. Планиране: weighted round-robin (НЕ по една държава на run)

Зареди cursor-а и агрегатите. **Без hardcoded списък с държави** — всичко идва от D1:

```sql
SELECT * FROM scheduled_country_sync_state WHERE task_key = 'daily-eu-country-sync';
```

```sql
SELECT c.code, c.slug, c.priority, c.enabled, c.ingestion_status, c.coverage_status,
       c.last_successful_sync_at, c.default_language, c.currency_code,
       (SELECT COUNT(*) FROM projects p WHERE p.country_code = c.code) AS total_procedures,
       (SELECT COUNT(DISTINCT d.project_id) FROM documents d
          JOIN projects p ON p.id = d.project_id WHERE p.country_code = c.code) AS procedures_with_documents,
       (SELECT COUNT(*) FROM projects p WHERE p.country_code = c.code AND p.budget_amount_eur IS NOT NULL) AS procedures_with_budget,
       (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code = c.code AND pd.has_primary_document = 1) AS procedures_with_primary_document,
       (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = c.code AND f.enabled = 1 AND f.verified = 1) AS verified_enabled_sources,
       (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = c.code AND f.source_health = 'failing') AS failing_sources,
       (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = c.code AND f.source_health = 'blocked') AS blocked_sources,
       (SELECT COUNT(*) FROM project_anomalies a WHERE a.country_code = c.code AND a.status = 'open') AS open_anomalies
  FROM countries c WHERE c.eu_member = 1 ORDER BY c.priority ASC, c.code ASC;
```

### 1.1 Разпредели времето по ЦЕЛ, не по държава

| Дял | Цел |
|---|---|
| **45%** | нови и актуализирани процедури от активни държави |
| **30%** | допълване на процедури без документи, бюджет или важни детайли |
| **15%** | държави с ниско историческо покритие |
| **10%** | откриване и проверка на нови официални източници |

### 1.2 Подреди държавите по реални причини

Приоритет (по-висок резултат = по-рано):

1. държави с **0 процедури**;
2. държави **без успешен sync** (никога, или > 3 дни);
3. държави с **ниско покритие с документи** (< 50%);
4. държави с **ниско покритие с бюджети** (< 35%);
5. държави с **малко исторически процедури** (< 10);
6. държави с **блокирани или failing източници**;
7. останалите — **round-robin по cursor-а** (`last_completed_country_code` → следващата).

`countries.priority` НЕ участва в резултата — той определя само базовата подредба.
Иначе точка 7 никога не би се задействала.

### 1.3 Никоя държава не монополизира изпълнението

- обработвай **до 15–25 пълни процедури** от държава;
- след тавана запиши country cursor-а и **премини към следващата държава**;
- при следващия цикъл продължи от запазената страница/процедура;
- изключение (до 2× таван) само при: критично затварящи процедури (краен срок ≤ 14 дни)
  или много голям backlog без документи.

**Цел: поне 4 различни държави на успешно изпълнение**, когато официалните източници
са достъпни и остава време за качествено извличане. Държавите се обработват
**последователно, никога паралелно.**

---

## 2. За всяка държава

1. **Вземи lock** в `country_sync_state` (TTL 50 мин):
   ```sql
   UPDATE country_sync_state SET locked_at=datetime('now'), locked_by=?1,
          lock_expires_at=datetime('now','+50 minute')
    WHERE country_code=?2 AND (lock_expires_at IS NULL OR lock_expires_at < datetime('now'));
   ```
   Ако `changes = 0` → държавата се обработва другаде; продължи със следващата.

2. **Зареди ВСИЧКИ източници** (не само основния портал):
   ```sql
   SELECT id, name, authority_name, authority_type, source_type, source_level,
          base_url, calls_url, archive_url, search_url, rss_url, api_url, sitemap_url,
          documents_url, source_language, requires_javascript, requires_pagination,
          supports_api, supports_rss, supports_sitemap, access_method, priority,
          enabled, verified, source_health, blocked_reason
     FROM funding_sources WHERE country_code = ?1
    ORDER BY primary_source DESC, priority ASC, id ASC;
   ```

3. Обработи по реда на целите от §1.1 — **нови/променени → допълване → откриване**.

4. **Освободи lock-а** и премести cursor-а:
   ```sql
   UPDATE country_sync_state SET locked_at=NULL, locked_by=NULL, lock_expires_at=NULL
    WHERE country_code=?1 AND locked_by=?2;
   ```

---

## 3. Официални източници — къде да търсиш

Само **официални** сайтове: национален портал за европейско финансиране, управляващи
органи, министерства, изпълнителни агенции, регионални програми, сайтове на отделни
оперативни програми, официални портали за покани и държавни помощи, официални RSS/XML/JSON
feeds, `sitemap.xml` и sitemap индекси, официални API endpoints, server-rendered search
страници, официалните страници на държавата в европейските портали.

**Неофициален агрегатор НИКОГА не е окончателен източник.** Може да послужи само като
следа към официалния адрес, който после потвърждаваш.

### 3.1 Когато основният портал е JS-rendered или блокиран

Пробвай в този ред и запиши какво се е случило:

1. `sitemap.xml` / sitemap index;
2. RSS;
3. публични API заявки, които самата страница прави от браузъра;
4. архивни страници на портала;
5. страниците на управляващите органи;
6. официални PDF списъци с процедури.

Резултатът задължително отива в `source_audit_log` **и** в `source_health_history`:

```sql
INSERT INTO source_health_history
  (source_id, country_code, checked_at, run_id, access_method, ok, http_status,
   response_time_ms, procedures_found, procedures_valid, documents_found, health,
   error_code, error_summary, created_at)
VALUES (?1,?2, datetime('now'), ?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, datetime('now'));
```

```sql
UPDATE funding_sources SET
  last_checked_at = datetime('now'), last_http_status = ?2, avg_response_time_ms = ?3,
  last_procedures_found = ?4, last_procedures_valid = ?5,
  total_procedures_found = total_procedures_found + COALESCE(?4,0),
  total_procedures_valid = total_procedures_valid + COALESCE(?5,0),
  access_method = COALESCE(?6, access_method), source_health = ?7, blocked_reason = ?8,
  last_success_at = CASE WHEN ?7='healthy' THEN datetime('now') ELSE last_success_at END,
  last_failure_at = CASE WHEN ?7 IN ('failing','blocked') THEN datetime('now') ELSE last_failure_at END,
  consecutive_failures = CASE WHEN ?7='healthy' THEN 0 ELSE consecutive_failures + 1 END,
  updated_at = datetime('now')
WHERE id = ?1;
```

### 3.2 Нови източници (10% дял)

Открит официален адрес, който още не е в `funding_sources`, се записва като **кандидат**,
не се активира директно:

```sql
INSERT INTO source_discovery_candidates
  (country_code, candidate_url, normalized_url, title, authority_name, authority_type,
   source_type, language, discovered_from, discovery_method, http_status, content_type,
   evidence_url, official_confidence, status, notes, run_id, first_seen_at, last_checked_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'new',?15,?16, datetime('now'), datetime('now'))
ON CONFLICT(country_code, normalized_url) DO UPDATE SET
  title = COALESCE(excluded.title, title), http_status = excluded.http_status,
  content_type = COALESCE(excluded.content_type, content_type),
  official_confidence = COALESCE(excluded.official_confidence, official_confidence),
  discovery_method = COALESCE(excluded.discovery_method, discovery_method),
  run_id = excluded.run_id, last_checked_at = datetime('now');
```

`normalized_url` = URL без схема, без `www.`, без fragment, без tracking параметри
(`utm_*`, `gclid`, `fbclid`, `ref`, `sessionid`…), с подредени останали параметри и без
завършващ `/`. Активиране в `funding_sources` става само след QA (≥ 3 валидни процедури).

---

## 4. За всяка процедура — редът на работа

1. Отвори официалната страница.
2. Извлечи базовите данни.
3. Открий всички pagination и detail links.
4. Открий всички официални документи на страницата.
5. Извлечи основния документ.
6. Извлечи финансовите приложения.
7. Сравни страницата с документите.
8. Структурирай бюджета.
9. Извлечи кандидатите, дейностите и разходите.
10. Изчисли content hash.
11. Сравни със съществуващия запис.
12. Запиши **само реалните промени**.
13. Добави записи в историята на промените.
14. Изчисли completeness score.
15. Обнови `last_seen_at` и `last_verified_at`.
16. Запиши всички аномалии.
17. Премини към следващата процедура.

**Непроменена процедура (същият content hash) не минава през AI анализ.** Обновяват се
само `last_seen_at` / `last_verified_at`.
**`first_seen` и `first_seen_at` НИКОГА не се пипат за съществуващ запис.**

### 4.1 Какво се извлича (полета в `projects`)

**Идентификация:** `name`, `title_native`, `short_title`, `official_identifier`,
`call_number`, `country_code`, `original_language`, `programme_period`, `program`,
`subprogramme`, `priority`, `specific_objective`, `measure`, `eu_fund`
(ERDF | ESF+ | CF | JTF | EAFRD | EMFAF | RRF | other), `managing_authority`,
`intermediate_body`, `official_url`, `application_url`.

**Описание:** `summary_native`, `summary_bg`, `objective`, `expected_results`,
`main_activities`, `eligible_activities`, `ineligible_activities`, `eligible_costs`,
`ineligible_costs`, `thematic_categories_json`, `economic_sectors_json`, `keywords_json`.

**Кандидати:** `applicant_types_json`, `enterprise_sizes_json`, `partnership_required`,
`min_partners`, `applicant_restrictions`, `geographic_scope`, `eligible_regions_json`,
`nuts_levels_json` — и нормализирано в `project_eligibility`
(dimension: `applicant_type` | `enterprise_size` | `sector` | `region` | `nuts` |
`activity` | `cost` | `partnership`; `eligible = 0` за изрично НЕдопустимите).

**Дати:** `publication_date`, `opening_date`, `deadline_date`, `deadline_time`,
`deadline_timezone`, `questions_deadline`, `clarifications_deadline`,
`expected_evaluation_date`, `expected_decision_date`, `cost_eligibility_start`,
`cost_eligibility_end`, `project_duration_min_months`, `project_duration_max_months`,
`source_last_modified_at`.

**Кандидатстване:** `application_mode`, `application_system`, `registration_required`,
`e_signature_required`, `procedure_stages` (`one_stage` | `two_stage`), `selection_type`
(`competitive` | `direct`), `intake_type` (`rolling` | `fixed_deadline`),
`submission_language`, `contact_name`, `contact_email`, `contact_phone`, `contact_unit`.

Ако едно поле не е публикувано — остава **NULL**. Не се измисля и не се извежда по аналогия.

---

## 5. Бюджет — какво влиза къде

`projects.budget_amount_eur` е **само бюджетът на процедурата в EUR**. Отделно се пазят:

- `budget_eu_cofinancing_eur`, `budget_national_cofinancing_eur`;
- `min_project_size_eur`, `max_project_size_eur`, `min_grant_eur`, `max_grant_eur`;
- в `project_budget_terms`: `min_financing_rate`, `max_financing_rate` (0..1),
  `own_contribution_rate`, `state_aid_regime`, `de_minimis_limit_eur`,
  `budget_is_indicative`, `budget_original_amount`, `budget_fx_rate`, `budget_fx_date`,
  `budget_source_type` (`page` | `document` | `annex`), `budget_source_url`,
  **`budget_scope`** (`procedure` | `programme` | `priority` | `per_project` | `eligible_costs`);
- в `project_budget_components`: разбивка по `fund`, `eu_cofinancing`,
  `national_cofinancing`, `applicant_category`, `region`, `component`, `year`, `state_aid`.

**`budget_scope` е задължителен**, когато има стойност. Без него процедурата получава
аномалия `scope_unknown` и стойността НЕ влиза в „Известен публикуван бюджет“.

### 5.1 Никога не смесвай

бюджет на програмата · бюджет на приоритет · бюджет на процедурата · максимален бюджет
на един проект · общ размер на допустимите разходи. Това са пет различни числа.

### 5.2 Противоречие страница ↔ документ

- използвай **най-новия официален документ**;
- запиши двете стойности в `project_anomalies` (`page_value` / `document_value`);
- маркирай процедурата `pending_review`;
- **не сумирай автоматично**.

### 5.3 Валути

EUR директно. BGN по фиксирания курс 1.95583. Другите валути на ЕС (PLN, CZK, HUF, DKK,
SEK, RON…) се конвертират по **текущия дневен референтен курс на ЕЦБ**, взет **веднъж в
началото на run-а**. `budget_currency` = оригиналната валута; курсът и датата отиват в
`project_budget_terms.budget_fx_rate` / `budget_fx_date` (и в `notes`).

### 5.4 Проверки за аномалии

`zero_budget` · `budget_out_of_range` (> 20 млрд EUR или < 1 000 EUR за процедура) ·
`duplicate_budget` (една и съща стойност в различни държави) · `project_budget_as_total`
(общ бюджет = максимална помощ за проект, или `budget_scope ≠ procedure`) ·
`currency_mismatch` (валута ≠ националната и ≠ EUR) · `invalid_min_max` (min > max,
процент извън 0..1) · `date_inconsistency`.

```sql
INSERT INTO project_anomalies
  (project_id, country_code, anomaly_type, severity, field_name, observed_value,
   expected_value, page_value, document_value, source_url, document_id, run_id,
   status, notes, detected_at, created_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'open',?13, datetime('now'), datetime('now'));
```

---

## 6. Документи

За **всяка** нова, променена или непълна процедура се прави задължителен опит да се
свалят всички релевантни официални файлове — не само един.

Класификация (`documents.doc_category`): `guidelines`, `call`, `conditions_apply`,
`conditions_exec`, `decision`, `application_form`, `budget_template`, `financial_annex`,
`declaration`, `evaluation_criteria`, `evaluation_methodology`, `faq`, `clarification`,
`amendment`, `corrigendum`, `eligible_activities_list`, `contract_template`, `annex`,
`presentation`, `other`.

**Основен официален документ** = `guidelines` | `conditions_apply` | `call` | `decision`.
Само той вдига `project_details.has_primary_document = 1` и `documents.is_primary = 1`.
Приложение, презентация или Q&A **не са** основен документ.

За всеки документ: `title`, `doc_category`, `source_url`, `normalized_url`, `language`,
`mime_type`, `size_bytes`, `published_at`, `version_label`, `checksum`, `is_amendment`,
`supersedes_document_id`, `summary_bg`, `extracted_deadlines_json`,
`extracted_budgets_json`, `extracted_criteria_json`, `extraction_status`,
`extraction_method`, `extraction_error`, `last_checked_at`, `run_id`.

### 6.1 Дедупликация

Преди запис нормализирай URL-а и провери:

```sql
SELECT id, checksum, doc_category, is_primary, version_label
  FROM documents WHERE project_id = ?1 AND normalized_url = ?2 LIMIT 1;
```

- няма ред → **INSERT** нов документ;
- има ред, различен `checksum` → **нова версия** (старата се запазва):
  ```sql
  INSERT OR IGNORE INTO document_versions
    (document_id, project_id, country_code, version_label, checksum, source_url,
     normalized_url, published_at, size_bytes, mime_type, is_amendment, change_summary,
     run_id, created_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, datetime('now'));
  ```
- същият `checksum` → само `last_checked_at`.

### 6.2 PDF

Първо директно текстово извличане. OCR **само** като резервен вариант.
Нечетим документ **не е** успешно обработен: `extraction_status = 'failed'` +
`extraction_error` с причината. Не отбелязвай процедурата като „с документ“ на базата
на файл, който не е прочетен.

### 6.3 Ако порталът наистина не публикува документи

Това се доказва, не се предполага:
`project_details.documents_published_by_source = 0` +
`documents_absence_evidence_url` = адресът, който го показва. Само тогава процедурата
може да достигне `quality_status = 'complete'` без основен документ.

---

## 7. История на промените (append-only)

За всяка реална разлика:

```sql
INSERT INTO project_change_history
  (project_id, country_code, field_name, old_value, new_value, change_type, significance,
   detected_from, source_url, document_id, run_id, changed_at, created_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, datetime('now'), datetime('now'));
```

`change_type`: `deadline_change` | `budget_change` | `status_change` | `document_added` |
`eligibility_change` | `amendment` | `correction` | `other`.
`significance`: `critical` | `major` | `minor`.
`detected_from`: `page` | `document` | `api` | `feed`.

**Особено важни:** удължен/съкратен срок, увеличен/намален бюджет, промяна на допустимите
кандидати, промяна на процента финансиране, ново изменение, нов документ, отменена
процедура, повторно отворена процедура.

Първоначално попълване на празно поле е `correction` / `minor` (обогатяване), не промяна.
**Историята не се презаписва и не се трие.**

---

## 8. Оценка на качеството

Completeness score 0–100:

| Тежест | Критерий |
|---|---|
| 10 | официално заглавие и URL |
| 15 | валиден статус и срок (постоянен прием е валиден без дата) |
| 20 | официален основен документ |
| 15 | структуриран бюджет (стойност + обхват + диапазон) |
| 10 | допустими кандидати |
| 10 | допустими дейности и разходи |
| 10 | програма, фонд и управляващ орган |
| 5 | начин на кандидатстване и контакти |
| 5 | проверена дата и source metadata |

Статуси: `complete` 85–100 · `good` 70–84 · `partial` 40–69 · `incomplete` < 40 ·
`pending_review` при открита аномалия или противоречие.

**Процедура без официален документ не може да е `complete`**, освен ако §6.3 е доказано.

```sql
INSERT INTO project_details
  (project_id, country_code, completeness_score, quality_status, quality_computed_at,
   source_version, has_primary_document, documents_published_by_source,
   documents_absence_evidence_url, detail_extraction_status, detail_extracted_at,
   last_run_id, created_at, updated_at)
VALUES (?1,?2,?3,?4, datetime('now'), ?5,?6,?7,?8,?9, datetime('now'), ?10, datetime('now'), datetime('now'))
ON CONFLICT(project_id) DO UPDATE SET
  completeness_score = excluded.completeness_score,
  quality_status = excluded.quality_status,
  quality_computed_at = datetime('now'),
  has_primary_document = excluded.has_primary_document,
  detail_extraction_status = excluded.detail_extraction_status,
  detail_extracted_at = datetime('now'),
  last_run_id = excluded.last_run_id,
  updated_at = datetime('now');
```

---

## 9. Cursor и поведение при timeout

Отделен cursor за pagination:

```sql
INSERT INTO source_pagination_cursors
  (task_key, country_code, source_id, section, page, item_offset, last_procedure_id,
   pages_seen, exhausted, last_run_id, updated_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10, datetime('now'))
ON CONFLICT(task_key, country_code, source_id, section) DO UPDATE SET
  page = excluded.page, item_offset = excluded.item_offset,
  last_procedure_id = excluded.last_procedure_id, pages_seen = excluded.pages_seen,
  exhausted = excluded.exhausted, last_run_id = excluded.last_run_id,
  updated_at = datetime('now');
```

`section` = `current` | `archive`.

Глобален cursor:

```sql
UPDATE scheduled_country_sync_state SET
  current_country_code = ?2, current_source_id = ?3, current_section = ?4,
  current_page = ?5, current_item_offset = ?6, last_processed_procedure_id = ?7,
  last_completed_country_code = ?8, completed_countries_in_cycle = ?9,
  total_countries_in_cycle = ?10, cycle_number = ?11, allocation_json = ?12,
  last_run_started_at = ?13, last_run_completed_at = datetime('now'),
  updated_at = datetime('now')
WHERE task_key = 'daily-eu-country-sync';
```

**При наближаващ timeout:** спри контролирано, запиши ТОЧНИЯ cursor (държава, източник,
секция, страница, offset, последна обработена процедура), освободи lock-а, запиши отчета
със статус `partial` и попълни `next_country` / `next_source` / `next_cursor`.
Следващото изпълнение продължава оттам — **не започва отначало и не започва от BG**.

---

## 10. Отчет

Покритието СЛЕД работата се измерва със същата заявка от §0. После:

```sql
INSERT INTO scheduled_sync_runs (
  task_key, started_at, completed_at, status, cycle_number,
  start_country_code, end_country_code,
  countries_attempted, countries_succeeded, countries_failed,
  sources_attempted, sources_succeeded, sources_failed,
  records_seen, records_inserted, records_updated, records_unchanged, records_invalid,
  documents_inserted, continuation_country_code, safe_summary, created_at,
  countries_touched, countries_fully_processed, sources_checked, new_sources_discovered,
  source_failures, procedures_discovered, procedures_created, procedures_updated,
  procedures_unchanged, procedures_completed, procedures_revisited,
  documents_discovered, documents_downloaded, document_versions_added,
  budgets_extracted, budgets_converted, eligibility_records_added,
  anomalies_detected, changes_recorded, average_quality_score,
  document_coverage_before, document_coverage_after,
  budget_coverage_before, budget_coverage_after,
  next_country, next_source, next_cursor,
  countries_json, sources_json, time_allocation_json, blocked_sources_json
) VALUES (…, datetime('now'), …, datetime('now'), …);
```

Алтернативно (по-удобно): `POST /api/internal/sync-runs/report` с HMAC подпис
(`SCHEDULED_TASK_REPORTING_SECRET`, заглавки `x-report-signature` / `x-report-timestamp`) —
Worker-ът записва всичко и слага времената от D1.

След това обнови snapshot-а за `/about` (стъпка 6В — само при успешен run) със
`SNAPSHOT_SQL` от `worker/statistics.js`, и подай AI отчета към
`POST /api/internal/ai-runs/report` с блок `metrics`.

### `safe_summary` (кратко, без тайни)

> Държави: BG, RO, GR, PL (4 засегнати, 2 завършени). Източници: 11 проверени, 2 нови
> кандидати, 1 неуспешен. Процедури: +7 нови, 12 обновени, 44 без промяна, 18 допълнени
> стари. Документи: 23 свалени от 31 открити, 3 нови версии. Бюджети: 14 структурирани
> (5 конвертирани в EUR). Покритие: документи 62.4% (+3.1 п.п.), бюджети 41.0% (+1.2 п.п.).
> Средно качество: 68.4/100. Аномалии: 3 за преглед. Блокирани портали: PL:pl-main.
> Следва: HU / hu-palyazat.

---

## 11. Забрани (проверявай се преди всеки запис)

- ❌ hardcoded списък с държави — държавите идват само от `countries`;
- ❌ локални progress файлове — прогресът е само в D1;
- ❌ паралелна обработка на държави;
- ❌ измислени процедури, бюджети, документи, срокове или валутни курсове;
- ❌ времена, изчислени извън D1;
- ❌ триене на стари записи при неуспешен източник;
- ❌ презаписване на историята на промените;
- ❌ промяна на `first_seen` / `first_seen_at` за съществуващ запис;
- ❌ повторен AI анализ на непроменена процедура;
- ❌ неофициален агрегатор като окончателен източник;
- ❌ сумиране на бюджети от различни обхвати;
- ❌ активиране на държава/източник без QA (≥ 3 валидни процедури);
- ❌ повече процедури от тавана за една държава без основанието от §1.3;
- ✅ **качество пред брой процедури** — по-добре 15 добре извлечени, отколкото 60 плитки.
