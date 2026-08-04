-- 0025_deep_extraction.sql — дълбоко извличане на процедури (v2.52.0)
--
-- Само ADDITIVE промени: нови колони (ALTER TABLE ... ADD COLUMN) и нови таблици.
-- НИЩО не се трие и не се преименува. Всички съществуващи production колони
-- остават непроменени; старите записи запазват first_seen/first_seen_at.
--
-- Групи:
--   A. projects — идентификация, описание, дати, кандидатстване, качество
--   B. projects — структуриран бюджет (скаларните полета; разбивките са в
--      project_budget_components)
--   C. documents — версии, класификация, извличане
--   D. funding_sources — повече канали за достъп + health метрики
--   E. scheduled_sync_runs / scheduled_country_sync_state — по-богати отчети и cursor
--   F. country_daily_statistics — агрегати за /about
--   G. нови таблици
--   H. индекси

-- ─────────────────────────────────────────────────────────────────────────────
-- A. projects — идентификация и съдържание
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN title_native TEXT;
ALTER TABLE projects ADD COLUMN short_title TEXT;
ALTER TABLE projects ADD COLUMN official_identifier TEXT;
ALTER TABLE projects ADD COLUMN call_number TEXT;
ALTER TABLE projects ADD COLUMN programme_period TEXT;
ALTER TABLE projects ADD COLUMN subprogramme TEXT;
ALTER TABLE projects ADD COLUMN specific_objective TEXT;
ALTER TABLE projects ADD COLUMN measure TEXT;
ALTER TABLE projects ADD COLUMN eu_fund TEXT;
ALTER TABLE projects ADD COLUMN intermediate_body TEXT;
ALTER TABLE projects ADD COLUMN application_url TEXT;

ALTER TABLE projects ADD COLUMN summary_native TEXT;
ALTER TABLE projects ADD COLUMN summary_bg TEXT;
ALTER TABLE projects ADD COLUMN objective TEXT;
ALTER TABLE projects ADD COLUMN expected_results TEXT;
ALTER TABLE projects ADD COLUMN main_activities TEXT;
ALTER TABLE projects ADD COLUMN eligible_activities TEXT;
ALTER TABLE projects ADD COLUMN ineligible_activities TEXT;
ALTER TABLE projects ADD COLUMN eligible_costs TEXT;
ALTER TABLE projects ADD COLUMN ineligible_costs TEXT;
ALTER TABLE projects ADD COLUMN thematic_categories_json TEXT;
ALTER TABLE projects ADD COLUMN economic_sectors_json TEXT;
ALTER TABLE projects ADD COLUMN keywords_json TEXT;

ALTER TABLE projects ADD COLUMN applicant_types_json TEXT;
ALTER TABLE projects ADD COLUMN enterprise_sizes_json TEXT;
ALTER TABLE projects ADD COLUMN partnership_required INTEGER;
ALTER TABLE projects ADD COLUMN min_partners INTEGER;
ALTER TABLE projects ADD COLUMN applicant_restrictions TEXT;
ALTER TABLE projects ADD COLUMN geographic_scope TEXT;
ALTER TABLE projects ADD COLUMN eligible_regions_json TEXT;
ALTER TABLE projects ADD COLUMN nuts_levels_json TEXT;

ALTER TABLE projects ADD COLUMN publication_date TEXT;
ALTER TABLE projects ADD COLUMN opening_date TEXT;
ALTER TABLE projects ADD COLUMN deadline_time TEXT;
ALTER TABLE projects ADD COLUMN deadline_timezone TEXT;
ALTER TABLE projects ADD COLUMN questions_deadline TEXT;
ALTER TABLE projects ADD COLUMN clarifications_deadline TEXT;
ALTER TABLE projects ADD COLUMN expected_evaluation_date TEXT;
ALTER TABLE projects ADD COLUMN expected_decision_date TEXT;
ALTER TABLE projects ADD COLUMN cost_eligibility_start TEXT;
ALTER TABLE projects ADD COLUMN cost_eligibility_end TEXT;
ALTER TABLE projects ADD COLUMN project_duration_min_months INTEGER;
ALTER TABLE projects ADD COLUMN project_duration_max_months INTEGER;
ALTER TABLE projects ADD COLUMN source_last_modified_at TEXT;

