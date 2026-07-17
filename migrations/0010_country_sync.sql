-- Migration 0010 — country-aware sync state + per-source run metrics.
-- Additive. Feeds the CountrySyncOrchestrator (resumable rollout).

CREATE TABLE IF NOT EXISTS country_sync_state (
  country_code TEXT PRIMARY KEY,
  rollout_status TEXT NOT NULL DEFAULT 'not_started',
  next_source_cursor TEXT,
  next_run_at TEXT,
  last_started_at TEXT,
  last_completed_at TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_summary TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  total_sources INTEGER NOT NULL DEFAULT 0,
  successful_sources INTEGER NOT NULL DEFAULT 0,
  failed_sources INTEGER NOT NULL DEFAULT 0,
  total_records_seen INTEGER NOT NULL DEFAULT 0,
  inserted_records INTEGER NOT NULL DEFAULT 0,
  updated_records INTEGER NOT NULL DEFAULT 0,
  unchanged_records INTEGER NOT NULL DEFAULT 0,
  invalid_records INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (country_code) REFERENCES countries(code)
);
CREATE INDEX IF NOT EXISTS idx_csync_next_run ON country_sync_state (next_run_at);

CREATE TABLE IF NOT EXISTS source_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT,
  country_code TEXT,
  started_at TEXT,
  completed_at TEXT,
  status TEXT,
  http_status INTEGER,
  records_seen INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  unchanged INTEGER NOT NULL DEFAULT 0,
  invalid INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_ssruns_source  ON source_sync_runs (source_id);
CREATE INDEX IF NOT EXISTS idx_ssruns_country ON source_sync_runs (country_code);
CREATE INDEX IF NOT EXISTS idx_ssruns_started ON source_sync_runs (started_at);

-- Seed sync state rows for all countries (BG active).
INSERT OR IGNORE INTO country_sync_state (country_code, rollout_status, created_at, updated_at)
SELECT code, CASE WHEN code='BG' THEN 'active' ELSE 'not_started' END,
       '2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'
FROM countries;
