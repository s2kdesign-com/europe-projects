# Ежедневна синхронизация на европейското финансиране (`daily-eu-country-sync`)

> **Как се прилага:** това е ПЪЛНОТО съдържание на SKILL.md за задачата
> `evroproekti-bulgaria-dneven-monitoring`. Замества стария текст изцяло.
> Ако съществуващият файл има YAML frontmatter (`--- name: … description: … ---`),
> запази го и замени само тялото под него. Кронът остава `0 */5 * * *`.
>
> Процедурата е **самодостатъчна**: всяка заявка, всеки endpoint и всяко правило са
> тук. Тя НЕ чете файлове от диска и НЕ разчита на кода в репото.

---

## 0. Настройка на изпълнението

- **D1:** база `evroproekti-dashboard`, id `d5f1bb40-3729-4c11-ae06-efbd4b5c9760`,
  акаунт `9c3fcd4952bcf0c295532e9884377d37`.
- **`task_key`** = `daily-eu-country-sync`.
- **Времеви бюджет:** безопасен прозорец **50 минути**. Запази последните **5 минути**
  за cursor + отчет. Никога не влизай в нова процедура, ако остават < 3 минути.
- **Всички времена идват от D1** — `datetime('now')`, `date('now')`, `strftime(...)`.
  Никога не пиши час, изчислен от теб или от системата, на която работиш.
- **Никакви локални файлове.** Прогрес, cursor, локове и резултати живеят само в D1.

### 0.1 Начало

```sql
SELECT datetime('now') AS started_at;
```

Запомни стойността като `startedAt` — тя е ключът за идемпотентност на отчета.
Създай `runId = 'run-' || startedAt` и подпечатай с него **всеки** запис в
`project_change_history.run_id`, `project_anomalies.run_id`,
`source_health_history.run_id`, `source_discovery_candidates.run_id`,
`project_details.last_run_id`, `document_versions.run_id`.

### 0.2 Покритие ПРЕДИ работата (за `*_coverage_before`)

```sql
SELECT
  (SELECT COUNT(*) FROM projects) AS total,
  (SELECT COUNT(DISTINCT d.project_id) FROM documents d) AS with_documents,
  (SELECT COUNT(*) FROM project_details pd WHERE pd.has_primary_document = 1) AS with_primary_document,
  (SELECT COUNT(*) FROM projects p WHERE p.budget_amount_eur IS NOT NULL) AS with_budget,
  (SELECT ROUND(AVG(pd.completeness_score), 1) FROM project_details pd WHERE pd.completeness_score IS NOT NULL) AS avg_quality;
```

Процентите се смятат само когато `total > 0`; при `total = 0` покритието е **NULL**, не 0.

### 0.3 Валутен курс — веднъж за целия run

Вземи дневния референтен курс на **ЕЦБ** ЕДИН път в началото:
`https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`.
Запомни курса и датата от самия XML (`time` атрибута). Ако не е достъпен —
чуждите валути този run **не се конвертират** (`budget_amount_eur` остава NULL);
това не е грешка и не спира изпълнението.

Изключения, които НЕ минават през ЕЦБ:
- **EUR** → директно;
- **BGN** → фиксиран курс **1.95583**.

---

## 1. Планиране: weighted round-robin

Държавите идват **само** от D1. Никакъв hardcoded списък с кодове.

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

### 1.1 Раздели времето по ЦЕЛ, не по държава

| Дял | Цел | Какво значи |
|---|---|---|
| **45%** | нови и актуализирани процедури | обхождане на списъците от активните държави |
| **30%** | допълване | стари процедури без документи, бюджет или детайли (§1.4) |
| **15%** | ниско покритие | държави с малко или никакви данни |
| **10%** | откриване | нови официални източници и проверка на блокираните |

Дяловете са ориентир за разпределение на времето, не твърди таймери. Ако едната цел
се изчерпи по-рано, остатъкът отива в следващата по ред.

### 1.2 Подреди държавите по реални причини

По-висок резултат = по-рано:

1. държави с **0 процедури**;
2. държави **без успешен sync** (никога, или > 3 дни) — колкото по-стар, толкова по-високо;
3. държави с **покритие с документи < 50%**;
4. държави с **покритие с бюджети < 35%**;
5. държави с **< 10 исторически процедури**;
6. държави с **блокирани или failing източници**;
7. останалите — **round-robin по cursor-а**: следващата след
   `last_completed_country_code`; при равен резултат печели по-близката до cursor-а.

`countries.priority` **НЕ участва** в резултата — той определя само базовата подредба
на кръга. Ако участваше, точка 7 никога нямаше да се задейства и държавите с нисък
приоритет щяха да монополизират всеки run.

### 1.3 Никоя държава не монополизира изпълнението

- **до 15–25 пълни процедури** от държава;
- след тавана запиши country cursor-а и **премини към следващата държава**;
- при следващия цикъл продължи от запазената страница/процедура;
- **изключение до 2× таван** само при:
  - критично затварящи процедури (краен срок ≤ 14 дни), или
  - много голям натрупан backlog без документи.

```sql
SELECT COUNT(*) AS n FROM projects
 WHERE country_code = ?1 AND status IN ('open','closing_soon')
   AND deadline_date IS NOT NULL AND deadline_date <= date('now','+14 day');
```

**Цел: поне 4 различни държави на успешно изпълнение**, когато официалните източници са
достъпни и остава време за качествено извличане. Държавите се обработват
**последователно, никога паралелно**.

### 1.4 Опашки за допълване (30% дял)

```sql
-- без документи
SELECT p.id, p.name, p.official_url, p.link, p.source_id, p.deadline_date, p.status
  FROM projects p LEFT JOIN documents d ON d.project_id = p.id
 WHERE p.country_code = ?1 AND d.id IS NULL
 ORDER BY CASE WHEN p.status IN ('open','closing_soon') THEN 0 ELSE 1 END,
          p.deadline_date IS NULL, p.deadline_date ASC
 LIMIT ?2;
```