ALTER TABLE projects ADD COLUMN application_mode TEXT;
ALTER TABLE projects ADD COLUMN application_system TEXT;
ALTER TABLE projects ADD COLUMN registration_required INTEGER;
ALTER TABLE projects ADD COLUMN e_signature_required INTEGER;
ALTER TABLE projects ADD COLUMN procedure_stages TEXT;
ALTER TABLE projects ADD COLUMN selection_type TEXT;
ALTER TABLE projects ADD COLUMN intake_type TEXT;
ALTER TABLE projects ADD COLUMN submission_language TEXT;
ALTER TABLE projects ADD COLUMN contact_name TEXT;
ALTER TABLE projects ADD COLUMN contact_email TEXT;
ALTER TABLE projects ADD COLUMN contact_phone TEXT;
ALTER TABLE projects ADD COLUMN contact_unit TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. projects — структуриран бюджет
--    budget_amount_eur (0016) ОСТАВА „бюджет на процедурата в EUR" и НЕ се пипа.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE projects ADD COLUMN budget_eu_cofinancing_eur REAL;
ALTER TABLE projects ADD COLUMN budget_national_cofinancing_eur REAL;
ALTER TABLE projects ADD COLUMN min_project_size_eur REAL;
ALTER TABLE projects ADD COLUMN max_project_size_eur REAL;
ALTER TABLE projects ADD COLUMN min_grant_eur REAL;
ALTER TABLE projects ADD COLUMN max_grant_eur REAL;
-- ⚠️ D1/SQLite ограничение: `projects` има ТВЪРД таван от 100 колони и той е
-- достигнат точно тук (79 + 21 = 100). Останалите полета НЕ могат да се добавят
-- с ALTER, затова живеят в две 1:1 разширения — `project_budget_terms` и
-- `project_details` (виж секция G). Това е и по-чисто: условията за финансиране
-- и метаданните за качество са отделни грижи от самата процедура.

-- ─────────────────────────────────────────────────────────────────────────────
-- C. documents — класификация, версии, извличане
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE documents ADD COLUMN normalized_url TEXT;
ALTER TABLE documents ADD COLUMN doc_category TEXT;
ALTER TABLE documents ADD COLUMN language TEXT;
ALTER TABLE documents ADD COLUMN mime_type TEXT;
ALTER TABLE documents ADD COLUMN size_bytes INTEGER;
ALTER TABLE documents ADD COLUMN published_at TEXT;
ALTER TABLE documents ADD COLUMN version_label TEXT;
ALTER TABLE documents ADD COLUMN checksum TEXT;
ALTER TABLE documents ADD COLUMN is_amendment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN supersedes_document_id INTEGER;
ALTER TABLE documents ADD COLUMN summary_bg TEXT;
ALTER TABLE documents ADD COLUMN extracted_deadlines_json TEXT;
ALTER TABLE documents ADD COLUMN extracted_budgets_json TEXT;
ALTER TABLE documents ADD COLUMN extracted_criteria_json TEXT;
ALTER TABLE documents ADD COLUMN extraction_status TEXT;
ALTER TABLE documents ADD COLUMN extraction_method TEXT;
ALTER TABLE documents ADD COLUMN extraction_error TEXT;
ALTER TABLE documents ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN last_checked_at TEXT;
ALTER TABLE documents ADD COLUMN run_id TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. funding_sources — повече канали за достъп + метрики
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE funding_sources ADD COLUMN archive_url TEXT;
ALTER TABLE funding_sources ADD COLUMN search_url TEXT;
ALTER TABLE funding_sources ADD COLUMN rss_url TEXT;
ALTER TABLE funding_sources ADD COLUMN api_url TEXT;
ALTER TABLE funding_sources ADD COLUMN sitemap_url TEXT;
ALTER TABLE funding_sources ADD COLUMN requires_pagination INTEGER NOT NULL DEFAULT 0;
ALTER TABLE funding_sources ADD COLUMN access_method TEXT;
ALTER TABLE funding_sources ADD COLUMN avg_response_time_ms INTEGER;
ALTER TABLE funding_sources ADD COLUMN last_http_status INTEGER;
ALTER TABLE funding_sources ADD COLUMN last_procedures_found INTEGER;
ALTER TABLE funding_sources ADD COLUMN last_procedures_valid INTEGER;
ALTER TABLE funding_sources ADD COLUMN total_procedures_found INTEGER NOT NULL DEFAULT 0;
ALTER TABLE funding_sources ADD COLUMN total_procedures_valid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE funding_sources ADD COLUMN blocked_reason TEXT;
ALTER TABLE funding_sources ADD COLUMN discovery_method TEXT;
ALTER TABLE funding_sources ADD COLUMN discovered_at TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- E. scheduled_sync_runs — разширен отчет
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE scheduled_sync_runs ADD COLUMN countries_touched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN countries_fully_processed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN sources_checked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN new_sources_discovered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN source_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN procedures_discovered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN procedures_created INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN procedures_updated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN procedures_unchanged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN procedures_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN procedures_revisited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN documents_discovered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN documents_downloaded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN document_versions_added INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN budgets_extracted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN budgets_converted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN eligibility_records_added INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN anomalies_detected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN changes_recorded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_sync_runs ADD COLUMN average_quality_score REAL;
ALTER TABLE scheduled_sync_runs ADD COLUMN document_coverage_before REAL;
ALTER TABLE scheduled_sync_runs ADD COLUMN document_coverage_after REAL;
ALTER TABLE scheduled_sync_runs ADD COLUMN budget_coverage_before REAL;
ALTER TABLE scheduled_sync_runs ADD COLUMN budget_coverage_after REAL;
ALTER TABLE scheduled_sync_runs ADD COLUMN next_country TEXT;
ALTER TABLE scheduled_sync_runs ADD COLUMN next_source TEXT;
ALTER TABLE scheduled_sync_runs ADD COLUMN next_cursor TEXT;
ALTER TABLE scheduled_sync_runs ADD COLUMN countries_json TEXT;
ALTER TABLE scheduled_sync_runs ADD COLUMN sources_json TEXT;
ALTER TABLE scheduled_sync_runs ADD COLUMN time_allocation_json TEXT;
ALTER TABLE scheduled_sync_runs ADD COLUMN blocked_sources_json TEXT;

