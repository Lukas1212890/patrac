CREATE TABLE IF NOT EXISTS patrac_private_history(previous_team_id TEXT PRIMARY KEY,code TEXT NOT NULL REFERENCES patrac_expeditions(code) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,snapshot TEXT NOT NULL,finished_at INTEGER NOT NULL,total_ms INTEGER NOT NULL,replacement_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS patrac_private_history_user ON patrac_private_history(user_id,finished_at DESC);
CREATE INDEX IF NOT EXISTS patrac_private_history_code ON patrac_private_history(code);
