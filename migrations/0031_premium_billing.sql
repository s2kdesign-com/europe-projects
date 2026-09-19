-- Add billing around the existing users.role manual Premium grant.
-- No historical prices, amounts, customer IDs or credentials are seeded.
CREATE TABLE billing_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE subscription_plans (
  id TEXT PRIMARY KEY CHECK(id IN ('monthly','annual')),
  display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  billing_interval TEXT NOT NULL CHECK(billing_interval IN ('month','year')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  amount INTEGER, currency TEXT, stripe_price_id TEXT, stripe_product_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO subscription_plans(id,display_name,billing_interval,created_at,updated_at) VALUES
  ('monthly','Месечен','month',unixepoch()*1000,unixepoch()*1000),
  ('annual','Годишен','year',unixepoch()*1000,unixepoch()*1000);
CREATE TABLE stripe_prices (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  product_id TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL,
  billing_interval TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE INDEX idx_billing_prices_plan ON stripe_prices(plan_id,active);
CREATE TABLE billing_customers (
  stripe_customer_id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE billing_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id TEXT NOT NULL REFERENCES billing_customers(stripe_customer_id),
  stripe_price_id TEXT NOT NULL REFERENCES stripe_prices(id),
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL, billing_interval TEXT NOT NULL,
  started_at INTEGER NOT NULL, current_period_start INTEGER, current_period_end INTEGER,
  paid_through INTEGER NOT NULL DEFAULT 0, trial_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0, cancelled_at INTEGER,
  last_invoice_status TEXT, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_billing_subscription_user ON billing_subscriptions(user_id,status,current_period_end);
CREATE INDEX idx_billing_subscription_customer ON billing_subscriptions(stripe_customer_id);
CREATE INDEX idx_billing_subscription_status ON billing_subscriptions(status,started_at);
CREATE TABLE billing_payments (
  stripe_invoice_id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id TEXT NOT NULL, stripe_subscription_id TEXT NOT NULL,
  stripe_payment_intent_id TEXT, stripe_payment_id TEXT, stripe_price_id TEXT NOT NULL,
  plan_id TEXT NOT NULL, billing_interval TEXT NOT NULL,
  amount INTEGER NOT NULL, amount_paid INTEGER NOT NULL, currency TEXT NOT NULL,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_billing_payment_user ON billing_payments(user_id,created_at);
CREATE INDEX idx_billing_payment_customer ON billing_payments(stripe_customer_id);
CREATE INDEX idx_billing_payment_subscription ON billing_payments(stripe_subscription_id);
CREATE INDEX idx_billing_payment_intent ON billing_payments(stripe_payment_intent_id);
CREATE INDEX idx_billing_payment_status ON billing_payments(status,created_at);
CREATE TABLE stripe_webhook_events (
  id TEXT PRIMARY KEY, event_type TEXT NOT NULL, event_created INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', received_at INTEGER NOT NULL,
  processed_at INTEGER, error_code TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_billing_webhook_received ON stripe_webhook_events(received_at,status);
CREATE TABLE billing_locks (id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE billing_checkout_sessions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL, stripe_price_id TEXT NOT NULL, stripe_session_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE billing_audit (
  id TEXT PRIMARY KEY, admin_user_id TEXT, action TEXT NOT NULL, target_id TEXT NOT NULL,
  previous_json TEXT, next_json TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX idx_billing_audit_created ON billing_audit(created_at);
CREATE TABLE billing_rate_limits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, action TEXT NOT NULL,
  window_start INTEGER NOT NULL, attempts INTEGER NOT NULL, PRIMARY KEY(user_id,action)
);
CREATE TABLE daily_ai_reports (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL, timezone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  content TEXT, provider_key TEXT, model_id TEXT, execution_run_id TEXT, generated_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0, error_code TEXT,
  notified_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(user_id,report_date)
);
CREATE INDEX idx_daily_reports_user ON daily_ai_reports(user_id,report_date DESC);
CREATE INDEX idx_daily_reports_pending ON daily_ai_reports(status,next_attempt_at,lease_until);
ALTER TABLE user_preferences ADD COLUMN daily_report_notifications_enabled INTEGER NOT NULL DEFAULT 1;
-- Use the existing push queue without rebuilding its CHECK-constrained table.
-- Daily reports use type='change' plus a server-generated report_id discriminator.
ALTER TABLE push_notifications ADD COLUMN report_id TEXT REFERENCES daily_ai_reports(id) ON DELETE CASCADE;
