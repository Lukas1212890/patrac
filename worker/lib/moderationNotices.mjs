const initialized=new WeakMap();
export function moderationNoticesReady(db){
 if(!initialized.has(db))initialized.set(db,db.prepare(`CREATE TABLE IF NOT EXISTS patrac_moderation_notices(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,environment TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL
 )`).run().then(()=>db.prepare('CREATE INDEX IF NOT EXISTS patrac_moderation_inbox ON patrac_moderation_notices(user_id,environment,created_at DESC)').run()).catch(e=>{initialized.delete(db);throw e;}));
 return initialized.get(db);
}
// Capture recipients in the same transaction as the moderation action. Notices survive
// completion, account switching between test/live, and later deletion of the expedition.
export async function participantNoticeStatement(db,{auditId,code,type,stamp,details}){
 await moderationNoticesReady(db);
 const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('patrac_teams','patrac_public_attempts')").all();
 const available=new Set(tables.results.map(r=>r.name));if(!available.has('patrac_teams'))return null;
 const columns=await db.prepare('PRAGMA table_info(patrac_teams)').all();
 const publicReady=available.has('patrac_public_attempts'),privateReady=columns.results.some(c=>c.name==='user_id');
 const participants=[];
 if(publicReady)participants.push("SELECT t.*,a.user_id AS recipient,a.environment AS notice_environment FROM patrac_teams t JOIN patrac_public_attempts a ON a.team_id=t.id WHERE t.code=?");
 if(privateReady)participants.push("SELECT t.*,t.user_id AS recipient,'all' AS notice_environment FROM patrac_teams t WHERE t.code=? AND t.user_id IS NOT NULL"+(publicReady?' AND NOT EXISTS(SELECT 1 FROM patrac_public_attempts a WHERE a.team_id=t.id)':''));
 if(!participants.length)return null;
 return db.prepare(`INSERT OR IGNORE INTO patrac_moderation_notices(id,user_id,environment,type,payload,created_at)
 SELECT ?||':'||p.recipient||':'||p.notice_environment,p.recipient,p.notice_environment,?,?,?
 FROM (${participants.join(' UNION ALL ')}) p JOIN patrac_expeditions e ON e.code=p.code
 WHERE COALESCE(json_extract(p.payload,'$.startedAt'),json_extract(e.payload,'$.startedAt')) IS NOT NULL
 AND json_extract(p.payload,'$.finishedAt') IS NULL AND json_extract(p.payload,'$.abandonedAt') IS NULL
 AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)
 GROUP BY p.recipient,p.notice_environment`).bind(auditId,type,JSON.stringify(details),stamp,...participants.map(()=>code),auditId);
}
export async function reportResolutionNoticeStatement(db,{reportId,resolution,stamp,auditId=null}){
 await moderationNoticesReady(db);
 return db.prepare(`INSERT OR IGNORE INTO patrac_moderation_notices(id,user_id,environment,type,payload,created_at)
 SELECT 'report-resolved:'||id,user_id,environment,'report-resolved',json_set(snapshot,'$.code',code,'$.resolution',?),?
 FROM patrac_content_reports WHERE id=? AND resolved_at IS NULL
 ${auditId?'AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)':''}`).bind(resolution,stamp,reportId,...(auditId?[auditId]:[]));
}
