import {GameError} from './patrac-engine.mjs';
import {billingEnvironment} from './billing.mjs';
const initialized=new WeakMap();
export function moderationReady(db){if(!initialized.has(db))initialized.set(db,(async()=>{
 await db.prepare(`CREATE TABLE IF NOT EXISTS patrac_content_reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,code TEXT NOT NULL,environment TEXT NOT NULL,kind TEXT NOT NULL,review_key INTEGER,reason TEXT NOT NULL,description TEXT NOT NULL,snapshot TEXT NOT NULL,created_at INTEGER NOT NULL,resolved_at INTEGER,resolution TEXT,resolved_by TEXT)` ).run();
 await db.prepare('CREATE INDEX IF NOT EXISTS patrac_reports_user_time ON patrac_content_reports(user_id,created_at)').run();
 await db.prepare('CREATE INDEX IF NOT EXISTS patrac_reports_pending ON patrac_content_reports(resolved_at,created_at)').run();
})().catch(e=>{initialized.delete(db);throw e;}));return initialized.get(db);}
export async function reportContent({db,env,user,code,input,now=Date.now()}){
 if(!user)throw new GameError('Pro nahlášení se přihlaste.',401);
 if(!['expedition','review'].includes(input.kind)||!['danger','coordinates','access','abuse','spam','copyright','other'].includes(input.reason)||typeof input.description!=='string'||input.description.trim().length<10||input.description.trim().length>1500)throw new GameError('Vyberte důvod a popište problém (10 až 1500 znaků).');
 const game=await db.prepare("SELECT payload FROM patrac_expeditions WHERE code=? AND json_extract(payload,'$.visibility')='public'").bind(code).first();if(!game)throw new GameError('Výprava nebyla nalezena.',404);
 const environment=billingEnvironment(env);let snapshot={name:JSON.parse(game.payload).name};
 if(input.kind==='review'){
  if(!Number.isSafeInteger(input.reviewKey)||input.reviewKey<1)throw new GameError('Neplatný komentář.');
  const review=await db.prepare('SELECT r.comment,r.updated_at,q.content AS reply FROM patrac_public_reviews r LEFT JOIN patrac_review_replies q ON q.code=r.code AND q.review_user_id=r.user_id AND q.environment=r.environment WHERE r.rowid=? AND r.code=? AND r.environment=?').bind(input.reviewKey,code,environment).first();
  if(!review)throw new GameError('Komentář už není dostupný.',404);snapshot={...snapshot,...review};
 }
 await moderationReady(db);
 const result=await db.prepare(`INSERT INTO patrac_content_reports(id,user_id,code,environment,kind,review_key,reason,description,snapshot,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM patrac_content_reports WHERE user_id=? AND created_at>?)<10 AND NOT EXISTS(SELECT 1 FROM patrac_content_reports WHERE user_id=? AND code=? AND kind=? AND COALESCE(review_key,0)=? AND resolved_at IS NULL)`).bind(crypto.randomUUID(),user.id,code,environment,input.kind,input.kind==='review'?input.reviewKey:null,input.reason,input.description.trim(),JSON.stringify(snapshot),now,user.id,now-3600000,user.id,code,input.kind,input.kind==='review'?input.reviewKey:0).run();
 if(!result.meta.changes)throw new GameError('Problém už jste nahlásili, nebo jste dosáhli limitu 10 hlášení za hodinu.',429);
 return{ok:true,message:'Děkujeme. Hlášení bylo předáno správci k posouzení. Při nebezpečí ve hře nepokračujte.'};
}
export async function reportsList(db,{status='pending',environment='all',page=0}={}){
 await moderationReady(db);page=Number(page);
 if(!['pending','resolved','all'].includes(status)||!['test','live','all'].includes(environment)||!Number.isSafeInteger(page)||page<0||page>100000)throw new GameError('Neplatný filtr hlášení.');
 const filters=[],values=[];
 if(status!=='all')filters.push(status==='pending'?'r.resolved_at IS NULL':'r.resolved_at IS NOT NULL');
 if(environment!=='all'){filters.push('r.environment=?');values.push(environment);}
 const where=filters.length?'WHERE '+filters.join(' AND '):'';
 const count=await db.prepare(`SELECT COUNT(*) AS total FROM patrac_content_reports r ${where}`).bind(...values).first();
 const pending=await db.prepare('SELECT COUNT(*) AS total FROM patrac_content_reports WHERE resolved_at IS NULL').first();
 const r=await db.prepare(`SELECT r.*,u.name AS reporter,a.name AS resolvedBy,c.creator_id AS ownerId,json_extract(e.payload,'$.moderation.reason') AS suspensionReason FROM patrac_content_reports r LEFT JOIN patrac_auth_user u ON u.id=r.user_id LEFT JOIN patrac_auth_user a ON a.id=r.resolved_by LEFT JOIN patrac_creator_games c ON c.code=r.code LEFT JOIN patrac_expeditions e ON e.code=r.code ${where} ORDER BY ${status==='pending'?'r.created_at ASC':'COALESCE(r.resolved_at,r.created_at) DESC'},r.id ASC LIMIT 25 OFFSET ?`).bind(...values,page*25).all();
 return{reports:r.results.map(({snapshot,...r})=>({...r,snapshot:JSON.parse(snapshot)})),total:count.total,pending:pending.total,page,pageSize:25,hasMore:(page+1)*25<count.total};
}
export async function moderateExpedition({db,actor,user,input,now,ErrorType}){
 if(typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.trim().length>500||!Number.isSafeInteger(input.version))throw new ErrorType('Zadejte důvod (3 až 500 znaků).');
 const row=await db.prepare('SELECT e.* FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=? AND c.creator_id=?').bind(input.code,user.id).first();if(!row)throw new ErrorType('Výprava nebyla nalezena.',404);
 const game=JSON.parse(row.payload),suspend=input.action==='suspend-expedition';
 if(row.version!==input.version||!!game.moderation===suspend)throw new ErrorType('Výprava se změnila. Obnovte detail.',409);
 const id=crypto.randomUUID(),details={code:input.code,name:game.name,reason:input.reason.trim()};
 const payload=suspend?{...game,moderation:{reason:details.reason,at:now()}}:{...game};if(!suspend)delete payload.moderation;
 const result=await db.batch([
 db.prepare("INSERT INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at) SELECT ?,?,?,?,?, 'success',? WHERE EXISTS(SELECT 1 FROM patrac_expeditions WHERE code=? AND version=?)").bind(id,actor.id,user.id,input.action,JSON.stringify(details),now(),input.code,input.version),
 db.prepare('UPDATE patrac_expeditions SET payload=?,version=version+1 WHERE code=? AND version=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)').bind(JSON.stringify(payload),input.code,input.version,id)
 ]);if(!result[1].meta.changes)throw new ErrorType('Výprava se změnila. Obnovte detail.',409);
 return{ok:true,message:suspend?'Výprava je okamžitě pozastavena včetně hraní. Tvůrce dostane důvod v oznámeních.':'Pozastavení výpravy bylo zrušeno. Čas rozehraných pokusů se nezastavoval.'};
}
export async function resolveReport(db,input,now=Date.now(),actorId=null){
 await moderationReady(db);if(typeof input.id!=='string'||typeof input.resolution!=='string'||input.resolution.trim().length<3||input.resolution.length>500)throw new GameError('Zadejte způsob vyřízení (3 až 500 znaků).');
 const r=await db.prepare('UPDATE patrac_content_reports SET resolved_at=?,resolution=?,resolved_by=? WHERE id=? AND resolved_at IS NULL').bind(now,input.resolution.trim(),actorId,input.id).run();if(!r.meta.changes)throw new GameError('Hlášení už bylo vyřízeno.',409);return{ok:true,message:'Hlášení bylo vyřízeno.'};
}
export async function hideReportedComment({db,actor,input,now=Date.now()}){
 await moderationReady(db);
 if(typeof input.id!=='string'||typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.trim().length>500)throw new GameError('Zadejte důvod odstranění komentáře.');
 const report=await db.prepare("SELECT * FROM patrac_content_reports WHERE id=? AND kind='review' AND resolved_at IS NULL").bind(input.id).first();if(!report)throw new GameError('Hlášení už není dostupné.',409);
 const snapshot=JSON.parse(report.snapshot),review=await db.prepare('SELECT r.user_id,r.updated_at,r.comment,q.content AS reply FROM patrac_public_reviews r LEFT JOIN patrac_review_replies q ON q.code=r.code AND q.review_user_id=r.user_id AND q.environment=r.environment WHERE r.rowid=? AND r.code=? AND r.environment=?').bind(report.review_key,report.code,report.environment).first();
 if(!review||review.updated_at!==snapshot.updated_at||review.comment!==snapshot.comment||review.reply!==snapshot.reply)throw new GameError('Komentář nebo odpověď se změnily. Posuďte aktuální obsah; staré hlášení lze uzavřít.',409);
 const id=crypto.randomUUID(),reason=input.reason.trim();
 const results=await db.batch([
 db.prepare(`INSERT INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at) SELECT ?,?,?,'hide-comment',?,'success',? WHERE EXISTS(SELECT 1 FROM patrac_public_reviews r LEFT JOIN patrac_review_replies q ON q.code=r.code AND q.review_user_id=r.user_id AND q.environment=r.environment WHERE r.rowid=? AND r.updated_at=? AND r.comment=? AND q.content IS ?) AND EXISTS(SELECT 1 FROM patrac_content_reports WHERE id=? AND resolved_at IS NULL)`).bind(id,actor.id,review.user_id,JSON.stringify({code:report.code,name:snapshot.name,reason,environment:report.environment}),now,report.review_key,snapshot.updated_at,snapshot.comment,snapshot.reply,report.id),
 db.prepare("INSERT INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at) SELECT ?,?,c.creator_id,'hide-review-content',?,'success',? FROM patrac_creator_games c WHERE c.code=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)").bind(id+'-owner',actor.id,JSON.stringify({code:report.code,name:snapshot.name,reason,environment:report.environment}),now,report.code,id),
 db.prepare("UPDATE patrac_public_reviews SET comment='',updated_at=? WHERE rowid=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)").bind(now,report.review_key,id),
 db.prepare('DELETE FROM patrac_review_replies WHERE code=? AND review_user_id=? AND environment=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)').bind(report.code,review.user_id,report.environment,id),
 db.prepare('UPDATE patrac_content_reports SET resolved_at=?,resolution=?,resolved_by=? WHERE id=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)').bind(now,reason,actor.id,report.id,id)
 ]);if(!results[0].meta.changes)throw new GameError('Obsah se mezitím změnil. Obnovte hlášení.',409);
 return{ok:true,message:'Komentář a navázaná odpověď byly odstraněny, hvězdičky zůstaly. Autor hodnocení dostane důvod v oznámeních.'};
}
