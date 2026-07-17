-- Migration 0009 — additive country + source attribution columns.
-- country_code gets DEFAULT 'BG' NOT NULL so ALL existing projects/documents are
-- backfilled to Bulgaria automatically (no separate UPDATE needed). Other columns
-- are nullable. Unique index on (country_code, source_id, source_procedure_id) is
-- created as a partial index so existing rows (source_procedure_id NULL) don't clash.

-- projects
ALTER TABLE projects ADD COLUMN country_code TEXT NOT NULL DEFAULT 'BG';
ALTER TABLE projects ADD COLUMN source_id TEXT;
ALTER TABLE projects ADD COLUMN source_procedure_id TEXT;
ALTER TABLE projects ADD COLUMN source_programme_id TEXT;
ALTER TABLE projects ADD COLUMN original_language TEXT;
ALTER TABLE projects ADD COLUMN official_url TEXT;
ALTER TABLE projects ADD COLUMN managing_authority TEXT;
ALTER TABLE projects ADD COLUMN regions_json TEXT;
ALTER TABLE projects ADD COLUMN source_published_at TEXT;
ALTER TABLE projects ADD COLUMN source_updated_at TEXT;
ALTER TABLE projects ADD COLUMN first_seen_at TEXT;
ALTER TABLE projects ADD COLUMN last_seen_at TEXT;
ALTER TABLE projects ADD COLUMN last_verified_at TEXT;
ALTER TABLE projects ADD COLUMN content_hash TEXT;
ALTER TABLE projects ADD COLUMN source_status TEXT;
ALTER TABLE projects ADD COLUMN ingestion_status TEXT;
ALTER TABLE projects ADD COLUMN ai_analysis_status TEXT;
ALTER TABLE projects ADD COLUMN translation_status TEXT;
ALTER TABLE projects ADD COLUMN data_quality_score REAL;
ALTER TABLE projects ADD COLUMN data_quality_flags_json TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_cc_status   ON projects (country_code, status);
CREATE INDEX IF NOT EXISTS idx_projects_cc_deadline ON projects (country_code, deadline_date);
CREATE INDEX IF NOT EXISTS idx_projects_cc_program  ON projects (country_code, program);
CREATE INDEX IF NOT EXISTS idx_projects_cc_category ON projects (country_code, category);
CREATE INDEX IF NOT EXISTS idx_projects_cc_updated  ON projects (country_code, last_updated);
CREATE INDEX IF NOT EXISTS idx_projects_cc_hash     ON projects (country_code, content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_source
  ON projects (country_code, source_id, source_procedure_id)
  WHERE source_id IS NOT NULL AND source_procedure_id IS NOT NULL;

-- documents inherit country + source attribution through the procedure
ALTER TABLE documents ADD COLUMN country_code TEXT NOT NULL DEFAULT 'BG';
ALTER TABLE documents ADD COLUMN source_id TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_cc ON documents (country_code);

-- profile country preference (separate from language)
ALTER TABLE user_profiles ADD COLUMN preferred_country TEXT;
ALTER TABLE user_profiles ADD COLUMN country_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE user_profiles ADD COLUMN country_detection_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_profiles ADD COLUMN country_updated_at TEXT;