```sql
-- без структуриран бюджет
SELECT p.id, p.name, p.official_url, p.link, p.budget, p.budget_currency, p.deadline_date, p.status
  FROM projects p
 WHERE p.country_code = ?1 AND p.budget_amount_eur IS NULL
 ORDER BY CASE WHEN p.status IN ('open','closing_soon') THEN 0 ELSE 1 END,
          p.budget IS NULL, p.deadline_date ASC
 LIMIT ?2;
```

```sql
-- с непълни детайли
SELECT p.id, p.name, p.official_url, p.link, p.status, p.deadline_date
  FROM projects p LEFT JOIN project_details pd ON pd.project_id = p.id
 WHERE p.country_code = ?1
   AND (pd.project_id IS NULL OR pd.completeness_score IS NULL OR pd.completeness_score < 70)
 ORDER BY COALESCE(pd.completeness_score, -1) ASC,
          CASE WHEN p.status IN ('open','closing_soon') THEN 0 ELSE 1 END,
          p.deadline_date ASC
 LIMIT ?2;
```

---

## 2. Права за запис: Група A и Група B

Не всяка държава има право на **production запис**. Проверявай преди да пишеш в `projects`:

**Група A — production sync разрешен.** И трите условия едновременно:
- `ingestion_status` ∈ (`connector_ready`, `active`, `degraded`);
- поне **1** източник с `enabled = 1 AND verified = 1`;
- форматът на източника е потвърден при предишно обхождане (има поне един успешен
  запис в `source_health_history` с `ok = 1`, или държавата вече има процедури).

**Група B — rollout без production запис.** `ingestion_status` ∈ (`not_started`,
`researching`, `sources_verified`, `connector_in_progress`, `blocked`).
За тях: проверявай източници, записвай health и кандидати, **но не създавай процедури**.
Придвижвай `ingestion_status` напред само на базата на доказан резултат:
`researching` → `sources_verified` (потвърден официален URL) →
`connector_in_progress` (форматът е разчетен) → `connector_ready` (**≥ 3 валидни
процедури** са извлечени пробно). Активиране (`enabled = 1`) **само след QA**.

На всяко изпълнение придвижвай **най-много една** държава от Група B.

---

## 3. За всяка държава от опашката

### 3.1 Вземи lock

```sql
UPDATE country_sync_state SET locked_at=datetime('now'), locked_by=?1,
       lock_expires_at=datetime('now','+50 minute')
 WHERE country_code=?2 AND (lock_expires_at IS NULL OR lock_expires_at < datetime('now'));
```

`changes = 0` → държавата се обработва другаде. Продължи със следващата, не чакай.

### 3.2 Зареди ВСИЧКИ източници (не само основния портал)

```sql
SELECT id, name, authority_name, authority_type, source_type, source_level,
       base_url, calls_url, archive_url, search_url, rss_url, api_url, sitemap_url,
       documents_url, source_language, requires_javascript, requires_pagination,
       supports_api, supports_rss, supports_sitemap, access_method, priority,
       enabled, verified, source_health, blocked_reason
  FROM funding_sources WHERE country_code = ?1
 ORDER BY primary_source DESC, priority ASC, id ASC;
```

### 3.3 Обработи по реда на целите

нови/променени → допълване → откриване на източници.

### 3.4 Освободи lock-а

```sql
UPDATE country_sync_state SET locked_at=NULL, locked_by=NULL, lock_expires_at=NULL
 WHERE country_code=?1 AND locked_by=?2;
```

### 3.5 Обнови агрегатите на държавата

```sql
UPDATE country_sync_state SET
  last_started_at = ?2, last_completed_at = datetime('now'),
  last_success_at = CASE WHEN ?3 = 'ok' THEN datetime('now') ELSE last_success_at END,
  last_error_at   = CASE WHEN ?3 <> 'ok' THEN datetime('now') ELSE last_error_at END,
  last_error_summary = ?4,
  consecutive_failures = CASE WHEN ?3 = 'ok' THEN 0 ELSE consecutive_failures + 1 END,
  total_records_seen = total_records_seen + ?5,
  inserted_records = inserted_records + ?6,
  updated_records  = updated_records  + ?7,
  unchanged_records = unchanged_records + ?8,
  invalid_records  = invalid_records  + ?9,
  updated_at = datetime('now')
WHERE country_code = ?1;
```

Само при **успешен** обход на държавата:

```sql
UPDATE countries SET
  last_successful_sync_at = datetime('now'),
  source_count = (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = countries.code),
  active_source_count = (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code = countries.code AND f.enabled = 1),
  coverage_status = ?2,
  updated_at = datetime('now')
WHERE code = ?1;
```

`coverage_status`: `none` (0 процедури) · `partial` (< 10) · `active` (≥ 10 и здрав
основен източник) · `degraded` (има процедури, но основният източник е failing/blocked).

---

## 4. Официални източници

Само **официални** сайтове: национален портал за европейско финансиране, управляващи
органи, министерства, изпълнителни агенции, регионални програми, сайтове на отделни
оперативни програми, официални портали за покани и държавни помощи, официални RSS/XML/JSON
feeds, `sitemap.xml` и sitemap индекси, официални API endpoints, server-rendered search
страници, официалните страници на държавата в европейските портали.

**Неофициален агрегатор НИКОГА не е окончателен източник.** Може да е само следа към
официалния адрес, който после потвърждаваш.

### 4.1 Когато основният портал е JS-rendered или блокиран

Пробвай в този ред и запиши какво се е случило:

1. `sitemap.xml` / sitemap index;
2. RSS;
3. публични API заявки, които самата страница прави от браузъра;
4. архивни страници на портала;
5. страниците на управляващите органи;
6. официални PDF списъци с процедури.

Резултатът отива и в двата дневника:

```sql
INSERT INTO source_audit_log
  (source_id, country_code, checked_at, checked_by, status, http_status, content_type,
   result_summary, evidence_url, notes)
VALUES (?1,?2, datetime('now'), ?3,?4,?5,?6,?7,?8,?9);
```

