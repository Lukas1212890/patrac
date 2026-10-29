// Derive notices from committed operations: retries never create duplicate messages.
// Only selected user-facing fields leave the API, never the admin's internal audit data.
/** @param {any} db @param {string} userId @param {'test'|'live'|null} [environment] */
export async function creatorNotices(db,userId,environment=null){
 const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('patrac_admin_audit','patrac_creator_rewards','patrac_review_notices')").all();
 const available=new Set(tables.results.map(r=>r.name)),notices=[];
 if(available.has('patrac_admin_audit')){
  const rows=await db.prepare(`SELECT id,action,details,created_at FROM patrac_admin_audit
   WHERE target_id=? AND status='success' AND action IN ('delete-expedition','access','access-revoke','limits')
   AND json_valid(details)
   AND (action<>'limits' OR json_extract(details,'$.oldPrivateLimit') IS NOT json_extract(details,'$.privateLimit') OR json_extract(details,'$.oldPublicLimit') IS NOT json_extract(details,'$.publicLimit'))
   AND (action<>'access' OR json_extract(details,'$.environment')=? OR (?='live' AND json_extract(details,'$.liveApplied') IS NOT NULL))
   AND (action<>'access-revoke' OR EXISTS(SELECT 1 FROM json_each(details,'$.changes') WHERE json_extract(value,'$.environment')=?))
   ORDER BY created_at DESC,id DESC LIMIT 50`).bind(userId,environment,environment,environment).all();
  for(const row of rows.results){
   const d=JSON.parse(row.details),base={id:row.id,type:row.action,createdAt:row.created_at};
   if(row.action==='delete-expedition')notices.push({...base,code:d.code,name:d.name,reason:d.reason});
   if(row.action==='access-revoke'){const change=d.changes.find(p=>p.environment===environment);notices.push({...base,months:d.months,reason:d.reason,expiresAt:change.expiresAt});}
   if(row.action==='access')notices.push({...base,months:d.months,expiresAt:environment==='live'?(d.liveExpiresAt??d.expiresAt):d.expiresAt});
   if(row.action==='limits'&&(d.oldPrivateLimit!==d.privateLimit||d.oldPublicLimit!==d.publicLimit))notices.push({...base,oldPrivateLimit:d.oldPrivateLimit,oldPublicLimit:d.oldPublicLimit,privateLimit:d.privateLimit,publicLimit:d.publicLimit});
  }
 }
 if(environment&&available.has('patrac_creator_rewards')){
  const rows=await db.prepare(`SELECT code,expedition_name,milestone,months,granted_at,access_until FROM patrac_creator_rewards
   WHERE user_id=? AND environment=? ORDER BY granted_at DESC,code,milestone DESC LIMIT 50`).bind(userId,environment).all();
  for(const r of rows.results)notices.push({id:'reward:'+environment+':'+r.code+':'+r.milestone,type:'reward',code:r.code,name:r.expedition_name,milestone:r.milestone,months:r.months,createdAt:r.granted_at,expiresAt:r.access_until});
 }
 if(environment&&available.has('patrac_review_notices')){
  const rows=await db.prepare('SELECT id,type,code,payload,created_at FROM patrac_review_notices WHERE recipient_id=? AND environment=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(userId,environment).all();
  for(const r of rows.results){const p=JSON.parse(r.payload);notices.push({id:'review-notice:'+r.id,type:r.type,code:r.code,createdAt:r.created_at,name:p.name,nickname:p.nickname,updated:!!p.updated,...(r.type==='review'?{stars:p.stars,comment:p.comment}:{reply:p.reply})});}
 }
 notices.sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
 return{notices:notices.slice(0,50)};
}
