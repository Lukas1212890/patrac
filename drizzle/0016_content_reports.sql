CREATE TABLE IF NOT EXISTS patrac_content_reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,code TEXT NOT NULL,environment TEXT NOT NULL,kind TEXT NOT NULL,review_key INTEGER,reason TEXT NOT NULL,description TEXT NOT NULL,snapshot TEXT NOT NULL,created_at INTEGER NOT NULL,resolved_at INTEGER,resolution TEXT,resolved_by TEXT);
CREATE INDEX IF NOT EXISTS patrac_reports_user_time ON patrac_content_reports(user_id,created_at);
CREATE INDEX IF NOT EXISTS patrac_reports_pending ON patrac_content_reports(resolved_at,created_at);