```sql
INSERT INTO source_health_history
  (source_id, country_code, checked_at, run_id, access_method, ok, http_status,
   response_time_ms, procedures_found, procedures_valid, documents_found, health,
   error_code, error_summary, created_at)
VALUES (?1,?2, datetime('now'), ?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, datetime('now'));
```

`access_method`: `html` | `sitemap` | `rss` | `api` | `archive` | `search`.
`health`: `healthy` | `degraded` | `failing` | `blocked` | `unknown`.

После обнови агрегата на източника. **`total_*` НЕ се инкрементират** — извеждат се от
дневника, групиран по `run_id`, за да не се броят двойно при повторен опит:

```sql
UPDATE funding_sources SET
  last_checked_at = datetime('now'),
  last_http_status = ?2, avg_response_time_ms = ?3,
  last_procedures_found = ?4, last_procedures_valid = ?5,
  total_procedures_found = (SELECT COALESCE(SUM(found),0) FROM
    (SELECT MAX(procedures_found) AS found FROM source_health_history
      WHERE source_id = ?1 AND run_id IS NOT NULL GROUP BY run_id)),
  total_procedures_valid = (SELECT COALESCE(SUM(valid),0) FROM
    (SELECT MAX(procedures_valid) AS valid FROM source_health_history
      WHERE source_id = ?1 AND run_id IS NOT NULL GROUP BY run_id)),
  access_method = COALESCE(?6, access_method),
  source_health = ?7, blocked_reason = ?8,
  last_success_at = CASE WHEN ?7='healthy' THEN datetime('now') ELSE last_success_at END,
  last_failure_at = CASE WHEN ?7 IN ('failing','blocked') THEN datetime('now') ELSE last_failure_at END,
  consecutive_failures = CASE WHEN ?7='healthy' THEN 0 ELSE consecutive_failures + 1 END,
  updated_at = datetime('now')
WHERE id = ?1;
```

Неуспешен източник **не трие** нито една стара процедура.

### 4.2 Нови източници (10% дял)

Открит официален адрес, който още не е в `funding_sources`, се записва като **кандидат**
и НЕ се активира:

```sql
INSERT INTO source_discovery_candidates
  (country_code, candidate_url, normalized_url, title, authority_name, authority_type,
   source_type, language, discovered_from, discovery_method, http_status, content_type,
   evidence_url, official_confidence, status, notes, run_id, first_seen_at, last_checked_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'new',?15,?16, datetime('now'), datetime('now'))
ON CONFLICT(country_code, normalized_url) DO UPDATE SET
  title = COALESCE(excluded.title, title),
  http_status = excluded.http_status,
  content_type = COALESCE(excluded.content_type, content_type),
  official_confidence = COALESCE(excluded.official_confidence, official_confidence),
  discovery_method = COALESCE(excluded.discovery_method, discovery_method),
  run_id = excluded.run_id, last_checked_at = datetime('now');
```

`discovery_method`: `sitemap` | `rss` | `api` | `link` | `search` | `eu_portal` | `pdf_list`.
`official_confidence` 0..1 — правителствен домейн на държавата и посочен официален орган
дават висока стойност; всичко останало е под 0.5.

### 4.3 Нормализация на URL (задължителна преди всяко сравнение)

Малки букви за хоста · без схема · без `www.` · без fragment (`#…`) · без tracking
параметри (`utm_*`, `gclid`, `fbclid`, `msclkid`, `yclid`, `mc_cid`, `mc_eid`, `_ga`,
`_gl`, `ref`, `referrer`, `source`, `sessionid`, `sid`, `phpsessid`, `jsessionid`) ·
останалите параметри подредени по име · без завършващ `/`.

Пример: `https://www.eufunds.bg/doc.pdf?utm_source=nl` → `eufunds.bg/doc.pdf`.

---

## 5. Обработка на една процедура

1. Отвори официалната страница.
2. Извлечи базовите данни.
3. Открий всички pagination и detail links.
4. Открий всички официални документи на страницата.
5. Извлечи основния документ.
6. Извлечи финансовите приложения.
7. Сравни страницата с документите.
8. Структурирай бюджета (§6).
9. Извлечи кандидатите, дейностите и разходите (§5.3).
10. Изчисли `content_hash` (SHA-256 върху нормализираните извлечени полета).
11. Сравни със съществуващия запис.
12. Запиши **само реалните промени**.
13. Добави записите в историята (§8).
14. Изчисли completeness score (§9).
15. Обнови `last_seen_at` и `last_verified_at`.
16. Запиши всички аномалии (§6.4).
17. Премини към следващата процедура.

**Непроменена процедура (същият `content_hash`) НЕ минава през AI анализ.** Обновяват се
само `last_seen_at` / `last_verified_at`.

### 5.1 Полета, които се извличат

**Идентификация:** `name` (BG заглавие), `title_native`, `short_title`,
`official_identifier`, `call_number`, `original_language`, `programme_period`, `program`,
`subprogramme`, `priority`, `specific_objective`, `measure`, `eu_fund`
(`ERDF` | `ESF+` | `CF` | `JTF` | `EAFRD` | `EMFAF` | `RRF` | `other`),
`managing_authority`, `intermediate_body`, `official_url`, `application_url`.

**Описание:** `summary_native`, `summary_bg`, `objective`, `expected_results`,
`main_activities`, `eligible_activities`, `ineligible_activities`, `eligible_costs`,
`ineligible_costs`, `thematic_categories_json`, `economic_sectors_json`, `keywords_json`.

**Кандидати:** `applicant_types_json`, `enterprise_sizes_json`, `partnership_required`,
`min_partners`, `applicant_restrictions`, `geographic_scope`
(`national` | `regional` | `transnational`), `eligible_regions_json`, `nuts_levels_json`.

**Дати:** `publication_date`, `opening_date`, `deadline_date`, `deadline_time`,
`deadline_timezone`, `questions_deadline`, `clarifications_deadline`,
`expected_evaluation_date`, `expected_decision_date`, `cost_eligibility_start`,
`cost_eligibility_end`, `project_duration_min_months`, `project_duration_max_months`,
`source_last_modified_at`.

