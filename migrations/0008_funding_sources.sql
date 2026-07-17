-- Migration 0008 — central registry of official funding sources + audit log.
-- Additive. FK to countries(code). No existing data touched.

CREATE TABLE IF NOT EXISTS funding_sources (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  name TEXT NOT NULL,
  authority_name TEXT,
  authority_type TEXT,
  base_url TEXT NOT NULL,
  calls_url TEXT,
  programmes_url TEXT,
  documents_url TEXT,
  source_type TEXT NOT NULL,
  source_level TEXT NOT NULL,
  official INTEGER NOT NULL DEFAULT 1,
  primary_source INTEGER NOT NULL DEFAULT 0,
  coverage_description TEXT,
  source_language TEXT,
  parser_type TEXT,
  adapter_key TEXT,
  update_frequency TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  robots_checked INTEGER NOT NULL DEFAULT 0,
  terms_checked INTEGER NOT NULL DEFAULT 0,
  requires_javascript INTEGER NOT NULL DEFAULT 0,
  supports_api INTEGER NOT NULL DEFAULT 0,
  supports_rss INTEGER NOT NULL DEFAULT 0,
  supports_sitemap INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_error_code TEXT,
  last_error_summary TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  source_health TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (country_code) REFERENCES countries(code)
);

CREATE INDEX IF NOT EXISTS idx_fsrc_country       ON funding_sources (country_code);
CREATE INDEX IF NOT EXISTS idx_fsrc_enabled       ON funding_sources (enabled);
CREATE INDEX IF NOT EXISTS idx_fsrc_verified      ON funding_sources (verified);
CREATE INDEX IF NOT EXISTS idx_fsrc_health        ON funding_sources (source_health);
CREATE INDEX IF NOT EXISTS idx_fsrc_next_run      ON funding_sources (next_run_at);
CREATE INDEX IF NOT EXISTS idx_fsrc_country_prio  ON funding_sources (country_code, priority);

CREATE TABLE IF NOT EXISTS source_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT,
  country_code TEXT,
  checked_at TEXT NOT NULL,
  checked_by TEXT,
  status TEXT,
  http_status INTEGER,
  content_type TEXT,
  result_summary TEXT,
  evidence_url TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_saudit_source  ON source_audit_log (source_id);
CREATE INDEX IF NOT EXISTS idx_saudit_country ON source_audit_log (country_code);
