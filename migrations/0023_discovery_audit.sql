-- 0023_discovery_audit.sql
-- История на валидациите за готовност за агенти и SEO (админ табове
-- „API & Agents" и „SEO & Discovery"). Само добавящи операции.
--
-- ВАЖНО: тук НЕ се записват тела на отговори с лични или тайни данни.
-- В safe_details_json влизат само редактирани (redactObject) стойности.

CREATE TABLE IF NOT EXISTS agent_readiness_runs (
  id                   TEXT PRIMARY KEY,
  trigger_type         TEXT NOT NULL,              -- manual | scheduled | api | revalidate
  triggered_by_user_id TEXT,
  environment          TEXT NOT NULL DEFAULT 'production',
  origin               TEXT NOT NULL,
  groups_json          TEXT NOT NULL,              -- избраните валидационни групи
  started_at           TEXT NOT NULL,
  completed_at         TEXT,
  status               TEXT NOT NULL DEFAULT 'running', -- running | completed | stopped | failed
  overall_status       TEXT,                       -- passed | warning | failed
  total_checks         INTEGER NOT NULL DEFAULT 0,
  passed_checks        INTEGER NOT NULL DEFAULT 0,
  warning_checks       INTEGER NOT NULL DEFAULT 0,
  failed_checks        INTEGER NOT NULL DEFAULT 0,
  skipped_checks       INTEGER NOT NULL DEFAULT 0,
  duration_ms          INTEGER,
  report_json          TEXT,                       -- обобщение (без тела на отговори)
  application_version  TEXT,
  build_id             TEXT,
  current_category     TEXT,
  current_resource     TEXT
);
CREATE INDEX IF NOT EXISTS idx_readiness_runs_started ON agent_readiness_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_readiness_runs_status ON agent_readiness_runs(status, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_readiness_check_results (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id                TEXT NOT NULL,
  sequence              INTEGER NOT NULL DEFAULT 0,
  category              TEXT NOT NULL,
  check_code            TEXT NOT NULL,
  params_json           TEXT,
  resource_url          TEXT,
  status                TEXT NOT NULL DEFAULT 'pending', -- pending | passed | warning | failed | not_applicable
  response_status       INTEGER,
  response_content_type TEXT,
  duration_ms           INTEGER,
  summary_key           TEXT,
  summary_params_json   TEXT,
  safe_details_json     TEXT,
  created_at            TEXT NOT NULL,
  completed_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_readiness_results_run ON agent_readiness_check_results(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_readiness_results_pending ON agent_readiness_check_results(run_id, status);
CREATE INDEX IF NOT EXISTS idx_readiness_results_code ON agent_readiness_check_results(check_code, created_at DESC);

-- Сигнали от валидациите с ДЕДУПЛИКАЦИЯ: един отворен сигнал на (check_code,
-- resource_url). Повторно откриване вдига last_seen_at и брояча, вместо да
-- създава нов запис при всяко пускане.
CREATE TABLE IF NOT EXISTS discovery_signals (
  id             TEXT PRIMARY KEY,
  signal_key     TEXT NOT NULL,
  category       TEXT NOT NULL,
  check_code     TEXT NOT NULL,
  resource_url   TEXT,
  severity       TEXT NOT NULL DEFAULT 'warning',  -- info | warning | high | critical
  state          TEXT NOT NULL DEFAULT 'open',     -- open | resolved
  summary_key    TEXT NOT NULL,
  summary_params_json TEXT,
  safe_details_json   TEXT,
  occurrences    INTEGER NOT NULL DEFAULT 1,
  first_seen_at  TEXT NOT NULL,
  last_seen_at   TEXT NOT NULL,
  resolved_at    TEXT,
  last_run_id    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_signals_key ON discovery_signals(signal_key);
CREATE INDEX IF NOT EXISTS idx_discovery_signals_state ON discovery_signals(state, severity, last_seen_at DESC);
