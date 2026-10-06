-- Last observed automatic resolution, separate from manual preferences.
-- No guessed backfill: existing users populate these fields on their next visit.
ALTER TABLE users ADD COLUMN automatic_country TEXT;
ALTER TABLE users ADD COLUMN automatic_country_source TEXT;
ALTER TABLE users ADD COLUMN automatic_country_at TEXT;
ALTER TABLE users ADD COLUMN automatic_language TEXT;
ALTER TABLE users ADD COLUMN automatic_language_source TEXT;
ALTER TABLE users ADD COLUMN automatic_language_at TEXT;
