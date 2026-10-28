CREATE TABLE IF NOT EXISTS patrac_public_attempts (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL REFERENCES patrac_expeditions(code) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
 team_id TEXT NOT NULL UNIQUE REFERENCES patrac_teams(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 environment TEXT NOT NULL DEFAULT 'test' CHECK(environment IN ('test','live')),
 UNIQUE(code,user_id,environment)
);
CREATE INDEX IF NOT EXISTS patrac_public_attempts_user ON patrac_public_attempts(user_id,environment,created_at);
CREATE INDEX IF NOT EXISTS patrac_public_attempts_code ON patrac_public_attempts(code);
CREATE INDEX IF NOT EXISTS patrac_public_map ON patrac_expeditions(
 json_extract(payload,'$.visibility'),json_extract(payload,'$.published'),json_extract(payload,'$.status'),
 json_extract(payload,'$.stations[0].lat'),json_extract(payload,'$.stations[0].lng')
);