**Кандидатстване:** `application_mode` (`electronic` | `paper` | `mixed`),
`application_system`, `registration_required`, `e_signature_required`,
`procedure_stages` (`one_stage` | `two_stage`), `selection_type`
(`competitive` | `direct`), `intake_type` (`rolling` | `fixed_deadline`),
`submission_language`, `contact_name`, `contact_email`, `contact_phone`, `contact_unit`.

**Полета за сайта (не ги пропускай — UI-ът зависи от тях):** `status`
(`open` | `closing_soon` | `upcoming` | `closed`), `deadline` (човешки текст),
`budget` (човешки текст), `eligible` (кратко резюме на кандидатите), `link`,
`category` (`youth` | `new` | `other`), `year`, `notes`.
`is_new = 1` само при създаване; при следващ обход става `0`.

**Ако едно поле не е публикувано — остава NULL.** Не се измисля и не се извежда по аналогия.

### 5.2 Запис в `projects`

Търси съществуващия ред по естествения ключ:

```sql
SELECT id, content_hash, first_seen, first_seen_at
  FROM projects
 WHERE country_code = ?1 AND source_id = ?2 AND source_procedure_id = ?3;
```

**Нов запис** (`id` = стабилен слъг, напр. `<country>-<source>-<procedure_id>`):

```sql
INSERT INTO projects (
  id, name, title_native, short_title, official_identifier, call_number,
  program, subprogramme, priority, specific_objective, measure, eu_fund,
  managing_authority, intermediate_body, programme_period,
  category, status, deadline, deadline_date, deadline_time, deadline_timezone,
  budget, budget_amount_eur, budget_currency, eligible, link, notes, year, is_new,
  country_code, source_id, source_procedure_id, source_programme_id, original_language,
  official_url, application_url, regions_json,
  summary_native, summary_bg, objective, expected_results, main_activities,
  eligible_activities, ineligible_activities, eligible_costs, ineligible_costs,
  thematic_categories_json, economic_sectors_json, keywords_json,
  applicant_types_json, enterprise_sizes_json, partnership_required, min_partners,
  applicant_restrictions, geographic_scope, eligible_regions_json, nuts_levels_json,
  publication_date, opening_date, questions_deadline, clarifications_deadline,
  expected_evaluation_date, expected_decision_date,
  cost_eligibility_start, cost_eligibility_end,
  project_duration_min_months, project_duration_max_months, source_last_modified_at,
  application_mode, application_system, registration_required, e_signature_required,
  procedure_stages, selection_type, intake_type, submission_language,
  contact_name, contact_email, contact_phone, contact_unit,
  budget_eu_cofinancing_eur, budget_national_cofinancing_eur,
  min_project_size_eur, max_project_size_eur, min_grant_eur, max_grant_eur,
  content_hash, source_status, ingestion_status, translation_status, ai_analysis_status,
  first_seen, first_seen_at, last_seen_at, last_verified_at, last_updated
) VALUES (
  ?1, …, 1,                       -- is_new = 1
  …,
  'active', 'ingested', 'pending', 'pending',
  date('now'), datetime('now'), datetime('now'), datetime('now'), datetime('now')
);
```

**Съществуващ запис, същият `content_hash`:**

```sql
UPDATE projects SET last_seen_at = datetime('now'), last_verified_at = datetime('now')
 WHERE id = ?1;
```

**Съществуващ запис, различен `content_hash`** — обнови САМО реално променените полета
(изброй ги явно; не пиши NULL върху стойност, която просто не си извлякъл този път):

```sql
UPDATE projects SET
  <само променените полета> = ?,
  is_new = 0,
  content_hash = ?N,
  source_updated_at = datetime('now'),
  last_seen_at = datetime('now'),
  last_verified_at = datetime('now'),
  last_updated = datetime('now'),
  translation_status = 'pending',
  ai_analysis_status = 'pending'
WHERE id = ?1;
```

> ⚠️ **`first_seen` и `first_seen_at` НИКОГА не се пипат за съществуващ запис.**
> ⚠️ **`projects` е на тавана от 100 колони в D1.** Ако ти трябва ново поле по
> процедура — то отива в `project_details` или `project_budget_terms`, не в `projects`.

### 5.3 Допустимост — нормализирано

```sql
INSERT INTO project_eligibility
  (project_id, country_code, dimension, value_key, value_label, eligible, notes,
   source_type, source_url, document_id, run_id, created_at, updated_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, datetime('now'), datetime('now'))
ON CONFLICT(project_id, dimension, value_key) DO UPDATE SET
  value_label = COALESCE(excluded.value_label, value_label),
  eligible = excluded.eligible, notes = COALESCE(excluded.notes, notes),
  source_type = excluded.source_type, source_url = excluded.source_url,
  document_id = excluded.document_id, run_id = excluded.run_id, updated_at = datetime('now');
```

`dimension`: `applicant_type` | `enterprise_size` | `sector` | `region` | `nuts` |
`activity` | `cost` | `partnership` | `other`.
`eligible = 0` за изрично **НЕ**допустимите — те са също толкова важни, колкото допустимите.

### 5.4 Реда на страниците (pagination)

Обхождай списъците страница по страница и записвай докъде си стигнал СЛЕД всяка
страница, не в края:

```sql
INSERT INTO source_pagination_cursors
  (task_key, country_code, source_id, section, page, item_offset, last_procedure_id,
   pages_seen, exhausted, last_run_id, updated_at)
VALUES ('daily-eu-country-sync',?1,?2,?3,?4,?5,?6,?7,?8,?9, datetime('now'))
ON CONFLICT(task_key, country_code, source_id, section) DO UPDATE SET
  page = excluded.page, item_offset = excluded.item_offset,
  last_procedure_id = excluded.last_procedure_id, pages_seen = excluded.pages_seen,
  exhausted = excluded.exhausted, last_run_id = excluded.last_run_id,
  updated_at = datetime('now');
```

