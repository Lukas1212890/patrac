CREATE TABLE IF NOT EXISTS patrac_notice_reads (
  user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
  notice_key TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, notice_key)
);
