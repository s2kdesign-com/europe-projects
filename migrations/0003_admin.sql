-- Migration 0003 — роли и системен журнал за грешки (Exceptions).
-- Само добавящо. Прилага се веднъж (ALTER не е идемпотентно — виж бележката).

-- Роля на потребителя: 'user' | 'premium' | 'admin'. По подразбиране 'user'.
-- Забележка: ако колоната вече съществува, ALTER ще върне грешка — пропусни го.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- Първи администратор.
UPDATE users SET role='admin' WHERE email='s2kdesign.digital@gmail.com';

-- Журнал на грешките (сървърни и клиентски) за таб „Exceptions".
CREATE TABLE IF NOT EXISTS error_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  source     TEXT,      -- 'server' | 'client'
  method     TEXT,
  path       TEXT,
  status     INTEGER,
  message    TEXT,
  detail     TEXT,      -- стек/допълнителна информация (съкратена)
  user_id    TEXT
);
CREATE INDEX IF NOT EXISTS idx_error_created ON error_log (created_at);