`section` = `current` | `archive`. Когато списъкът свърши → `exhausted = 1`, `page = 1`;
следващият цикъл започва отначало за този източник.

---

## 6. Бюджет

`projects.budget_amount_eur` е **само бюджетът на процедурата в EUR**. Всичко останало
се пази отделно.

### 6.1 Условия за финансиране

```sql
INSERT INTO project_budget_terms
  (project_id, country_code, min_financing_rate, max_financing_rate, own_contribution_rate,
   state_aid_regime, de_minimis_limit_eur, budget_is_indicative, budget_original_amount,
   budget_fx_rate, budget_fx_date, budget_source_type, budget_source_url, budget_scope,
   notes, created_at, updated_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15, datetime('now'), datetime('now'))
ON CONFLICT(project_id) DO UPDATE SET
  min_financing_rate = COALESCE(excluded.min_financing_rate, min_financing_rate),
  max_financing_rate = COALESCE(excluded.max_financing_rate, max_financing_rate),
  own_contribution_rate = COALESCE(excluded.own_contribution_rate, own_contribution_rate),
  state_aid_regime = COALESCE(excluded.state_aid_regime, state_aid_regime),
  de_minimis_limit_eur = COALESCE(excluded.de_minimis_limit_eur, de_minimis_limit_eur),
  budget_is_indicative = COALESCE(excluded.budget_is_indicative, budget_is_indicative),
  budget_original_amount = COALESCE(excluded.budget_original_amount, budget_original_amount),
  budget_fx_rate = COALESCE(excluded.budget_fx_rate, budget_fx_rate),
  budget_fx_date = COALESCE(excluded.budget_fx_date, budget_fx_date),
  budget_source_type = COALESCE(excluded.budget_source_type, budget_source_type),
  budget_source_url = COALESCE(excluded.budget_source_url, budget_source_url),
  budget_scope = COALESCE(excluded.budget_scope, budget_scope),
  updated_at = datetime('now');
```

Проценти (`*_rate`) се записват като **част от 1** (85% → `0.85`).
`state_aid_regime`: `de_minimis` | `GBER` | `notified` | `none` | `other`.
`budget_source_type`: `page` | `document` | `annex`.

**`budget_scope` е задължителен, когато има стойност:**
`procedure` | `programme` | `priority` | `per_project` | `eligible_costs`.
Без него процедурата получава аномалия `scope_unknown` и стойността **не влиза** в
„Известен публикуван бюджет“ на сайта.

### 6.2 Разбивки

```sql
INSERT INTO project_budget_components
  (project_id, country_code, component_type, component_key, label, amount, currency,
   amount_eur, fx_rate, fx_date, is_indicative, source_type, source_url, document_id,
   run_id, notes, created_at, updated_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16, datetime('now'), datetime('now'))
ON CONFLICT(project_id, component_type, component_key) DO UPDATE SET
  label = COALESCE(excluded.label, label), amount = excluded.amount,
  currency = excluded.currency, amount_eur = excluded.amount_eur,
  fx_rate = excluded.fx_rate, fx_date = excluded.fx_date,
  is_indicative = excluded.is_indicative, source_type = excluded.source_type,
  source_url = excluded.source_url, document_id = excluded.document_id,
  run_id = excluded.run_id, updated_at = datetime('now');
```

`component_type`: `fund` | `eu_cofinancing` | `national_cofinancing` |
`applicant_category` | `region` | `component` | `year` | `state_aid` | `other`.
`component_key` е стабилен: `ERDF`, `2026`, `micro`, `BG-SOF`…

### 6.3 Пет различни числа, които НИКОГА не се смесват

бюджет на програмата · бюджет на приоритет · бюджет на процедурата · максимален бюджет
на един проект · общ размер на допустимите разходи.

**При противоречие между страницата и официалния документ:**
- използвай **най-новия официален документ**;
- запиши двете стойности в `project_anomalies` (`page_value` / `document_value`);
- маркирай процедурата `pending_review`;
- **не сумирай автоматично**.

### 6.4 Аномалии

```sql
INSERT INTO project_anomalies
  (project_id, country_code, anomaly_type, severity, field_name, observed_value,
   expected_value, page_value, document_value, source_url, document_id, run_id,
   status, notes, detected_at, created_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'open',?13, datetime('now'), datetime('now'));
```

| `anomaly_type` | Кога | `severity` |
|---|---|---|
| `budget_conflict` | страница ≠ документ | `warning` |
| `zero_budget` | стойност 0 | `warning` |
| `budget_out_of_range` | > 20 млрд EUR | `critical` |
| `budget_out_of_range` | 0 < стойност < 1 000 EUR | `warning` |
| `project_budget_as_total` | `budget_scope ≠ procedure`, или общ бюджет = `max_grant_eur` | `critical` / `warning` |
| `scope_unknown` | има стойност, липсва `budget_scope` | `warning` |
| `duplicate_budget` | същата **некръгла** сума ≥ 1 млн EUR в различни държави | `warning` |
| `currency_mismatch` | валута ≠ националната и ≠ EUR | `warning` |
| `invalid_min_max` | min > max; процент извън 0..1 | `warning` |
| `date_inconsistency` | publication > opening; opening > deadline; questions > deadline; cost_start > cost_end | `warning` |
| `missing_document` | активна процедура без документ след 3 опита | `warning` |

Проверка за дублирани суми между държави — **само некръгли суми ≥ 1 млн EUR**:

```sql
SELECT budget_amount_eur, COUNT(DISTINCT country_code) AS countries, COUNT(*) AS n
  FROM projects
 WHERE budget_amount_eur IS NOT NULL
   AND budget_amount_eur >= 1000000
   AND CAST(budget_amount_eur AS INTEGER) % 100000 <> 0
 GROUP BY budget_amount_eur HAVING countries > 1;
```

> Прагът НЕ е случаен. Измерено срещу продукцията: при праг 1 000 EUR правилото дава
> **57** групи, почти всички кръгли числа — 200 000 EUR се среща в 5 държави, защото е
> типичен максимален размер на помощта, а не копиран бюджет. С праг 1 млн + изключване
> на кръглите (кратни на 100 000) остават **3** групи. Това е реалният сигнал за
> копи-пейст грешка.

