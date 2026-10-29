CREATE TABLE IF NOT EXISTS patrac_moderation_notices(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,environment TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS patrac_moderation_inbox ON patrac_moderation_notices(user_id,environment,created_at DESC);
