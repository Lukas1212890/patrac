CREATE TABLE IF NOT EXISTS patrac_access (
 user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
 environment TEXT NOT NULL CHECK(environment IN ('test','live')),
 expires_at INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,environment)
);
CREATE TABLE IF NOT EXISTS patrac_orders (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES patrac_auth_user(id),
 environment TEXT NOT NULL CHECK(environment IN ('test','live')),
 request_key TEXT NOT NULL,
 months INTEGER NOT NULL CHECK(months IN (3,6,12)),
 amount INTEGER NOT NULL,
 price_id TEXT NOT NULL,
 session_id TEXT UNIQUE,
 checkout_url TEXT,
 created_at INTEGER NOT NULL,
 paid_at INTEGER,
 access_until INTEGER,
 activation_id TEXT UNIQUE,
 UNIQUE(user_id,environment,request_key)
);
CREATE INDEX IF NOT EXISTS patrac_orders_user_created ON patrac_orders(user_id,created_at);
