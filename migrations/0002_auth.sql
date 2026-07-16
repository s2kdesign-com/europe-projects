-- Migration 0002 — автентикация и потребителски данни.
-- Само ДОБАВЯЩО (всичко е IF NOT EXISTS). Не пипа съществуващите таблици
-- projects/documents/snapshots и не изтрива данни. НЕ прилагай към продукционната
-- D1 оттук — за локален `wrangler d1 execute --local` / miniflare.

-- Потребители (идентичност от Google OpenID Connect).
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name   TEXT,
  avatar_url     TEXT,
  locale         TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  last_login_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Връзка потребител ↔ външен доставчик (Google). Без съхранение на токени.
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts (user_id);

-- Сесии — в базата се пази само ХЕШ на токена (raw токенът е в HttpOnly бисквитка).
CREATE TABLE IF NOT EXISTS sessions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  last_used_at       TEXT,
  user_agent         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions (session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Еднократни OAuth транзакции (state + PKCE verifier + nonce + return_to).
CREATE TABLE IF NOT EXISTS oauth_state (
  id            TEXT PRIMARY KEY,
  state         TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  return_to     TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_state_exp ON oauth_state (expires_at);

-- Профил за съпоставяне с възможности за финансиране (масивите се пазят като JSON).
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id                          TEXT PRIMARY KEY,
  organization_name                TEXT,
  organization_type                TEXT,
  company_or_registration_number   TEXT,
  region                           TEXT,
  municipality                     TEXT,
  organization_size                TEXT,
  employee_count_range             TEXT,
  annual_revenue_range             TEXT,
  primary_sector                   TEXT,
  additional_sectors               TEXT,   -- JSON масив
  preferred_programs               TEXT,   -- JSON масив
  applicant_types                  TEXT,   -- JSON масив
  minimum_project_budget           INTEGER,
  maximum_project_budget           INTEGER,
  maximum_self_financing_percentage INTEGER,
  preferred_activities             TEXT,   -- JSON масив
  preferred_regions                TEXT,   -- JSON масив
  youth_employment_interest        INTEGER NOT NULL DEFAULT 0,
  innovation_interest              INTEGER NOT NULL DEFAULT 0,
  digitalization_interest          INTEGER NOT NULL DEFAULT 0,
  green_transition_interest        INTEGER NOT NULL DEFAULT 0,
  research_interest                INTEGER NOT NULL DEFAULT 0,
  training_interest                INTEGER NOT NULL DEFAULT 0,
  notes                            TEXT,
  profile_completion_percentage    INTEGER NOT NULL DEFAULT 0,
  created_at                       TEXT NOT NULL,
  updated_at                       TEXT NOT NULL
);

-- Запазени процедури, обвързани с акаунт (уникалност на потребител+процедура).
CREATE TABLE IF NOT EXISTS saved_procedures (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  procedure_id        TEXT NOT NULL,
  saved_at            TEXT NOT NULL,
  last_viewed_at      TEXT,
  personal_status     TEXT,
  personal_note       TEXT,
  reminder_enabled    INTEGER NOT NULL DEFAULT 0,
  reminder_days_before INTEGER,
  last_updated_at_save TEXT,   -- last_updated на процедурата към момента на запазване
  archived_at         TEXT,
  UNIQUE (user_id, procedure_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_procedures (user_id);

-- Потребителски предпочитания (изглед, период, известия).
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                        TEXT PRIMARY KEY,
  language                       TEXT DEFAULT 'bg',
  default_view                   TEXT,
  preferred_period               TEXT,
  email_notifications_enabled    INTEGER NOT NULL DEFAULT 0,
  deadline_notifications_enabled INTEGER NOT NULL DEFAULT 1,
  change_notifications_enabled   INTEGER NOT NULL DEFAULT 1,
  notification_days_before       INTEGER DEFAULT 7,
  created_at                     TEXT NOT NULL,
  updated_at                     TEXT NOT NULL
);