Всяка `critical` аномалия или `budget_conflict` → `quality_status = 'pending_review'`.

---

## 7. Документи

За **всяка** нова, променена или непълна процедура — задължителен опит да се свалят
**всички** релевантни официални файлове, не само един.

`doc_category`: `guidelines` · `call` · `conditions_apply` · `conditions_exec` ·
`decision` · `application_form` · `budget_template` · `financial_annex` · `declaration` ·
`evaluation_criteria` · `evaluation_methodology` · `faq` · `clarification` · `amendment` ·
`corrigendum` · `eligible_activities_list` · `contract_template` · `annex` ·
`presentation` · `other`.

**Основен официален документ** = `guidelines` | `conditions_apply` | `call` | `decision`,
в този ред на предпочитание. Приложение, презентация или Q&A **не са** основен документ.
Само един документ на процедура има `is_primary = 1`.

### 7.1 Дедупликация и версии

```sql
SELECT id, checksum, doc_category, is_primary, version_label
  FROM documents WHERE project_id = ?1 AND normalized_url = ?2 LIMIT 1;
```

- **няма ред** → нов документ:

```sql
INSERT INTO documents
  (project_id, country_code, source_id, title, doc_type, doc_category, content, source_url,
   normalized_url, language, mime_type, size_bytes, published_at, version_label, checksum,
   is_amendment, supersedes_document_id, summary_bg, extracted_deadlines_json,
   extracted_budgets_json, extracted_criteria_json, extraction_status, extraction_method,
   extraction_error, is_primary, last_checked_at, run_id, created_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,
        ?24,?25, datetime('now'), ?26, datetime('now'));
```

- **има ред, различен `checksum`** → нова версия; **старата се запазва**:

```sql
INSERT OR IGNORE INTO document_versions
  (document_id, project_id, country_code, version_label, checksum, source_url,
   normalized_url, published_at, size_bytes, mime_type, is_amendment, change_summary,
   run_id, created_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13, datetime('now'));
```

```sql
UPDATE documents SET checksum = ?2, version_label = ?3, published_at = ?4,
       size_bytes = ?5, summary_bg = ?6, extraction_status = ?7, extraction_method = ?8,
       extraction_error = ?9, is_amendment = ?10, last_checked_at = datetime('now'), run_id = ?11
 WHERE id = ?1;
```

- **има ред, същият `checksum`** → само `last_checked_at = datetime('now')`.

> Индексът `(project_id, normalized_url)` НЕ е уникален (в базата има 11 заварени
> дубликата, които правилата забраняват да се трият). Затова **винаги прави SELECT
> преди INSERT** — базата няма да те спре.

### 7.2 PDF

Първо директно текстово извличане. **OCR само като резервен вариант.**
Нечетим документ **не е** успешно обработен:
`extraction_status = 'failed'` + `extraction_error` с причината.
`extraction_status`: `complete` | `partial` | `failed`. `extraction_method`: `text` | `ocr`.
Не маркирай процедурата като „с документ“ на базата на файл, който не е прочетен.

### 7.3 Основен документ и знаме

След обработката на документите на процедурата:

```sql
UPDATE documents SET is_primary = 0 WHERE project_id = ?1;
UPDATE documents SET is_primary = 1 WHERE id = ?2;   -- избраният основен, ако има такъв
```

### 7.4 Ако порталът наистина не публикува документи

Това се **доказва**, не се предполага: `project_details.documents_published_by_source = 0`
+ `documents_absence_evidence_url` = адресът, който го показва. Само тогава процедурата
може да достигне `quality_status = 'complete'` без основен документ.

---

## 8. История на промените (append-only)

```sql
INSERT INTO project_change_history
  (project_id, country_code, field_name, old_value, new_value, change_type, significance,
   detected_from, source_url, document_id, run_id, changed_at, created_at)
VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, datetime('now'), datetime('now'));
```

`change_type`: `deadline_change` | `budget_change` | `status_change` | `document_added` |
`eligibility_change` | `amendment` | `correction` | `other`.
`significance`: `critical` | `major` | `minor`. `detected_from`: `page` | `document` | `api` | `feed`.

**Критични:** промяна на `deadline_date`, `budget_amount_eur`, `max_financing_rate`,
`status`, `applicant_types_json`; ново изменение (`amendment`/`corrigendum`);
отменена или повторно отворена процедура.

**Не се смята за промяна:**
- поле, което не си извлякъл този път (липсата не е нова стойност);
- `1000` срещу `1000.0`;
- JSON списък със същите елементи в друг ред;
- първоначално попълване на празно поле → записва се като `correction` / `minor`
  (обогатяване), не като промяна на стойност.

Добавен документ → `document_added` / `major`; изменение или нова версия →
`amendment` / `critical`.

**Историята не се презаписва и не се трие.**

---

## 9. Оценка на качеството

| Тежест | Критерий |
|---|---|
| 10 | официално заглавие (5) и официален URL (5) |
| 15 | валиден статус (7.5) и срок (7.5) — постоянен прием е валиден без дата |
| 20 | основен официален документ (само документ = 10; доказана липса = 15) |
| 15 | структуриран бюджет: стойност (7.5) + обхват (3) + диапазон/процент (4.5) |
| 10 | допустими кандидати (7) + размер на предприятието (3) |
| 10 | допустими дейности (5) + допустими разходи (5) |
| 10 | програма (4) + фонд (3) + управляващ орган (3) |
| 5 | начин на кандидатстване (3) + контакти (2) |
| 5 | `last_verified_at` (2.5) + `source_id`/`source_procedure_id` (2.5) |

Статуси: `complete` 85–100 · `good` 70–84 · `partial` 40–69 · `incomplete` < 40 ·
`pending_review` при открита аномалия.

**Процедура без основен официален документ не може да е `complete`** — пада на `good`,
освен ако §7.4 е доказано.

