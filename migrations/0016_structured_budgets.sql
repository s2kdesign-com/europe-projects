-- Migration 0016 — структурирани бюджети на процедурите (v2.29.0). Приложена в
-- prod през connector на 2026-07-18.
-- Правила: budget_amount_eur = ОБЩИЯТ публикуван бюджет, само при изрична сума в
-- EUR или BGN (фиксиран курс 1.95583). Плаващи валути (PLN/HUF/CZK/SEK/DKK/...) →
-- NULL + budget_currency. Никакво конвертиране по плаващ курс, никакво измисляне.
-- Backfill: 105/169 процедури с EUR сума (~€5.01 млрд) чрез консервативен parser;
-- занапред ги пълни Scheduled Task-ът (на всеки 5 часа).

ALTER TABLE projects ADD COLUMN budget_amount_eur REAL;
ALTER TABLE projects ADD COLUMN budget_currency TEXT;
