-- Migration 0004 — история на промените (changelog) и обратна връзка (feedback).
-- Само добавящо. Seed-ва се от app/lib/changelog-data.js.

CREATE TABLE IF NOT EXISTS changelog_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  version        TEXT NOT NULL,
  title          TEXT NOT NULL,
  summary        TEXT,
  content        TEXT,      -- JSON масив с промените
  category       TEXT,      -- feature|improvement|fix|data|performance|security
  published_at   TEXT,      -- YYYY-MM-DD
  affected_route TEXT,
  image_url      TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changelog_published ON changelog_entries (published_at);
CREATE INDEX IF NOT EXISTS idx_changelog_category  ON changelog_entries (category);
CREATE INDEX IF NOT EXISTS idx_changelog_version   ON changelog_entries (version);

CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  type        TEXT,          -- bug|data|idea
  title       TEXT,
  description TEXT,
  url         TEXT,
  app_version TEXT,
  email       TEXT,
  user_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);
