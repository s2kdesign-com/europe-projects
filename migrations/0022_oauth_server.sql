-- 0022_oauth_server.sql
-- OAuth 2.1 authorization server (само за четене) + OpenID Connect.
-- Сайтът досега беше само OAuth КЛИЕНТ на Google; тук става и authorization
-- server за собствените си API-та, за да могат AI агенти да четат личните данни
-- на потребител без сесийна бисквитка. Само добавящи операции.

-- Ключове за подпис на JWT (ES256). Частният ключ се пази КРИПТИРАН
-- (AES-256-GCM с AI_CREDENTIALS_MASTER_KEY) — никога в plaintext.
CREATE TABLE IF NOT EXISTS oauth_signing_keys (
  kid                    TEXT PRIMARY KEY,
  algorithm              TEXT NOT NULL DEFAULT 'ES256',
  public_jwk             TEXT NOT NULL,
  private_jwk_ciphertext TEXT NOT NULL,
  private_jwk_iv         TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'active',   -- active | retiring | revoked
  created_at             TEXT NOT NULL,
  rotated_at             TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_signing_keys_status ON oauth_signing_keys(status, created_at);

-- Регистрирани клиенти. Няма динамична регистрация (RFC 7591) — вписват се ръчно.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id      TEXT PRIMARY KEY,
  client_name    TEXT NOT NULL,
  client_uri     TEXT,
  logo_uri       TEXT,
  client_type    TEXT NOT NULL DEFAULT 'public',           -- само public (PKCE)
  redirect_uris  TEXT NOT NULL,                            -- JSON масив
  allow_loopback INTEGER NOT NULL DEFAULT 0,               -- RFC 8252: произволен порт на 127.0.0.1
  scopes         TEXT NOT NULL DEFAULT 'openid profile:read saved:read',
  enabled        INTEGER NOT NULL DEFAULT 1,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT
);

-- Еднократни authorization кодове (пази се само SHA-256 хеш).
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash             TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL,
  user_id               TEXT NOT NULL,
  redirect_uri          TEXT NOT NULL,
  scope                 TEXT NOT NULL,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  resource              TEXT,
  nonce                 TEXT,
  expires_at            TEXT NOT NULL,
  consumed_at           TEXT,
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON oauth_authorization_codes(user_id, client_id);

-- Refresh токени с ротация (пази се само SHA-256 хеш). Преизползван токен гаси
-- цялата верига за (потребител, клиент).
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash   TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  scope        TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  rotated_to   TEXT,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user ON oauth_refresh_tokens(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_expires ON oauth_refresh_tokens(expires_at);

-- Запомнено съгласие: същият клиент със същите права не пита повторно.
CREATE TABLE IF NOT EXISTS oauth_grants (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  client_id  TEXT NOT NULL,
  scope      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_grants_user ON oauth_grants(user_id);

-- Клиент по подразбиране за CLI/native агенти: loopback redirect с произволен
-- порт (RFC 8252 §7.3), PKCE задължително, само права за четене.
INSERT OR IGNORE INTO oauth_clients
  (client_id, client_name, client_uri, client_type, redirect_uris, allow_loopback, scopes, enabled, notes, created_at, updated_at)
VALUES (
  'euro-funding-agent',
  'AI агент (локален)',
  'https://euro-funds.eu/docs/api',
  'public',
  '["http://127.0.0.1/callback","http://localhost/callback"]',
  1,
  'openid profile:read saved:read',
  1,
  'Публичен клиент за локални агенти. Loopback адрес с произволен порт. Само четене.',
  datetime('now'),
  datetime('now')
);
