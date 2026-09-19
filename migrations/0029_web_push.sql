-- Push is opt-in per browser. Existing notification preferences remain authoritative.
ALTER TABLE user_preferences ADD COLUMN notification_prompt_last_shown_at INTEGER;

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  vapid_fingerprint TEXT NOT NULL,
  expiration_time INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_session ON push_subscriptions(session_id);
CREATE TABLE push_expired_endpoints (endpoint_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);

CREATE TABLE push_saved_state (
  saved_id TEXT PRIMARY KEY REFERENCES saved_procedures(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  observed_at INTEGER NOT NULL
);

CREATE TABLE push_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_id TEXT REFERENCES saved_procedures(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('test','change','deadline')),
  dedupe_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_push_notifications_expiry ON push_notifications(expires_at);

CREATE TABLE push_deliveries (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES push_notifications(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  receipt_hash TEXT,
  accepted_at INTEGER,
  displayed_at INTEGER,
  clicked_at INTEGER,
  error_code TEXT,
  UNIQUE(notification_id,subscription_id)
);
CREATE INDEX idx_push_pending ON push_deliveries(state,next_attempt_at,lease_until);

CREATE TABLE push_rate_limits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY(user_id,action)
);
CREATE TABLE push_dispatch_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  cursor TEXT NOT NULL DEFAULT '',
  lock_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO push_dispatch_state(id) VALUES(1);
