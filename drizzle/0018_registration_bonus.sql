CREATE TABLE IF NOT EXISTS patrac_registration_bonus (
 user_id TEXT PRIMARY KEY REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
 registered_at INTEGER NOT NULL,
 granted_at INTEGER,
 access_until INTEGER,
 operation TEXT
);
