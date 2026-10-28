CREATE TABLE IF NOT EXISTS patrac_creator_rewards (
 code TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
 environment TEXT NOT NULL CHECK(environment IN ('test','live')),
 milestone INTEGER NOT NULL CHECK(milestone>0 AND milestone%100=0),
 expedition_name TEXT NOT NULL,
 months INTEGER NOT NULL DEFAULT 2 CHECK(months=2),
 granted_at INTEGER NOT NULL,
 access_until INTEGER NOT NULL,
 activation_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(code,environment,milestone)
);
CREATE INDEX IF NOT EXISTS patrac_creator_rewards_user
 ON patrac_creator_rewards(user_id,environment,granted_at DESC);
