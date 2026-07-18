-- Migration 0017 — България приема еврото (v2.30.5). BGN → EUR навсякъде.
-- Приложена в prod през connector на 2026-07-18.
-- Историческите суми в лева вече са конвертирани в budget_amount_eur по фиксирания
-- курс 1.95583; тук само уеднаквяваме валутните кодове/етикети към EUR.

UPDATE countries SET currency_code = 'EUR', updated_at = datetime('now')
  WHERE code = 'BG' AND currency_code = 'BGN';

UPDATE user_profiles SET financial_currency_code = 'EUR'
  WHERE financial_currency_code = 'BGN';

UPDATE projects SET budget_currency = 'EUR'
  WHERE budget_currency = 'BGN';