```sql
INSERT INTO project_details
  (project_id, country_code, completeness_score, quality_status, quality_computed_at,
   source_version, has_primary_document, documents_published_by_source,
   documents_absence_evidence_url, detail_extraction_status, detail_extracted_at,
   last_run_id, created_at, updated_at)
VALUES (?1,?2,?3,?4, datetime('now'), ?5,?6,?7,?8,?9, datetime('now'), ?10, datetime('now'), datetime('now'))
ON CONFLICT(project_id) DO UPDATE SET
  country_code = excluded.country_code,
  completeness_score = excluded.completeness_score,
  quality_status = excluded.quality_status,
  quality_computed_at = datetime('now'),
  source_version = COALESCE(excluded.source_version, source_version),
  has_primary_document = excluded.has_primary_document,
  documents_published_by_source = COALESCE(excluded.documents_published_by_source, documents_published_by_source),
  documents_absence_evidence_url = COALESCE(excluded.documents_absence_evidence_url, documents_absence_evidence_url),
  detail_extraction_status = excluded.detail_extraction_status,
  detail_extracted_at = datetime('now'),
  last_run_id = excluded.last_run_id,
  updated_at = datetime('now');
```

`detail_extraction_status`: `pending` | `partial` | `complete` | `failed`.

---

## 10. Cursor и поведение при timeout

```sql
UPDATE scheduled_country_sync_state SET
  current_country_code = ?1, current_source_id = ?2, current_section = ?3,
  current_page = ?4, current_item_offset = ?5, last_processed_procedure_id = ?6,
  last_completed_country_code = ?7, completed_countries_in_cycle = ?8,
  total_countries_in_cycle = ?9, cycle_number = ?10, allocation_json = ?11,
  last_run_started_at = ?12, last_run_completed_at = datetime('now'),
  updated_at = datetime('now')
WHERE task_key = 'daily-eu-country-sync';
```

Когато обиколиш всички държави → `cycle_number + 1`, `completed_countries_in_cycle = 0`,
`cycle_started_at = datetime('now')`.

**При наближаващ timeout:** спри контролирано → запиши ТОЧНИЯ cursor (държава, източник,
секция, страница, offset, последна обработена процедура) → освободи lock-а → запиши
отчета със статус `partial` и попълни `next_country` / `next_source` / `next_cursor`.
Следващото изпълнение продължава оттам. **Не започва отначало и не започва от BG.**

---

## 11. Отчет

### 11.1 Покритие СЛЕД работата

Пусни отново заявката от §0.2 → `*_coverage_after`.

### 11.2 Запис на изпълнението

Предпочитан начин — HTTP (Worker-ът слага времената от D1 и е идемпотентен по
`taskKey` + `startedAt`):

`POST https://euro-funds.eu/api/internal/sync-runs/report`

Заглавки:
- `x-report-timestamp`: текущият ISO момент;
- `x-report-signature`: HMAC-SHA256 в **малки шестнайсетични букви** върху низа
  `timestamp + "." + rawBody`, с ключ `SCHEDULED_TASK_REPORTING_SECRET`.
  Прозорецът е 5 минути — подпиши точно тялото, което изпращаш.

Тяло:

```json
{
  "taskKey": "daily-eu-country-sync",
  "startedAt": "<стойността от §0.1>",
  "status": "completed",
  "cycleNumber": 7,
  "startCountry": "BG", "endCountry": "PL",
  "countriesSucceeded": 3, "countriesFailed": 1, "recordsInvalid": 2,
  "safeSummary": "<§11.4>",
  "metrics": {
    "countries_touched": 4, "countries_fully_processed": 2,
    "sources_checked": 11, "new_sources_discovered": 2, "source_failures": 1,
    "procedures_discovered": 63, "procedures_created": 7, "procedures_updated": 12,
    "procedures_unchanged": 44, "procedures_completed": 5, "procedures_revisited": 18,
    "documents_discovered": 31, "documents_downloaded": 23, "document_versions_added": 3,
    "budgets_extracted": 14, "budgets_converted": 5, "eligibility_records_added": 61,
    "anomalies_detected": 3, "changes_recorded": 27,
    "average_quality_score": 68.4,
    "document_coverage_before": 59.3, "document_coverage_after": 62.4,
    "budget_coverage_before": 39.8, "budget_coverage_after": 41.0,
    "next_country": "HU", "next_source": "hu-palyazat", "next_cursor": "current/p3/o40",
    "countries": [{ "code": "BG", "procedures": 21, "documents": 9, "budgets": 6,
                    "anomalies": 1, "status": "ok", "cursor": "current/p2/o25" }],
    "sources": [{ "id": "bg-eufunds", "country": "BG", "health": "healthy",
                  "http_status": 200, "procedures_found": 34 }],
    "blockedSources": [{ "id": "pl-main", "country": "PL", "reason": "403 Cloudflare" }],
    "timeAllocation": { "fresh": 1350000, "backfill": 900000,
                        "lowCoverage": 450000, "discovery": 300000 }
  }
}
```

`status`: `completed` | `partial` | `error` | `timeout`.

Ако HTTP-то не е достъпно — запиши директно в `scheduled_sync_runs` същите стойности
(`completed_at` и `created_at` = `datetime('now')`).

### 11.3 Snapshot за страницата „Относно системата“

**Само при успешен run.** Тази заявка е пълна — не я съкращавай:

