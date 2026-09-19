-- Additive: existing users keep all preferences and receive the 10:00 local default.
ALTER TABLE user_preferences ADD COLUMN daily_notification_hour INTEGER NOT NULL DEFAULT 10
  CHECK(typeof(daily_notification_hour) = 'integer' AND daily_notification_hour BETWEEN 0 AND 23);
