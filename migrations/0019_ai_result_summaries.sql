-- Migration 0019 — детерминистични резултати за AI изпълненията (v2.32.0).
-- Приложена в prod през connector 2026-07-18.
-- Причина: pipeline_job generation редовете нямаха човешко резюме → колоната
-- „Резултат" показваше „—". Тук добавяме result_summary (детерминистично от реални
-- метрики, НЕ свободен текст от модела) + safe result_details_json за разгъване.

ALTER TABLE ai_execution_runs ADD COLUMN result_summary TEXT;
ALTER TABLE ai_execution_runs ADD COLUMN result_details_json TEXT;    -- safe, ограничен размер
ALTER TABLE ai_execution_runs ADD COLUMN result_entity_count INTEGER;
ALTER TABLE ai_execution_runs ADD COLUMN result_change_count INTEGER;
ALTER TABLE ai_execution_runs ADD COLUMN result_warning_count INTEGER;
ALTER TABLE ai_execution_runs ADD COLUMN result_requires_review_count INTEGER;
ALTER TABLE ai_execution_runs ADD COLUMN job_id TEXT;

ALTER TABLE ai_jobs ADD COLUMN test_run INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_pipeline_runs ADD COLUMN test_run INTEGER NOT NULL DEFAULT 0;
