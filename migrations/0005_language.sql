-- 0005: езикови настройки в профила (i18n).
-- Колоната language вече съществува (DEFAULT 'bg'); добавяме режим и дата на смяна.
-- Адитивно/идемпотентно; приложено към продукцията през Cloudflare connector.

ALTER TABLE user_preferences ADD COLUMN language_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE user_preferences ADD COLUMN language_updated_at TEXT;

-- Допустими стойности за language_mode: 'auto' | 'manual'.
-- language се валидира срещу SUPPORTED_LOCALES в приложението (не произволни стойности).
