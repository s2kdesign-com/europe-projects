-- Additive, isolated publishing history. No changes to procedure records.
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY, run_date TEXT NOT NULL UNIQUE, run_at TEXT NOT NULL,
  country TEXT NOT NULL, language TEXT NOT NULL, topic TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('image','link')),
  primary_link TEXT, image_key TEXT, scene INTEGER,
  changes_json TEXT, linkedin_status TEXT, linkedin_url TEXT,
  linkedin_text TEXT, linkedin_error TEXT, facebook_status TEXT,
  facebook_url TEXT, facebook_text TEXT, facebook_error TEXT, notes TEXT
);
CREATE INDEX IF NOT EXISTS social_posts_country ON social_posts(country,run_at);
CREATE TABLE IF NOT EXISTS social_publish_lock (
  id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires_at TEXT NOT NULL
);
