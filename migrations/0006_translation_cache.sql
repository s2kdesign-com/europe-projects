-- 0006: кеш за преводи (Google Cloud Translation). Един и същ текст не се превежда
-- повторно. Не се трие при deploy. При промяна на оригинала source_hash се сменя и
-- се генерира нов ред (старият остава, но не се ползва).

CREATE TABLE IF NOT EXISTS translation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  field_name TEXT,
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  glossary_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_key ON translation_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_tc_target ON translation_cache (target_language);
CREATE INDEX IF NOT EXISTS idx_tc_entity ON translation_cache (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_tc_source_hash ON translation_cache (source_hash);
