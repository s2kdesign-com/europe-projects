-- Migration 0013 — AI доставчици, credentials (encrypted), model configurations,
-- execution runs и audit log. Additive. Ключовете НИКОГА не са plain text —
-- AES-256-GCM с master key от Cloudflare secret AI_CREDENTIALS_MASTER_KEY
-- (не присъства в D1, нито във frontend bundle).

CREATE TABLE IF NOT EXISTS ai_providers (
  provider_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  credential_status TEXT NOT NULL DEFAULT 'not_configured',
  connection_status TEXT NOT NULL DEFAULT 'unknown',
  available_models_json TEXT,
  models_refreshed_at TEXT,
  last_tested_at TEXT,
  last_test_status TEXT,
  last_test_error_code TEXT,
  last_test_error_summary TEXT,
  configured_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_providers (provider_key, display_name, created_at, updated_at) VALUES
  ('anthropic','Anthropic','2026-07-18T18:00:00.000Z','2026-07-18T18:00:00.000Z'),
  ('openai','OpenAI','2026-07-18T18:00:00.000Z','2026-07-18T18:00:00.000Z');

CREATE TABLE IF NOT EXISTS ai_provider_credentials (
  provider_key TEXT PRIMARY KEY,
  encrypted_secret TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT,
  encryption_version INTEGER NOT NULL DEFAULT 1,
  secret_last_four TEXT,
  secret_fingerprint TEXT,
  created_by_user_id TEXT,
  rotated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_model_configurations (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  model_family TEXT,
  model_tier TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  fallback_priority INTEGER,
  supports_streaming INTEGER NOT NULL DEFAULT 0,
  supports_tools INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  supports_structured_output INTEGER NOT NULL DEFAULT 0,
  max_output_tokens INTEGER,
  reasoning_setting TEXT,
  temperature REAL,
  configuration_json TEXT,
  last_validated_at TEXT,
  validation_status TEXT NOT NULL DEFAULT 'unvalidated',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aimc_purpose ON ai_model_configurations (purpose);
-- Само една активна конфигурация на purpose (partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS uq_aimc_active_purpose ON ai_model_configurations (purpose) WHERE active = 1;

-- Seed: daily_review = Claude Opus 4.8 (потвърден Anthropic model ID claude-opus-4-8).
-- ВАЖНО: дневният преглед се изпълнява от Claude Scheduled Task — моделът му се
-- управлява от Claude Scheduled Tasks, НЕ от тази конфигурация (desired vs actual).
INSERT OR IGNORE INTO ai_model_configurations (id, purpose, provider_key, model_id, display_name, model_family, model_tier, active, validation_status, created_at, updated_at) VALUES
  ('daily_review-anthropic','daily_review','anthropic','claude-opus-4-8','Claude Opus 4.8','claude-opus','opus',1,'vendor_documented','2026-07-18T18:00:00.000Z','2026-07-18T18:00:00.000Z'),
  -- GPT-5.6: точният API model ID НЕ се приема за 'gpt-5.6' без проверка. Остава
  -- НЕАКТИВЕН до реална валидация с конфигуриран OpenAI ключ (tiers: Sol/Terra/Luna).
  ('procedure_analysis-openai','procedure_analysis','openai','gpt-5.6','GPT-5.6','gpt-5.6',NULL,0,'unvalidated','2026-07-18T18:00:00.000Z','2026-07-18T18:00:00.000Z'),
  ('future_chat-openai','future_chat','openai','gpt-5.6','GPT-5.6','gpt-5.6',NULL,0,'unvalidated','2026-07-18T18:00:00.000Z','2026-07-18T18:00:00.000Z');

CREATE TABLE IF NOT EXISTS ai_execution_runs (
  id TEXT PRIMARY KEY,
  execution_type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  provider_key TEXT,
  model_id TEXT,
  model_display_name TEXT,
  execution_source TEXT,
  scheduled_task_name TEXT,
  scheduled_task_run_id TEXT,
  country_code TEXT,
  source_id TEXT,
  parent_sync_run_id TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_input_tokens INTEGER,
  reasoning_tokens INTEGER,
  request_count INTEGER,
  successful_request_count INTEGER,
  failed_request_count INTEGER,
  procedures_reviewed INTEGER,
  documents_reviewed INTEGER,
  budgets_reviewed INTEGER,
  changes_detected INTEGER,
  provider_request_id TEXT,
  error_code TEXT,
  safe_error_summary TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_air_started ON ai_execution_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_air_purpose ON ai_execution_runs (purpose);
CREATE INDEX IF NOT EXISTS idx_air_source ON ai_execution_runs (execution_source);
CREATE INDEX IF NOT EXISTS idx_air_task_run ON ai_execution_runs (scheduled_task_run_id);

CREATE TABLE IF NOT EXISTS ai_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  provider_key TEXT,
  purpose TEXT,
  previous_safe_configuration TEXT,
  new_safe_configuration TEXT,
  result TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aal_created ON ai_audit_log (created_at);
