-- Migration 0015 — административни региони по държави + country-aware профилни
-- колони. Additive. Профилът вече НЕ ползва hardcoded български области/BGN.
-- Seed (приложен директно в prod D1 през connector на 2026-07-18): ВСИЧКИТЕ 27 ЕС
-- държави, 394 региона общо на първо административно ниво (BG 28 области, RO 42
-- окръга, DE 16 провинции, PL 16 воеводства, GR 13, HR 21, CZ 14, SK 8, AT 9,
-- SI 12, HU 20, IT 20, ES 19, FR 18, PT 20, NL 12, BE 3, SE 21, FI 19, DK 5,
-- IE 3, LT 10, LV 6, EE 15, CY 6, MT 6, LU 12). Имената: name=български,
-- native_name=местен език. Кодове: ISO 3166-2 суфикси където е приложимо.

CREATE TABLE IF NOT EXISTS country_regions (
  id TEXT PRIMARY KEY,              -- '<CC>-<code>'
  country_code TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,               -- име на български (базов език на платформата)
  native_name TEXT,                 -- име на местния език
  level INTEGER NOT NULL DEFAULT 1, -- 1=регион/област; 2=община (бъдеще)
  parent_region_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cregions ON country_regions (country_code, code, level);
CREATE INDEX IF NOT EXISTS idx_cregions_country ON country_regions (country_code, enabled, sort_order);

-- Профил: валута на финансовите полета + версия на country профила.
ALTER TABLE user_profiles ADD COLUMN financial_currency_code TEXT;
ALTER TABLE user_profiles ADD COLUMN country_profile_version INTEGER NOT NULL DEFAULT 1;
-- Backfill: съществуващите профили са български → BGN.
UPDATE user_profiles SET financial_currency_code='BGN' WHERE financial_currency_code IS NULL;
