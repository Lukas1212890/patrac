import {addMonths} from './billing.mjs';
const ready=new WeakMap();
export async function ensureRegistrationBonus(db){
 if(!ready.has(db))ready.set(db,db.prepare(`CREATE TABLE IF NOT EXISTS patrac_registration_bonus(user_id TEXT PRIMARY KEY REFERENCES patrac_auth_user(id) ON DELETE CASCADE,registered_at INTEGER NOT NULL,granted_at INTEGER,access_until INTEGER,operation TEXT)`).run().catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
}
export async function registerBonusEligibility(db,userId,mode,now=Date.now()){
 if(mode!=='test')return;
 await ensureRegistrationBonus(db);
 await db.prepare('INSERT OR IGNORE INTO patrac_registration_bonus(user_id,registered_at) VALUES(?,?)').bind(userId,now).run();
}
export async function grantRegistrationBonus(db,userId,now=Date.now()){
 await ensureRegistrationBonus(db);
 const eligible=await db.prepare('SELECT b.granted_at FROM patrac_registration_bonus b JOIN patrac_auth_user u ON u.id=b.user_id WHERE b.user_id=? AND u.emailVerified=1').bind(userId).first();
 if(!eligible||eligible.granted_at!==null)return false;
 await db.prepare("INSERT OR IGNORE INTO patrac_access(user_id,environment) VALUES(?,'test')").bind(userId).run();
 for(let i=0;i<8;i++){
  const current=await db.prepare("SELECT expires_at,version FROM patrac_access WHERE user_id=? AND environment='test'").bind(userId).first();
  const until=addMonths(Math.max(now,current.expires_at),3),operation=crypto.randomUUID();
  const result=await db.batch([
   db.prepare("UPDATE patrac_registration_bonus SET granted_at=?,access_until=?,operation=? WHERE user_id=? AND granted_at IS NULL AND EXISTS(SELECT 1 FROM patrac_access WHERE user_id=? AND environment='test' AND version=?)").bind(now,until,operation,userId,userId,current.version),
   db.prepare("UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id=? AND environment='test' AND version=? AND EXISTS(SELECT 1 FROM patrac_registration_bonus WHERE user_id=? AND operation=?)").bind(until,userId,current.version,userId,operation)
  ]);
  if(result[0].meta.changes)return true;
  if((await db.prepare('SELECT granted_at FROM patrac_registration_bonus WHERE user_id=?').bind(userId).first())?.granted_at!==null)return false;
 }
 throw Error('Přidělení registračního bonusu se nepodařilo dokončit. Zkuste se přihlásit znovu.');
}
