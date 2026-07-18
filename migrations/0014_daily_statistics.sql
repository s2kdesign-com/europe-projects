-- Migration 0014 — дневни агрегирани статистики по държави (за /about страницата).
-- Additive. Публичната страница чете последния УСПЕШЕН snapshot — тежките
-- агрегации НЕ се смятат при всяко зареждане. Дневната процедура обновява
-- snapshot-а атомарно; partial sync НЕ заменя последния успешен.

CREATE TABLE IF NOT EXISTS country_daily_statistics (
  id TEXT PRIMARY KEY,                    -- '<CC>:<YYYY-MM-DD>'
  snapshot_date TEXT NOT NULL,
  country_code TEXT NOT NULL,
  total_procedures INTEGER NOT NULL DEFAULT 0,
  active_procedures INTEGER NOT NULL DEFAULT 0,
  upcoming_procedures INTEGER NOT NULL DEFAULT 0,
  closed_procedures INTEGER NOT NULL DEFAULT 0,
  procedures_with_documents INTEGER NOT NULL DEFAULT 0,
  new_last_30_days INTEGER NOT NULL DEFAULT 0,
  updated_last_30_days INTEGER NOT NULL DEFAULT 0,
  published_budget_eur REAL,              -- само валидни структурирани бюджети; NULL при липса
  budget_procedure_count INTEGER NOT NULL DEFAULT 0,
  active_sources INTEGER NOT NULL DEFAULT 0,
  successful_sources INTEGER NOT NULL DEFAULT 0,
  failed_sources INTEGER NOT NULL DEFAULT 0,
  documents_scanned INTEGER,
  ai_analyses_completed INTEGER,
  last_successful_sync_at TEXT,
  coverage_status TEXT,
  publish_status TEXT NOT NULL DEFAULT 'published',  -- published | pending_review
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cds_date_country ON country_daily_statistics (snapshot_date, country_code);
CREATE INDEX IF NOT EXISTS idx_cds_country ON country_daily_statistics (country_code);
CREATE INDEX IF NOT EXISTS idx_cds_date ON country_daily_statistics (snapshot_date);
