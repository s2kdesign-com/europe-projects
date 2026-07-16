-- Migration 0001 — additive performance indexes.
-- Safe to run against a database that already contains the base schema
-- (projects, documents, snapshots). Creates nothing that changes existing
-- data or column definitions. NEVER apply to the remote production D1 here —
-- these are for local `wrangler dev --local` / miniflare only.

-- Filtering / sorting on the projects list happens by status, deadline and program.
CREATE INDEX IF NOT EXISTS idx_projects_status        ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_deadline_date ON projects (deadline_date);
CREATE INDEX IF NOT EXISTS idx_projects_program       ON projects (program);
CREATE INDEX IF NOT EXISTS idx_projects_category      ON projects (category);
CREATE INDEX IF NOT EXISTS idx_projects_is_new        ON projects (is_new);

-- Documents are always looked up by their parent project.
CREATE INDEX IF NOT EXISTS idx_documents_project_id   ON documents (project_id);

-- Snapshots are read newest-first.
CREATE INDEX IF NOT EXISTS idx_snapshots_run_date     ON snapshots (run_date);
