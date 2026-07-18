-- Migration 0011 — country attribution за запазените процедури.
-- Additive: запазените пазят държавата си (виж спецификация р.25). Backfill BG.

ALTER TABLE saved_procedures ADD COLUMN country_code TEXT NOT NULL DEFAULT 'BG';
CREATE INDEX IF NOT EXISTS idx_saved_country ON saved_procedures (user_id, country_code);

-- Изравняване с реалната държава на процедурата (ако е налична).
UPDATE saved_procedures
   SET country_code = COALESCE((SELECT p.country_code FROM projects p WHERE p.id = saved_procedures.procedure_id), 'BG');
