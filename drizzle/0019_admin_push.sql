CREATE TABLE IF NOT EXISTS patrac_push_config(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_key TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patrac_admin_push(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patrac_push_events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patrac_push_deliveries(event_id TEXT NOT NULL REFERENCES patrac_push_events(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES patrac_admin_push(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,done_at INTEGER,claim TEXT,PRIMARY KEY(event_id,subscription_id));
CREATE INDEX IF NOT EXISTS patrac_push_due ON patrac_push_deliveries(done_at,next_at);
