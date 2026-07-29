-- 0024_agent_auth.sql
-- auth.md — агентска регистрация (https://workos.com/auth-md, github.com/workos/auth.md).
--
-- Досега агент можеше да получи достъп САМО през OAuth 2.1 authorization_code
-- с човек пред браузъра. auth.md добавя трите стандартни потока, при които
-- агентът се регистрира САМ:
--   • identity_assertion + ID-JAG      → доверен доставчик на агентска
--                                        самоличност подписва твърдение за
--                                        потребителя; без човешка намеса
--   • identity_assertion + verified_email → агентът заявява имейл, потребителят
--                                        потвърждава с 6-цифрен код (claim)
--   • anonymous                        → агентът получава креденшъл веднага;
--                                        може да бъде „claim-нат" по-късно
--
-- Издаваните креденшъли са JWT access токени, подписани със СЪЩИЯ ES256 ключ
-- (oauth_signing_keys) и с `sub = "agent:<registration_id>"`. Проверката при
-- всяка заявка чете реда по-долу → отменянето действа НЕЗАБАВНО.
-- Само добавящи операции.

-- Регистрации на агенти. Суровият креденшъл НЕ се пази — само SHA-256 хеш на
-- refresh токена; access токенът е JWT и изобщо не се съхранява.
CREATE TABLE IF NOT EXISTS agent_registrations (
  id                TEXT PRIMARY KEY,                   -- uuid; влиза в sub като agent:<id>
  identity_type     TEXT NOT NULL,                      -- identity_assertion | anonymous
  assertion_type    TEXT,                               -- urn:ietf:params:oauth:token-type:id-jag | verified_email | NULL
  agent_issuer      TEXT,                               -- iss на ID-JAG твърдението
  agent_subject     TEXT,                               -- sub на ID-JAG твърдението
  agent_name        TEXT,                               -- самообявено име на агента
  agent_instance    TEXT,                               -- инстанция/устройство (самообявено)
  agent_contact     TEXT,                               -- контакт за злоупотреби (самообявен)
  email             TEXT,                               -- потвърден имейл (lowercase), ако има
  user_id           TEXT,                               -- users.id след успешен claim / ID-JAG съвпадение
  scope             TEXT NOT NULL,                      -- разделен с интервал
  status            TEXT NOT NULL,                      -- active | unclaimed | revoked
  claimed_at        TEXT,
  expires_at        TEXT,                               -- край на живота на регистрацията (не на токена)
  created_at        TEXT NOT NULL,
  last_used_at      TEXT,
  use_count         INTEGER NOT NULL DEFAULT 0,
  revoked_at        TEXT,
  revocation_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_reg_status  ON agent_registrations(status, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_reg_user    ON agent_registrations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_reg_subject ON agent_registrations(agent_issuer, agent_subject);
CREATE INDEX IF NOT EXISTS idx_agent_reg_email   ON agent_registrations(email, status);

-- Refresh токени на агентски регистрации (пази се само SHA-256 хеш; ротация
-- при всяко ползване, преизползване гаси регистрацията).
CREATE TABLE IF NOT EXISTS agent_refresh_tokens (
  token_hash      TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  scope           TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  revoked_at      TEXT,
  rotated_to      TEXT,
  created_at      TEXT NOT NULL,
  last_used_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_refresh_reg     ON agent_refresh_tokens(registration_id);
CREATE INDEX IF NOT EXISTS idx_agent_refresh_expires ON agent_refresh_tokens(expires_at);

-- Церемония по потвърждаване (claim). Пазят се само хешове — нито claim_token,
-- нито 6-цифреният код се съхраняват в прав вид.
CREATE TABLE IF NOT EXISTS agent_claims (
  claim_token_hash TEXT PRIMARY KEY,
  registration_id  TEXT NOT NULL,
  email            TEXT NOT NULL,
  otp_hash         TEXT NOT NULL,
  attempts         INTEGER NOT NULL DEFAULT 0,
  delivered        INTEGER NOT NULL DEFAULT 0,          -- 1 = имейлът е изпратен успешно
  expires_at       TEXT NOT NULL,
  completed_at     TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_claims_reg     ON agent_claims(registration_id);
CREATE INDEX IF NOT EXISTS idx_agent_claims_expires ON agent_claims(expires_at);

-- Доверени издатели на ID-JAG твърдения. ПРАЗНА по подразбиране: приемат се
-- твърдения САМО от изрично вписан издател. Вписване (през connector-а):
--   INSERT INTO agent_trusted_issuers (issuer, name, jwks_uri, enabled, created_at)
--   VALUES ('https://issuer.example', 'Име', 'https://issuer.example/.well-known/jwks.json', 1, datetime('now'));
CREATE TABLE IF NOT EXISTS agent_trusted_issuers (
  issuer     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  jwks_uri   TEXT NOT NULL,
  audience   TEXT,                                      -- очакван aud (по подразбиране resource URL)
  scopes     TEXT NOT NULL DEFAULT 'procedures:read openid profile:read saved:read',
  enabled    INTEGER NOT NULL DEFAULT 1,
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Кеш на публичните ключове на доверените издатели (JWKS не се тегли при всяка
-- заявка). Обновява се при изтекъл кеш или непознат kid.
CREATE TABLE IF NOT EXISTS agent_issuer_keys (
  issuer     TEXT NOT NULL,
  kid        TEXT NOT NULL,
  public_jwk TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (issuer, kid)
);

-- Дневник на събитията (регистрация, claim, отменяне). Без лични данни извън
-- имейла, който потребителят сам е потвърдил.
CREATE TABLE IF NOT EXISTS agent_auth_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id TEXT,
  event           TEXT NOT NULL,                        -- registered | claim_started | claimed | revoked | denied
  identity_type   TEXT,
  detail          TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_events_reg  ON agent_auth_events(registration_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_events_time ON agent_auth_events(created_at);

-- Еднократност на ID-JAG твърденията (anti-replay). Ключът е хеш на jti+iss.
CREATE TABLE IF NOT EXISTS agent_assertion_jti (
  jti_hash   TEXT PRIMARY KEY,
  issuer     TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_jti_expires ON agent_assertion_jti(expires_at);
