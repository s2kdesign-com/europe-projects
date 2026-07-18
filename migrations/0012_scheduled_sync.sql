-- Migration 0012 — persistent cursor + locks + run reports за Claude Scheduled Task
-- (multi-country daily sync). Additive. D1 е source of truth за progress-а —
-- Scheduled Task паметта НЕ се ползва за cursor.

-- Persistent cursor per task (round-robin по държави).
CREATE TABLE IF NOT EXISTS scheduled_country_sync_state (
  task_key TEXT PRIMARY KEY,
  current_country_code TEXT,
  current_source_id TEXT,
  cycle_started_at TEXT,
  last_run_started_at TEXT,
  last_run_completed_at TEXT,
  last_completed_country_code TEXT,
  completed_countries_in_cycle INTEGER NOT NULL DEFAULT 0,
  total_countries_in_cycle INTEGER NOT NULL DEFAULT 0,
  cycle_number INTEGER NOT NULL DEFAULT 0,
  continuation_data_json TEXT,
  updated_at TEXT NOT NULL
);

-- Lock полета върху country_sync_state (предотвратяват паралелна обработка).
ALTER TABLE country_sync_state ADD COLUMN locked_at TEXT;
ALTER TABLE country_sync_state ADD COLUMN locked_by TEXT;
ALTER TABLE country_sync_state ADD COLUMN lock_expires_at TEXT;

-- Отчет за всеки Scheduled Task run (без credentials/чувствителни данни).
CREATE TABLE IF NOT EXISTS scheduled_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_key TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  status TEXT,
  cycle_number INTEGER,
  start_country_code TEXT,
  end_country_code TEXT,
  countries_attempted INTEGER NOT NULL DEFAULT 0,
  countries_succeeded INTEGER NOT NULL DEFAULT 0,
  countries_failed INTEGER NOT NULL DEFAULT 0,
  sources_attempted INTEGER NOT NULL DEFAULT 0,
  sources_succeeded INTEGER NOT NULL DEFAULT 0,
  sources_failed INTEGER NOT NULL DEFAULT 0,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_unchanged INTEGER NOT NULL DEFAULT 0,
  records_invalid INTEGER NOT NULL DEFAULT 0,
  documents_inserted INTEGER NOT NULL DEFAULT 0,
  ai_jobs_created INTEGER NOT NULL DEFAULT 0,
  translations_invalidated INTEGER NOT NULL DEFAULT 0,
  continuation_country_code TEXT,
  safe_summary TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ssr_task    ON scheduled_sync_runs (task_key);
CREATE INDEX IF NOT EXISTS idx_ssr_started ON scheduled_sync_runs (started_at);

-- Seed на cursor реда (стабилен task key).
INSERT OR IGNORE INTO scheduled_country_sync_state (task_key, updated_at)
VALUES ('daily-eu-country-sync', '2026-07-18T00:00:00.000Z');
