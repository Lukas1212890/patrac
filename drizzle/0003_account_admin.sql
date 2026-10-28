CREATE TABLE IF NOT EXISTS patrac_admin_accounts (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS patrac_admin_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS patrac_admin_audit_actor ON patrac_admin_audit(actor_id, created_at);
CREATE INDEX IF NOT EXISTS patrac_admin_audit_target ON patrac_admin_audit(target_id, created_at);
CREATE INDEX IF NOT EXISTS patrac_auth_user_created ON patrac_auth_user(createdAt, id);
