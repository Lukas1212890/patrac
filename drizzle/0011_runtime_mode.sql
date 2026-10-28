CREATE TABLE IF NOT EXISTS patrac_runtime_mode (
 id INTEGER PRIMARY KEY CHECK(id=1),
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 version INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL,
 updated_by TEXT
);
INSERT OR IGNORE INTO patrac_runtime_mode(id,mode,updated_at) VALUES(1,'test',CAST(strftime('%s','now') AS INTEGER)*1000);
