-- Migration 0020 — apply/recompute няма нови таблици; ползва 0016/0019 колони.
-- Само отбелязваме, че AI executor-ите вече прилагат резултата (budget → projects)
-- и добавяме admin recompute/diagnostics endpoints (worker/ai/pipeline*.js).
-- Няма DDL — файлът документира версия 2.33.0. (No-op миграция за проследяване.)
SELECT 1;
