-- This first statement fails before changing columns if old nicknames collide.
CREATE UNIQUE INDEX IF NOT EXISTS patrac_nickname_legacy_unique ON patrac_auth_user(lower(trim(name)));
ALTER TABLE patrac_auth_user ADD COLUMN nicknameKey TEXT;
UPDATE patrac_auth_user SET nicknameKey=lower(trim(name));
CREATE UNIQUE INDEX patrac_nickname_unique ON patrac_auth_user(nicknameKey);
ALTER TABLE patrac_teams ADD COLUMN user_id TEXT REFERENCES patrac_auth_user(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX patrac_private_player_unique ON patrac_teams(code,user_id);
CREATE INDEX patrac_private_player_history ON patrac_teams(user_id);
