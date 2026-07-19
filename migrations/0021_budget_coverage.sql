-- Migration 0021 — честно бюджетно покритие (v2.41.0). Приложена в prod 2026-07-19.
-- „Известен публикуван бюджет" (Known published budget) НЕ е бюджетът на всички
-- процедури — само на процедурите с ВАЛИДИРАН структуриран EUR бюджет. За честен
-- статус по държава добавяме два брояча в snapshot-а:
--   budget_text_procedures      — процедури с какъвто и да е бюджетен текст;
--   foreign_currency_procedures — бюджет в национална валута (zł/Ft/kr…), не EUR.
-- От тях countryBudgetStatus() различава: validated / foreign_currency /
-- no_budget_text / requires_review / awaiting_analysis (без подвеждащо „—").

ALTER TABLE country_daily_statistics ADD COLUMN budget_text_procedures INTEGER;
ALTER TABLE country_daily_statistics ADD COLUMN foreign_currency_procedures INTEGER;