```sql
INSERT OR REPLACE INTO country_daily_statistics (id, snapshot_date, country_code, total_procedures, active_procedures, upcoming_procedures, closed_procedures, procedures_with_documents, new_last_30_days, updated_last_30_days, published_budget_eur, budget_procedure_count, budget_text_procedures, foreign_currency_procedures, active_sources, successful_sources, failed_sources, last_successful_sync_at, coverage_status, publish_status, created_at, updated_at, procedures_with_primary_document, procedures_with_structured_budget, average_quality_score, quality_complete, quality_good, quality_partial, quality_incomplete, quality_pending_review, sources_total, sources_blocked, sources_verified, anomalies_open, documents_total, earliest_procedure_seen_at)
SELECT c.code || ':' || date('now'), date('now'), c.code,
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status IN ('open','closing_soon')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status='upcoming'),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.status='closed'),
 (SELECT COUNT(DISTINCT d.project_id) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.country_code=c.code),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.first_seen >= date('now','-30 day')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.last_updated >= date('now','-30 day') AND p.last_updated != p.first_seen),
 (SELECT SUM(p.budget_amount_eur) FROM projects p
    LEFT JOIN project_budget_terms bt ON bt.project_id = p.id
   WHERE p.country_code=c.code AND p.budget_amount_eur IS NOT NULL
     AND (bt.budget_scope IS NULL OR bt.budget_scope='procedure')
     AND NOT EXISTS (SELECT 1 FROM project_anomalies a WHERE a.project_id=p.id AND a.status='open' AND a.severity='critical')),
 (SELECT COUNT(*) FROM projects p
    LEFT JOIN project_budget_terms bt ON bt.project_id = p.id
   WHERE p.country_code=c.code AND p.budget_amount_eur IS NOT NULL
     AND (bt.budget_scope IS NULL OR bt.budget_scope='procedure')
     AND NOT EXISTS (SELECT 1 FROM project_anomalies a WHERE a.project_id=p.id AND a.status='open' AND a.severity='critical')),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.budget IS NOT NULL AND p.budget != ''),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.budget_currency IS NOT NULL AND p.budget_currency != 'EUR'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.enabled=1),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health='healthy'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health='failing'),
 c.last_successful_sync_at, c.coverage_status, 'published', datetime('now'), datetime('now'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.has_primary_document=1),
 (SELECT COUNT(*) FROM projects p WHERE p.country_code=c.code AND p.budget_amount_eur IS NOT NULL),
 (SELECT ROUND(AVG(pd.completeness_score),1) FROM project_details pd WHERE pd.country_code=c.code AND pd.completeness_score IS NOT NULL),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='complete'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='good'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='partial'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='incomplete'),
 (SELECT COUNT(*) FROM project_details pd WHERE pd.country_code=c.code AND pd.quality_status='pending_review'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.source_health='blocked'),
 (SELECT COUNT(*) FROM funding_sources f WHERE f.country_code=c.code AND f.verified=1),
 (SELECT COUNT(*) FROM project_anomalies a WHERE a.country_code=c.code AND a.status='open'),
 (SELECT COUNT(*) FROM documents d JOIN projects p ON p.id=d.project_id WHERE p.country_code=c.code),
 (SELECT MIN(COALESCE(p.first_seen_at, p.first_seen)) FROM projects p WHERE p.country_code=c.code)
FROM countries c WHERE c.eu_member=1;
```

Веднага след това сравни с вчерашния snapshot. При **аномалия** — активни > общо,
отрицателен бюджет, внезапна нула при > 10 процедури вчера, спад > 50%, скок на бюджета
> 3× — маркирай ДНЕШНИЯ ред за проверка, вместо да го публикуваш:

```sql
UPDATE country_daily_statistics SET publish_status = 'pending_review'
 WHERE snapshot_date = date('now') AND country_code = ?1;
```

Публичната страница ще продължи да показва последния успешен snapshot. Не публикувай
съмнителни числа.

### 11.4 AI отчет

`POST https://euro-funds.eu/api/internal/ai-runs/report` — същият HMAC подпис.

```json
{
  "scheduledTaskRunId": "<runId>",
  "scheduledTaskName": "daily-eu-country-sync",
  "executionType": "daily_review",
  "status": "success",
  "startedAt": "<startedAt>",
  "completedAt": "<datetime('now') от D1>",
  "countries": ["BG", "RO", "GR", "PL"],
  "safeSummary": "<същото както §11.5>",
  "metrics": { "<същият блок както в §11.2>" }
}
```

### 11.5 `safe_summary` — кратко, без тайни, до 1000 знака

> Държави: BG, RO, GR, PL (4 засегнати, 2 завършени). Източници: 11 проверени, 2 нови
> кандидати, 1 неуспешен. Процедури: +7 нови, 12 обновени, 44 без промяна, 18 допълнени
> стари. Документи: 23 свалени от 31 открити, 3 нови версии. Бюджети: 14 структурирани
> (5 конвертирани в EUR). Покритие: документи 62.4% (+3.1 п.п.), бюджети 41.0% (+1.2 п.п.).
> Средно качество: 68.4/100. Аномалии: 3 за преглед. Блокирани портали: PL:pl-main.
> Следва: HU / hu-palyazat.

Без URL с токени, без ключове, без имена на файлове от диска.

### 11.6 Резюме в чата

Накрая напиши кратко резюме по държави: какво е обходено, какво е добавено, какво е
блокирано и коя е следващата държава. Същите числа както в `safe_summary`.

---

## 12. Забрани — проверявай се преди всеки запис

- ❌ hardcoded списък с държави — държавите идват само от `countries`;
- ❌ локални файлове за прогрес — всичко живее в D1;
- ❌ паралелна обработка на държави;
- ❌ измислени процедури, бюджети, документи, срокове или валутни курсове;
- ❌ времена, изчислени извън D1;
- ❌ production запис за държава от Група B;
- ❌ активиране на държава или източник без QA (≥ 3 валидни процедури);
- ❌ триене на стари записи при неуспешен източник;
- ❌ презаписване или триене на историята на промените;
- ❌ промяна на `first_seen` / `first_seen_at` за съществуващ запис;
- ❌ нови колони в `projects` (таблицата е на тавана от 100 колони в D1);
- ❌ повторен AI анализ на непроменена процедура;
- ❌ неофициален агрегатор като окончателен източник;
- ❌ сумиране на бюджети от различни обхвати;
- ❌ INSERT на документ без предварителен SELECT по `normalized_url`;
- ❌ повече процедури от тавана за една държава без основанието от §1.3;
- ❌ промени по Google OAuth потока, потребителските профили или `user_preferences`;
- ✅ **качество пред брой** — 15 добре извлечени процедури са по-добре от 60 плитки.
