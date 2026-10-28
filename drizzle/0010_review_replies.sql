-- Pátrač: one creator response per review and durable account notifications.
CREATE TABLE IF NOT EXISTS patrac_review_replies (
 code TEXT NOT NULL,
 review_user_id TEXT NOT NULL,
 environment TEXT NOT NULL CHECK(environment IN ('test','live')),
 content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 1000),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(code,review_user_id,environment),
 FOREIGN KEY(code,review_user_id,environment) REFERENCES patrac_public_reviews(code,user_id,environment) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS patrac_review_notices (
 id TEXT PRIMARY KEY,
 recipient_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
 environment TEXT NOT NULL CHECK(environment IN ('test','live')),
 type TEXT NOT NULL CHECK(type IN ('review','review-reply')),
 code TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS patrac_review_notices_inbox ON patrac_review_notices(recipient_id,environment,created_at DESC);

CREATE TRIGGER IF NOT EXISTS patrac_review_insert_notice
AFTER INSERT ON patrac_public_reviews
BEGIN
 INSERT INTO patrac_review_notices(id,recipient_id,environment,type,code,payload,created_at)
 SELECT lower(hex(randomblob(16))),c.creator_id,NEW.environment,'review',NEW.code,
 json_object('name',json_extract(e.payload,'$.name'),'updated',0,'nickname',(SELECT name FROM patrac_auth_user WHERE id=NEW.user_id),'stars',NEW.stars,'comment',NEW.comment),NEW.updated_at
 FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=NEW.code;
END;

CREATE TRIGGER IF NOT EXISTS patrac_review_update_notice
AFTER UPDATE ON patrac_public_reviews
WHEN OLD.stars IS NOT NEW.stars OR OLD.comment IS NOT NEW.comment
BEGIN
 INSERT INTO patrac_review_notices(id,recipient_id,environment,type,code,payload,created_at)
 SELECT lower(hex(randomblob(16))),c.creator_id,NEW.environment,'review',NEW.code,
 json_object('name',json_extract(e.payload,'$.name'),'updated',1,'nickname',(SELECT name FROM patrac_auth_user WHERE id=NEW.user_id),'stars',NEW.stars,'comment',NEW.comment),NEW.updated_at
 FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=NEW.code;
END;

CREATE TRIGGER IF NOT EXISTS patrac_review_reply_insert_notice
AFTER INSERT ON patrac_review_replies
BEGIN
 INSERT INTO patrac_review_notices(id,recipient_id,environment,type,code,payload,created_at)
 SELECT lower(hex(randomblob(16))),NEW.review_user_id,NEW.environment,'review-reply',NEW.code,
 json_object('name',json_extract(e.payload,'$.name'),'updated',0,'reply',NEW.content,'nickname',(SELECT name FROM patrac_auth_user WHERE id=c.creator_id)),NEW.updated_at
 FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=NEW.code;
END;

CREATE TRIGGER IF NOT EXISTS patrac_review_reply_update_notice
AFTER UPDATE ON patrac_review_replies
WHEN OLD.content IS NOT NEW.content
BEGIN
 INSERT INTO patrac_review_notices(id,recipient_id,environment,type,code,payload,created_at)
 SELECT lower(hex(randomblob(16))),NEW.review_user_id,NEW.environment,'review-reply',NEW.code,
 json_object('name',json_extract(e.payload,'$.name'),'updated',1,'reply',NEW.content,'nickname',(SELECT name FROM patrac_auth_user WHERE id=c.creator_id)),NEW.updated_at
 FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=NEW.code;
END;