-- Cursor: разширения за pagination и разпределение на времето
ALTER TABLE scheduled_country_sync_state ADD COLUMN current_section TEXT;
ALTER TABLE scheduled_country_sync_state ADD COLUMN current_page INTEGER;
ALTER TABLE scheduled_country_sync_state ADD COLUMN current_item_offset INTEGER;
ALTER TABLE scheduled_country_sync_state ADD COLUMN last_processed_procedure_id TEXT;
ALTER TABLE scheduled_country_sync_state ADD COLUMN allocation_json TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. country_daily_statistics — нови агрегати за /about
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE country_daily_statistics ADD COLUMN procedures_with_primary_document INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN procedures_with_structured_budget INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN average_quality_score REAL;
ALTER TABLE country_daily_statistics ADD COLUMN quality_complete INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN quality_good INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN quality_partial INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN quality_incomplete INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN quality_pending_review INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN sources_total INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN sources_blocked INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN sources_verified INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN anomalies_open INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN documents_total INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN earliest_procedure_seen_at TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. Нови таблици
-- ─────────────────────────────────────────────────────────────────────────────

-- G0a. project_budget_terms — 1:1 разширение с условията за финансиране.
--      (Не се побират в `projects` заради тавана от 100 колони в D1.)
CREATE TABLE IF NOT EXISTS project_budget_terms (
  project_id TEXT PRIMARY KEY,
  country_code TEXT,
  min_financing_rate REAL,            -- 0..1
  max_financing_rate REAL,            -- 0..1
  own_contribution_rate REAL,         -- 0..1
  state_aid_regime TEXT,              -- de_minimis|GBER|notified|none|other
  de_minimis_limit_eur REAL,
  budget_is_indicative INTEGER,       -- 1 = индикативен, 0 = окончателен
  budget_original_amount REAL,
  budget_fx_rate REAL,
  budget_fx_date TEXT,
  budget_source_type TEXT,            -- page|document|annex
  budget_source_url TEXT,
  budget_scope TEXT,                  -- procedure|programme|priority|per_project|eligible_costs
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- G0b. project_details — 1:1 разширение с качество и проследимост на извличането.
CREATE TABLE IF NOT EXISTS project_details (
  project_id TEXT PRIMARY KEY,
  country_code TEXT,
  completeness_score INTEGER,         -- 0..100
  quality_status TEXT,                -- complete|good|partial|incomplete|pending_review
  quality_computed_at TEXT,
  source_version TEXT,
  has_primary_document INTEGER NOT NULL DEFAULT 0,
  documents_published_by_source INTEGER,      -- 0 = порталът НЕ публикува документи (доказано)
  documents_absence_evidence_url TEXT,
  detail_extraction_status TEXT,      -- pending|partial|complete|failed
  detail_extracted_at TEXT,
  last_run_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- G1. История на промените (НЕ се презаписва — само INSERT).
CREATE TABLE IF NOT EXISTS project_change_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  country_code TEXT,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_type TEXT NOT NULL,          -- deadline_change|budget_change|status_change|document_added|
                                      -- eligibility_change|amendment|correction|other
  significance TEXT,                  -- critical|major|minor
  detected_from TEXT,                 -- page|document|api|feed
  source_url TEXT,
  document_id INTEGER,
  run_id TEXT,
  changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- G2. Аномалии и противоречия (страница vs документ и т.н.).
CREATE TABLE IF NOT EXISTS project_anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  country_code TEXT,
  anomaly_type TEXT NOT NULL,         -- budget_conflict|budget_out_of_range|zero_budget|
                                      -- duplicate_budget|project_budget_as_total|currency_mismatch|
                                      -- invalid_min_max|missing_document|date_inconsistency|other
  severity TEXT NOT NULL DEFAULT 'warning',   -- info|warning|critical
  field_name TEXT,
  observed_value TEXT,
  expected_value TEXT,
  page_value TEXT,
  document_value TEXT,
  source_url TEXT,
  document_id INTEGER,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',        -- open|resolved|ignored
  notes TEXT,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

-- G3. Бюджетни компоненти (по фонд / регион / категория кандидат / компонент / година).
CREATE TABLE IF NOT EXISTS project_budget_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  country_code TEXT,
  component_type TEXT NOT NULL,       -- fund|eu_cofinancing|national_cofinancing|applicant_category|
                                      -- region|component|year|state_aid|other
  component_key TEXT NOT NULL,        -- ERDF, BG-SOF, 2026, micro, ...
  label TEXT,
  amount REAL,
  currency TEXT,
  amount_eur REAL,
  fx_rate REAL,
  fx_date TEXT,
  is_indicative INTEGER NOT NULL DEFAULT 0,
  source_type TEXT,                   -- page|document|annex
  source_url TEXT,
  document_id INTEGER,
  run_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- G4. Допустимост (кандидати, дейности, разходи, региони) — нормализирано.
CREATE TABLE IF NOT EXISTS project_eligibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  country_code TEXT,
  dimension TEXT NOT NULL,            -- applicant_type|enterprise_size|sector|region|nuts|
                                      -- activity|cost|partnership|other
  value_key TEXT NOT NULL,
  value_label TEXT,
  eligible INTEGER NOT NULL DEFAULT 1,-- 0 = изрично НЕдопустимо
  notes TEXT,
  source_type TEXT,
  source_url TEXT,
  document_id INTEGER,
  run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- G5. Версии на документите (нова версия при различен checksum).
CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  project_id TEXT,
  country_code TEXT,
  version_label TEXT,
  checksum TEXT NOT NULL,
  source_url TEXT,
  normalized_url TEXT,
  published_at TEXT,
  size_bytes INTEGER,
  mime_type TEXT,
  is_amendment INTEGER NOT NULL DEFAULT 0,
  change_summary TEXT,
  run_id TEXT,
  created_at TEXT NOT NULL
);

-- G6. Кандидати за нови официални източници (преди промоция в funding_sources).
CREATE TABLE IF NOT EXISTS source_discovery_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  candidate_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  title TEXT,
  authority_name TEXT,
  authority_type TEXT,
  source_type TEXT,
  language TEXT,
  discovered_from TEXT,               -- URL/източник, от който е открит
  discovery_method TEXT,              -- sitemap|rss|api|link|search|eu_portal|pdf_list
  http_status INTEGER,
  content_type TEXT,
  evidence_url TEXT,
  official_confidence REAL,
  status TEXT NOT NULL DEFAULT 'new', -- new|verified|rejected|promoted
  rejection_reason TEXT,
  promoted_source_id TEXT,
  notes TEXT,
  run_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_checked_at TEXT
);

