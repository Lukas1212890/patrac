import {GameError} from './patrac-engine.mjs';
import {DELETION_DELAY_MS} from './expeditionLifecycle.mjs';
export const ACCOUNT_DELETION_SCHEMA=`CREATE TABLE IF NOT EXISTS patrac_deleted_accounts(user_id TEXT PRIMARY KEY,deleted_at INTEGER NOT NULL,billing_email TEXT)`;
export async function deletionReady(db){await db.prepare(ACCOUNT_DELETION_SCHEMA).run();}
export async function deletedAccount(db,id){await deletionReady(db);return db.prepare('SELECT * FROM patrac_deleted_accounts WHERE user_id=?').bind(id).first();}
export async function deleteOwnAccount({db,user,input,verifyPassword,now=Date.now()}){
 if(input?.confirmation!=='SMAZAT ÚČET'||input?.acknowledge!==true)throw new GameError('Potvrďte důsledky a opište SMAZAT ÚČET.');
 if(typeof input.password!=='string'||!input.password||input.password.length>128)throw new GameError('Zadejte své současné heslo.',401);
 const key='delete-account:'+user.id;
 await db.prepare('INSERT INTO patrac_auth_rate_limit(id,key,count,lastRequest) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN lastRequest<? THEN 1 ELSE count+1 END,lastRequest=CASE WHEN lastRequest<? THEN excluded.lastRequest ELSE lastRequest END').bind(key,key,now,now-300000,now-300000).run();
 if((await db.prepare('SELECT count FROM patrac_auth_rate_limit WHERE key=?').bind(key).first()).count>5)throw new GameError('Příliš mnoho pokusů. Smazání účtu zkuste za pět minut.',429);
 try{await verifyPassword(input.password);}catch{throw new GameError('Heslo nesouhlasí. Účet nebyl smazán.',401);}
 await deletionReady(db);
 const tables=new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(r=>r.name));
 const statements=[],add=(table,sql,...args)=>{if(tables.has(table))statements.push(db.prepare(sql).bind(...args));};
 // All changes commit together. A tombstone has no credentials, sessions, nickname or real email.
 // Its opaque ID keeps payment evidence and the 72-hour expedition cleanup referentially valid.
 statements.push(db.prepare('INSERT OR IGNORE INTO patrac_deleted_accounts(user_id,deleted_at,billing_email) SELECT id,?,CASE WHEN EXISTS(SELECT 1 FROM patrac_orders WHERE user_id=?) THEN email ELSE NULL END FROM patrac_auth_user WHERE id=?').bind(now,user.id,user.id));
 statements.push(db.prepare("UPDATE patrac_auth_user SET name=?,email=?,emailVerified=0,image=NULL,nicknameKey=NULL,updatedAt=? WHERE id=?").bind('Smazaný účet '+crypto.randomUUID().slice(0,12),'deleted-'+crypto.randomUUID()+'@account.invalid',now,user.id));
 add('patrac_expeditions',`UPDATE patrac_expeditions SET payload=json_set(payload,'$.deleteAt',CASE WHEN json_extract(payload,'$.deleteAt') IS NULL THEN ? ELSE min(json_extract(payload,'$.deleteAt'),?) END),owner_hash=?,version=version+1 WHERE code IN(SELECT code FROM patrac_creator_games WHERE creator_id=?)`,now+DELETION_DELAY_MS,now+DELETION_DELAY_MS,crypto.randomUUID(),user.id);
 add('patrac_review_replies','DELETE FROM patrac_review_replies WHERE code IN(SELECT code FROM patrac_creator_games WHERE creator_id=?)',user.id);
 for(const table of ['patrac_public_reviews','patrac_public_attempts','patrac_private_history','patrac_teams','patrac_access','patrac_access_segments','patrac_creator_rewards','patrac_creator_limits','patrac_registration_bonus','patrac_notice_reads','patrac_moderation_notices','patrac_admin_push','patrac_admin_accounts'])add(table,`DELETE FROM ${table} WHERE user_id=?`,user.id);
 add('patrac_review_notices',"DELETE FROM patrac_review_notices WHERE recipient_id=? OR json_extract(payload,'$.nickname')=?",user.id,user.nickname);
 add('patrac_content_reports','DELETE FROM patrac_content_reports WHERE user_id=?',user.id);
 add('patrac_admin_password_attempts','DELETE FROM patrac_admin_password_attempts WHERE actor_id=?',user.id);
 add('patrac_admin_audit',"UPDATE patrac_admin_audit SET details='{}' WHERE target_id=?",user.id);
 add('patrac_legal_acceptance',"DELETE FROM patrac_legal_acceptance WHERE user_id=? AND (kind<>'purchase-immediate' OR reference NOT IN(SELECT id FROM patrac_orders WHERE user_id=?))",user.id,user.id);
 add('patrac_auth_verification','DELETE FROM patrac_auth_verification WHERE value=? OR identifier=? OR instr(value,?)>0',user.id,user.email,JSON.stringify(user.email));
 add('patrac_auth_session','DELETE FROM patrac_auth_session WHERE userId=?',user.id);
 add('patrac_auth_account','DELETE FROM patrac_auth_account WHERE userId=?',user.id);
 // Leave a redacted registration event so background capture cannot recreate it.
 add('patrac_push_events',"UPDATE patrac_push_events SET payload=json_object('title','Odstraněný účet','body','Účet byl smazán.','tag',id,'url','/admin') WHERE id=? OR id IN(SELECT 'payment:'||id FROM patrac_orders WHERE user_id=?)",'registration:'+user.id,user.id);
 statements.push(db.prepare('DELETE FROM patrac_auth_user WHERE id=? AND NOT EXISTS(SELECT 1 FROM patrac_creator_games WHERE creator_id=?) AND NOT EXISTS(SELECT 1 FROM patrac_orders WHERE user_id=?)').bind(user.id,user.id,user.id));
 await db.batch(statements);
 return {ok:true,deleted:true};
}

export async function sweepDeletedAccounts(db){
 await deletionReady(db);
 await db.prepare('DELETE FROM patrac_auth_user WHERE id IN(SELECT user_id FROM patrac_deleted_accounts) AND NOT EXISTS(SELECT 1 FROM patrac_creator_games WHERE creator_id=patrac_auth_user.id) AND NOT EXISTS(SELECT 1 FROM patrac_orders WHERE user_id=patrac_auth_user.id)').run();
}
