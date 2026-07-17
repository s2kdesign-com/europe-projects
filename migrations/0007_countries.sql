-- Migration 0007 — countries registry (multi-country foundation).
-- Additive: creates a new table only. Does NOT touch existing data.
-- Seeds all 27 EU member states. Only BG is enabled (reference); the rest are
-- present in the registry but disabled until they pass QA.

CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_bg TEXT NOT NULL,
  native_name TEXT NOT NULL,
  english_name TEXT NOT NULL,
  default_language TEXT NOT NULL,
  currency_code TEXT,
  flag_asset TEXT,
  eu_member INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 0,
  onboarding_enabled INTEGER NOT NULL DEFAULT 1,
  ingestion_status TEXT NOT NULL DEFAULT 'not_started',
  coverage_status TEXT NOT NULL DEFAULT 'none',
  priority INTEGER NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  active_source_count INTEGER NOT NULL DEFAULT 0,
  last_successful_sync_at TEXT,
  last_source_audit_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_countries_enabled  ON countries (enabled);
CREATE INDEX IF NOT EXISTS idx_countries_priority ON countries (priority);

-- Seed (ISO 3166-1 alpha-2). BG active; останалите disabled до QA.
INSERT OR IGNORE INTO countries
  (code, slug, name_bg, native_name, english_name, default_language, currency_code, flag_asset, eu_member, enabled, onboarding_enabled, ingestion_status, coverage_status, priority, created_at, updated_at)
VALUES
  ('BG','bulgaria','България','България','Bulgaria','bg','BGN','/flags/bg.svg',1,1,1,'active','full',0,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('RO','romania','Румъния','România','Romania','ro','RON','/flags/ro.svg',1,0,1,'not_started','none',1,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('GR','greece','Гърция','Ελλάδα','Greece','el','EUR','/flags/gr.svg',1,0,1,'not_started','none',2,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('PL','poland','Полша','Polska','Poland','pl','PLN','/flags/pl.svg',1,0,1,'not_started','none',3,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('HR','croatia','Хърватия','Hrvatska','Croatia','hr','EUR','/flags/hr.svg',1,0,1,'not_started','none',4,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('CZ','czechia','Чехия','Česko','Czechia','cs','CZK','/flags/cz.svg',1,0,1,'not_started','none',5,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('PT','portugal','Португалия','Portugal','Portugal','pt','EUR','/flags/pt.svg',1,0,1,'not_started','none',6,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('SK','slovakia','Словакия','Slovensko','Slovakia','sk','EUR','/flags/sk.svg',1,0,1,'not_started','none',7,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('HU','hungary','Унгария','Magyarország','Hungary','hu','HUF','/flags/hu.svg',1,0,1,'not_started','none',8,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('SI','slovenia','Словения','Slovenija','Slovenia','sl','EUR','/flags/si.svg',1,0,1,'not_started','none',9,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('IT','italy','Италия','Italia','Italy','it','EUR','/flags/it.svg',1,0,1,'not_started','none',10,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('ES','spain','Испания','España','Spain','es','EUR','/flags/es.svg',1,0,1,'not_started','none',11,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('DE','germany','Германия','Deutschland','Germany','de','EUR','/flags/de.svg',1,0,1,'not_started','none',12,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('FR','france','Франция','France','France','fr','EUR','/flags/fr.svg',1,0,1,'not_started','none',13,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('LT','lithuania','Литва','Lietuva','Lithuania','lt','EUR','/flags/lt.svg',1,0,1,'not_started','none',14,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('LV','latvia','Латвия','Latvija','Latvia','lv','EUR','/flags/lv.svg',1,0,1,'not_started','none',15,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('EE','estonia','Естония','Eesti','Estonia','et','EUR','/flags/ee.svg',1,0,1,'not_started','none',16,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('NL','netherlands','Нидерландия','Nederland','Netherlands','nl','EUR','/flags/nl.svg',1,0,1,'not_started','none',17,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('BE','belgium','Белгия','België','Belgium','nl','EUR','/flags/be.svg',1,0,1,'not_started','none',18,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('SE','sweden','Швеция','Sverige','Sweden','sv','SEK','/flags/se.svg',1,0,1,'not_started','none',19,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('FI','finland','Финландия','Suomi','Finland','fi','EUR','/flags/fi.svg',1,0,1,'not_started','none',20,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('AT','austria','Австрия','Österreich','Austria','de','EUR','/flags/at.svg',1,0,1,'not_started','none',21,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('IE','ireland','Ирландия','Éire','Ireland','en','EUR','/flags/ie.svg',1,0,1,'not_started','none',22,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('DK','denmark','Дания','Danmark','Denmark','da','DKK','/flags/dk.svg',1,0,1,'not_started','none',23,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('CY','cyprus','Кипър','Κύπρος','Cyprus','el','EUR','/flags/cy.svg',1,0,1,'not_started','none',24,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('MT','malta','Малта','Malta','Malta','mt','EUR','/flags/mt.svg',1,0,1,'not_started','none',25,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z'),
  ('LU','luxembourg','Люксембург','Lëtzebuerg','Luxembourg','fr','EUR','/flags/lu.svg',1,0,1,'not_started','none',26,'2026-07-18T00:00:00.000Z','2026-07-18T00:00:00.000Z');
