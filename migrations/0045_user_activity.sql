-- Apply before deploying the activity endpoint and paginated administration.
-- Preserve login history; earlier browsing activity cannot be reconstructed.
ALTER TABLE users ADD COLUMN last_active_at TEXT;
UPDATE users SET last_active_at = last_login_at;
CREATE INDEX IF NOT EXISTS idx_users_registered_page ON users(created_at DESC, id DESC);
