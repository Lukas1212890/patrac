import {addMonths} from './billing.mjs';
// Replay only successful administrator gifts, never sandbox payments or rewards.
// The audit marker and live access revision commit together, making retries safe.
export async function carryAdminAccess(db,userId){
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_admin_audit'").first())return;
 const rows=await db.prepare("SELECT id,details,created_at FROM patrac_admin_audit WHERE target_id=? AND action='access' AND status='success' AND json_extract(details,'$.environment')='test' AND json_extract(details,'$.liveApplied') IS NULL ORDER BY created_at,id").bind(userId).all();
 for(const row of rows.results){
  const data=JSON.parse(row.details);if(![3,6,12].includes(data.months))continue;
  await db.prepare("INSERT OR IGNORE INTO patrac_access(user_id,environment) VALUES(?,'live')").bind(userId).run();
  let done=false;
  for(let i=0;i<8;i++){
   const current=await db.prepare("SELECT expires_at,version FROM patrac_access WHERE user_id=? AND environment='live'").bind(userId).first();
   const until=addMonths(Math.max(row.created_at,current.expires_at),data.months),operation=crypto.randomUUID();
   const result=await db.batch([
    db.prepare("UPDATE patrac_admin_audit SET details=json_set(details,'$.liveApplied',?,'$.liveExpiresAt',?) WHERE id=? AND json_extract(details,'$.liveApplied') IS NULL AND EXISTS(SELECT 1 FROM patrac_access WHERE user_id=? AND environment='live' AND version=?)").bind(operation,until,row.id,userId,current.version),
    db.prepare("UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id=? AND environment='live' AND version=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=? AND json_extract(details,'$.liveApplied')=?)").bind(until,userId,current.version,row.id,operation),
   ]);
   if(result[0].meta.changes||(await db.prepare("SELECT json_extract(details,'$.liveApplied') AS applied FROM patrac_admin_audit WHERE id=?").bind(row.id).first())?.applied){done=true;break;}
  }
  if(!done)throw Error('Administrator access transfer is pending');
 }
}