-- G7. История на здравето на източниците (времеви ред, не се презаписва).
CREATE TABLE IF NOT EXISTS source_health_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  country_code TEXT,
  checked_at TEXT NOT NULL,
  run_id TEXT,
  access_method TEXT,                 -- html|sitemap|rss|api|archive|search
  ok INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  response_time_ms INTEGER,
  procedures_found INTEGER,
  procedures_valid INTEGER,
  documents_found INTEGER,
  health TEXT,                        -- healthy|degraded|failing|blocked|unknown
  error_code TEXT,
  error_summary TEXT,
  created_at TEXT NOT NULL
);

-- G8. Cursor за pagination — отделно per (task, country, source, section).
CREATE TABLE IF NOT EXISTS source_pagination_cursors (
  task_key TEXT NOT NULL,
  country_code TEXT NOT NULL,
  source_id TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'current',   -- current|archive
  page INTEGER NOT NULL DEFAULT 1,
  item_offset INTEGER NOT NULL DEFAULT 0,
  last_procedure_id TEXT,
  pages_seen INTEGER NOT NULL DEFAULT 0,
  exhausted INTEGER NOT NULL DEFAULT 0,
  last_run_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (task_key, country_code, source_id, section)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- H. Индекси
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_country ON projects(country_code);
CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(source_id);
CREATE INDEX IF NOT EXISTS idx_projects_source_proc ON projects(country_code, source_id, source_procedure_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_deadline_date ON projects(deadline_date);
CREATE INDEX IF NOT EXISTS idx_projects_last_seen ON projects(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_projects_budget_eur ON projects(budget_amount_eur);
CREATE INDEX IF NOT EXISTS idx_project_details_quality ON project_details(quality_status);
CREATE INDEX IF NOT EXISTS idx_project_details_score ON project_details(completeness_score);
CREATE INDEX IF NOT EXISTS idx_project_details_country_quality ON project_details(country_code, quality_status);
CREATE INDEX IF NOT EXISTS idx_project_details_primary_doc ON project_details(has_primary_document);
CREATE INDEX IF NOT EXISTS idx_budget_terms_country ON project_budget_terms(country_code);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
-- НЕ е UNIQUE: в продукцията вече има 11 стари двойки (project_id, normalized_url),
-- а правилото е „старите записи не се трият". Дедупликацията е на ниво приложение
-- (INSERT ... WHERE NOT EXISTS по normalized_url), а заварените дубликати се
-- записват като аномалии `duplicate_document` за ръчен преглед.
CREATE INDEX IF NOT EXISTS idx_documents_project_norm_url ON documents(project_id, normalized_url);
CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents(checksum);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(doc_category);
CREATE INDEX IF NOT EXISTS idx_documents_country ON documents(country_code);

CREATE INDEX IF NOT EXISTS idx_change_history_project ON project_change_history(project_id);
CREATE INDEX IF NOT EXISTS idx_change_history_changed_at ON project_change_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_change_history_type ON project_change_history(change_type);
CREATE INDEX IF NOT EXISTS idx_change_history_run ON project_change_history(run_id);
CREATE INDEX IF NOT EXISTS idx_change_history_country ON project_change_history(country_code);

CREATE INDEX IF NOT EXISTS idx_anomalies_project ON project_anomalies(project_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_status ON project_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomalies_type ON project_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomalies_country ON project_anomalies(country_code);
CREATE INDEX IF NOT EXISTS idx_anomalies_run ON project_anomalies(run_id);

CREATE INDEX IF NOT EXISTS idx_budget_components_project ON project_budget_components(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_budget_components ON project_budget_components(project_id, component_type, component_key);

CREATE INDEX IF NOT EXISTS idx_eligibility_project ON project_eligibility(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_eligibility ON project_eligibility(project_id, dimension, value_key);

CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_project ON document_versions(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_document_versions ON document_versions(document_id, checksum);

CREATE UNIQUE INDEX IF NOT EXISTS ux_source_candidates ON source_discovery_candidates(country_code, normalized_url);
CREATE INDEX IF NOT EXISTS idx_source_candidates_status ON source_discovery_candidates(status);

CREATE INDEX IF NOT EXISTS idx_source_health_source ON source_health_history(source_id);
CREATE INDEX IF NOT EXISTS idx_source_health_checked ON source_health_history(checked_at);
CREATE INDEX IF NOT EXISTS idx_source_health_country ON source_health_history(country_code);

CREATE INDEX IF NOT EXISTS idx_scheduled_sync_runs_task ON scheduled_sync_runs(task_key, id);
CREATE INDEX IF NOT EXISTS idx_funding_sources_country ON funding_sources(country_code);
CREATE INDEX IF NOT EXISTS idx_funding_sources_health ON funding_sources(source_health);

-- Backfill: съществуващите документи получават normalized_url (иначе UNIQUE
-- индексът би третирал всички NULL-и като различни — което е коректно, но
-- дедупликацията няма да работи за старите редове).
UPDATE documents
   SET normalized_url = lower(
         replace(
           replace(
             CASE WHEN instr(source_url, '#') > 0
                  THEN substr(source_url, 1, instr(source_url, '#') - 1)
                  ELSE source_url END,
             'https://', ''),
           'http://', '')
       )
 WHERE normalized_url IS NULL AND source_url IS NOT NULL AND source_url != '';

-- Гаранция занапред: всеки нов документ получава `normalized_url` дори когато
-- го е записал стар код (деплойнатият Worker или предишната версия на задачата).
-- Без това дедупликацията по (project_id, normalized_url) не хваща новите редове
-- и всяко следващо обхождане би създавало дубликат.
CREATE TRIGGER IF NOT EXISTS trg_documents_normalized_url_insert
AFTER INSERT ON documents
FOR EACH ROW WHEN NEW.normalized_url IS NULL AND NEW.source_url IS NOT NULL AND NEW.source_url != ''
BEGIN
  UPDATE documents SET normalized_url = lower(
      replace(replace(
        CASE WHEN instr(NEW.source_url, '#') > 0
             THEN substr(NEW.source_url, 1, instr(NEW.source_url, '#') - 1)
             ELSE NEW.source_url END,
        'https://', ''), 'http://', ''))
   WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_documents_normalized_url_update
AFTER UPDATE OF source_url ON documents
FOR EACH ROW WHEN NEW.normalized_url IS NULL AND NEW.source_url IS NOT NULL AND NEW.source_url != ''
BEGIN
  UPDATE documents SET normalized_url = lower(
      replace(replace(
        CASE WHEN instr(NEW.source_url, '#') > 0
             THEN substr(NEW.source_url, 1, instr(NEW.source_url, '#') - 1)
             ELSE NEW.source_url END,
        'https://', ''), 'http://', ''))
   WHERE id = NEW.id;
END;

-- ВАЖНО: `has_primary_document` и `documents.is_primary` НЕ се backfill-ват.
-- „Основен официален документ" е класификация, която трябва да бъде доказана от
-- източника (насоки/условия/покана), а не предположена от факта, че процедурата
-- има някакъв прикачен файл. Затова започват от 0 и се попълват от задачата.

-- Заварените дубликати по (project_id, normalized_url) се вписват като аномалии,
-- за да са видими в администрацията, вместо да бъдат изтрити.
INSERT INTO project_anomalies (project_id, country_code, anomaly_type, severity, field_name,
  observed_value, source_url, status, notes, detected_at, created_at)
SELECT d.project_id, d.country_code, 'duplicate_document', 'warning', 'normalized_url',
       d.normalized_url, MIN(d.source_url), 'open',
       'Заварени ' || COUNT(*) || ' записа със същия нормализиран URL (migration 0025).',
       datetime('now'), datetime('now')
  FROM documents d
 WHERE d.normalized_url IS NOT NULL
 GROUP BY d.project_id, d.normalized_url
HAVING COUNT(*) > 1;
