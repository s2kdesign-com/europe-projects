-- Rebuild the existing push graph atomically: deferred foreign keys do not stop CASCADE.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE _v258_push_subscriptions AS SELECT * FROM push_subscriptions;
CREATE TABLE _v258_push_notifications AS SELECT * FROM push_notifications;
CREATE TABLE _v258_push_deliveries AS SELECT * FROM push_deliveries;
DROP TABLE push_deliveries;
DROP TABLE push_notifications;
DROP TABLE push_subscriptions;
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL UNIQUE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  vapid_fingerprint TEXT NOT NULL,
  expiration_time INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  scope TEXT NOT NULL DEFAULT 'authenticated' CHECK(scope IN ('authenticated','public_country')),
  country_code TEXT, anonymous_token_hash TEXT,
  CHECK((scope='authenticated' AND user_id IS NOT NULL AND session_id IS NOT NULL) OR
    (scope='public_country' AND user_id IS NULL AND session_id IS NULL AND country_code IS NOT NULL AND anonymous_token_hash IS NOT NULL))
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_session ON push_subscriptions(session_id);
CREATE TABLE push_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  saved_id TEXT REFERENCES saved_procedures(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('test','change','deadline','country')),
  dedupe_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  report_id TEXT REFERENCES daily_ai_reports(id) ON DELETE CASCADE,
  country_code TEXT,
  CHECK((type='country' AND user_id IS NULL AND country_code IS NOT NULL AND report_id IS NULL AND saved_id IS NULL) OR (type<>'country' AND user_id IS NOT NULL))
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

INSERT INTO push_subscriptions(id,user_id,session_id,endpoint_hash,endpoint,p256dh,auth,vapid_fingerprint,expiration_time,created_at,updated_at,last_used_at) SELECT * FROM _v258_push_subscriptions;
INSERT INTO push_notifications(id,user_id,saved_id,type,dedupe_key,payload,created_at,expires_at,report_id) SELECT * FROM _v258_push_notifications;
INSERT INTO push_deliveries SELECT * FROM _v258_push_deliveries;
DROP TABLE _v258_push_deliveries;
DROP TABLE _v258_push_notifications;
DROP TABLE _v258_push_subscriptions;
CREATE INDEX idx_push_public_country ON push_subscriptions(scope,country_code,id);
CREATE INDEX idx_push_anonymous_owner ON push_subscriptions(anonymous_token_hash);
ALTER TABLE push_deliveries ADD COLUMN public_summary_day TEXT;
CREATE UNIQUE INDEX idx_push_public_day ON push_deliveries(subscription_id,public_summary_day);
CREATE TABLE push_public_rate_limits(key TEXT PRIMARY KEY,window_start INTEGER NOT NULL,attempts INTEGER NOT NULL);
CREATE TABLE push_country_scans(day TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
CREATE TABLE push_country_batches(country_code TEXT NOT NULL,day TEXT NOT NULL,notification_id TEXT NOT NULL REFERENCES push_notifications(id) ON DELETE CASCADE,cursor TEXT NOT NULL DEFAULT '',complete INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(country_code,day));
ALTER TABLE user_preferences ADD COLUMN premium_notification_daily_limit INTEGER CHECK(premium_notification_daily_limit IN (1,3,10) OR premium_notification_daily_limit IS NULL);
CREATE TABLE push_notification_allowances(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,day TEXT NOT NULL,notification_id TEXT NOT NULL REFERENCES push_notifications(id) ON DELETE CASCADE,PRIMARY KEY(user_id,day,notification_id));
PRAGMA defer_foreign_keys=OFF;
