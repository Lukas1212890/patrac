const ready=new WeakMap();
export async function upgradePublicLimits(db){
 if(ready.has(db))return ready.get(db);
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_creator_limits'").first())return;
 const pending=(async()=>{
 await db.prepare('CREATE TABLE IF NOT EXISTS patrac_limit_upgrades(id TEXT PRIMARY KEY,applied_at INTEGER NOT NULL)').run();
 if(await db.prepare("SELECT id FROM patrac_limit_upgrades WHERE id='public-10-v1'").first())return;
 const stamp=Date.now(),guard="NOT EXISTS(SELECT 1 FROM patrac_limit_upgrades WHERE id='public-10-v1')";
 const audit=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_admin_audit'").first();
 await db.batch([
 ...(audit?[db.prepare(`INSERT OR IGNORE INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at) SELECT 'public-10-v1:'||u.id,'system-public-limit-10',u.id,'limits',json_object('oldPrivateLimit',COALESCE(l.private_limit,3),'privateLimit',COALESCE(l.private_limit,3),'oldPublicLimit',COALESCE(l.public_limit,2),'publicLimit',10,'reason','Navýšení výchozího limitu na 10 veřejných výprav.'),'success',? FROM patrac_auth_user u LEFT JOIN patrac_creator_limits l ON l.user_id=u.id WHERE COALESCE(l.public_limit,2)<10 AND ${guard}`).bind(stamp)]:[]),
 db.prepare(`INSERT OR IGNORE INTO patrac_creator_limits(user_id,private_limit,public_limit,updated_at) SELECT id,3,10,? FROM patrac_auth_user WHERE ${guard}`).bind(stamp),
 db.prepare(`UPDATE patrac_creator_limits SET public_limit=10,version=version+1,updated_at=? WHERE public_limit<10 AND ${guard}`).bind(stamp),
 db.prepare("INSERT OR IGNORE INTO patrac_limit_upgrades(id,applied_at) VALUES('public-10-v1',?)").bind(stamp)
 ]);
 })().catch(e=>{ready.delete(db);throw e;});ready.set(db,pending);return pending;
}
