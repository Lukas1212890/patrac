CREATE TABLE IF NOT EXISTS patrac_public_reviews (
 code TEXT NOT NULL REFERENCES patrac_expeditions(code) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
 environment TEXT NOT NULL CHECK(environment IN ('test','live')),
 stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
 comment TEXT NOT NULL DEFAULT '' CHECK(length(comment)<=1000),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(code,user_id,environment)
);
CREATE INDEX IF NOT EXISTS patrac_public_reviews_recent
 ON patrac_public_reviews(code,environment,created_at DESC,user_id);
