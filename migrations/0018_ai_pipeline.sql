-- Migration 0018 — Nightly AI pipeline: job queue, pipeline runs, per-purpose
-- schedule и versioned prompts. Additive. Приложена в prod през connector 2026-07-18.
-- Строи се ВЪРХУ съществуващите ai_model_configurations / ai_execution_runs /
-- AIExecutionService — не създава втори AI framework.

-- Персистентна опашка от AI задачи (D1 queue със locks + idempotency).
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,            -- procedure | document | budget | recommendation
  entity_id TEXT NOT NULL,
  country_code TEXT,
  dependency_job_id TEXT,
  source_hash TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'queued', -- queued|waiting_dependency|running|completed|failed|retry_scheduled|cancelled|skipped_unchanged|blocked_configuration|requires_review
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TEXT NOT NULL,
  locked_at TEXT, locked_by TEXT, lock_expires_at TEXT,
  started_at TEXT, completed_at TEXT, duration_ms INTEGER,
  input_tokens INTEGER, output_tokens INTEGER, cached_input_tokens INTEGER, reasoning_tokens INTEGER,
  provider_request_id TEXT,
  error_code TEXT, safe_error_summary TEXT,
  result_version TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aijobs_ready ON ai_jobs (status, available_at);
CREATE INDEX IF NOT EXISTS idx_aijobs_run ON ai_jobs (run_id);
CREATE INDEX IF NOT EXISTS idx_aijobs_purpose ON ai_jobs (purpose);
CREATE INDEX IF NOT EXISTS idx_aijobs_country ON ai_jobs (country_code);
CREATE INDEX IF NOT EXISTS idx_aijobs_entity ON ai_jobs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_aijobs_dep ON ai_jobs (dependency_job_id);

-- Pipeline run (една вечерна оркестрация или ръчно пускане).
CREATE TABLE IF NOT EXISTS ai_pipeline_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,          -- automatic_daily|daily_review_completion|fallback_cron|admin_manual|admin_retry|recovery
  triggered_by_user_id TEXT,
  scheduled_date TEXT,                 -- YYYY-MM-DD (за idempotency на nightly)
  status TEXT NOT NULL DEFAULT 'running', -- running|completed|partial|failed|cancelled
  scope_type TEXT, scope_value TEXT, country_code TEXT,
  started_at TEXT, completed_at TEXT,
  current_stage TEXT,
  total_jobs INTEGER NOT NULL DEFAULT 0, queued_jobs INTEGER NOT NULL DEFAULT 0,
  running_jobs INTEGER NOT NULL DEFAULT 0, completed_jobs INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0, skipped_jobs INTEGER NOT NULL DEFAULT 0,
  cancelled_jobs INTEGER NOT NULL DEFAULT 0,
  procedures_processed INTEGER NOT NULL DEFAULT 0, documents_processed INTEGER NOT NULL DEFAULT 0,
  budgets_processed INTEGER NOT NULL DEFAULT 0, recommendations_updated INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL,
  safe_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Не повече от един УСПЕШЕН automatic nightly run за дата (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_nightly ON ai_pipeline_runs (scheduled_date)
  WHERE trigger_type IN ('automatic_daily','daily_review_completion','fallback_cron') AND status IN ('running','completed','partial');
CREATE INDEX IF NOT EXISTS idx_pipeline_status ON ai_pipeline_runs (status, created_at);

-- Свързваме съществуващите model executions към pipeline run.
ALTER TABLE ai_execution_runs ADD COLUMN parent_run_id TEXT;

-- Автоматично изпълнение по purpose (админ-конфигурируемо).
CREATE TABLE IF NOT EXISTS ai_schedules (
  purpose TEXT PRIMARY KEY,
  automatic_enabled INTEGER NOT NULL DEFAULT 1,
  runs_after TEXT,                     -- напр. 'daily_review' | 'procedure_analysis'
  preferred_time TEXT NOT NULL DEFAULT '23:30',
  fallback_time TEXT NOT NULL DEFAULT '23:30',
  timezone TEXT NOT NULL DEFAULT 'Europe/Sofia',
  max_jobs_per_run INTEGER NOT NULL DEFAULT 200,
  max_jobs_per_country INTEGER NOT NULL DEFAULT 40,
  concurrency INTEGER NOT NULL DEFAULT 2,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  last_run_at TEXT, next_run_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Versioned prompt templates (метаданни; самите шаблони живеят в кода — worker/ai/prompts.js).
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id TEXT PRIMARY KEY,                  -- напр. procedure-analysis-v1
  purpose TEXT NOT NULL,
  version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  safe_description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
