import {subscriptionQuery} from './adminSubscriptions.mjs';
import {carryAdminAccess} from './adminAccessCarryover.mjs';
import {addMonths} from './billing.mjs';
export function revokeSegmentPlan(grants,reference,expiresAt,stamp){
 let previousEnd=0;
 const segments=[...grants].sort((a,b)=>a.accessUntil-b.accessUntil||a.grantedAt-b.grantedAt||a.reference.localeCompare(b.reference)).map(g=>{
  const startAt=g.startAt??Math.max(g.grantedAt,previousEnd);
  if(g.startAt==null&&addMonths(startAt,g.months)!==g.accessUntil)throw Error('Historie neumožňuje bezpečně oddělit toto přidělení od ostatních období.');
  previousEnd=Math.max(previousEnd,g.accessUntil);
  return {...g,startAt};
 });
 const target=segments.find(s=>s.source==='admin'&&s.reference===reference);
 if(!target||target.revokedAt)throw Error('Přidělení nebylo nalezeno nebo už bylo odebrané.');
 const removedMs=Math.max(0,target.accessUntil-Math.max(stamp,target.startAt));
 if(!removedMs)return {segments:segments.map(s=>s===target?{...s,revokedAt:stamp}:s),removedMs:0,expiresAt};
 if(previousEnd!==expiresAt)throw Error('Historie přístupu není úplná. Obnovte detail účtu.');
 const boundary=target.accessUntil;
 const updated=segments.map(s=>{
  if(s===target)return {...s,accessUntil:s.accessUntil-removedMs,revokedAt:stamp};
  if(s.startAt>=boundary)return {...s,startAt:s.startAt-removedMs,accessUntil:s.accessUntil-removedMs};
  return s;
 });
 return {segments:updated,removedMs,expiresAt:Math.max(stamp,expiresAt-removedMs)};
}
export async function previewAccessRevocation({db,userId,reference,environment,now,ErrorType}){
 if(typeof reference!=='string'||reference.length>160)throw new ErrorType('Neplatné přidělení.');
 const grant=await db.prepare("SELECT * FROM patrac_admin_audit WHERE id=? AND target_id=? AND action='access' AND status='success'").bind(reference,userId).first();
 if(!grant)throw new ErrorType('Lze odebrat pouze přístup přidělený správcem.',404);
 const data=JSON.parse(grant.details);
 if(data.revokedAt)throw new ErrorType('Toto přidělení už bylo odebrané.',409,'ADMIN_CONFLICT');
 if(!['test','live'].includes(environment)||!['test','live'].includes(data.environment)||(environment==='test'&&data.environment!=='test'))throw new ErrorType('Prostředí nesouhlasí. Obnovte detail.',409,'ADMIN_CONFLICT');
 await carryAdminAccess(db,userId);
 const environments=data.environment==='test'?['test','live']:['live'],plans=[];
 for(const mode of environments){
  const access=await db.prepare('SELECT * FROM patrac_access WHERE user_id=? AND environment=?').bind(userId,mode).first();
  if(!access)throw new ErrorType('Přidělení nemá odpovídající záznam přístupu.',409,'ADMIN_CONFLICT');
  const query=await subscriptionQuery(db,mode,now);
  const rows=await db.prepare(query.sql+'SELECT * FROM grants WHERE userId=?').bind(...query.bindings,userId).all();
  try{plans.push({environment:mode,version:access.version,oldExpiresAt:access.expires_at,...revokeSegmentPlan(rows.results,reference,access.expires_at,now)});}
  catch(e){throw new ErrorType(e.message,409,'ADMIN_CONFLICT');}
 }
 if(!plans.some(p=>p.removedMs>0))throw new ErrorType('Toto přidělené období už bylo vyčerpané. Není co odebrat.');
 return {reference,months:data.months,grantedAt:grant.created_at,plans};
}
export async function revokeAdminAccess({db,actor,user,input,environment,now,ErrorType}){
 if(input.environment!==environment)throw new ErrorType('Režim se změnil. Obnovte detail.',409,'ADMIN_CONFLICT');
 if(typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.trim().length>240||typeof input.requestKey!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(input.requestKey))throw new ErrorType('Vyplňte důvod odebrání a potvrďte změnu.');
 const id='access-revoke_'+input.requestKey,reason=input.reason.trim();
 const existing=await db.prepare('SELECT * FROM patrac_admin_audit WHERE id=?').bind(id).first();
 if(existing){const data=JSON.parse(existing.details);if(existing.actor_id!==actor.id||existing.target_id!==user.id||existing.action!=='access-revoke'||data.reference!==input.reference||data.reason!==reason||data.environment!==environment)throw new ErrorType('Identifikátor byl již použit.',409,'ADMIN_CONFLICT');return{ok:true,message:'Toto odebrání už bylo provedeno.'};}
 const stamp=now(),preview=await previewAccessRevocation({db,userId:user.id,reference:input.reference,environment,now:stamp,ErrorType});
 if(!input.versions||preview.plans.some(p=>input.versions[p.environment]!==p.version))throw new ErrorType('Přístup mezitím změnila platba nebo správce. Načtěte nový náhled odebrání.',409,'ADMIN_CONFLICT');
 const current=preview.plans.find(p=>p.environment===environment),details=JSON.stringify({reference:input.reference,reason,environment,months:preview.months,oldExpiresAt:current.oldExpiresAt,expiresAt:current.expiresAt,changes:preview.plans.map(({environment,oldExpiresAt,expiresAt,removedMs})=>({environment,oldExpiresAt,expiresAt,removedMs}))});
 const guards=preview.plans.map(()=>"EXISTS(SELECT 1 FROM patrac_access WHERE user_id=? AND environment=? AND version=?)").join(' AND ');
 const guardArgs=preview.plans.flatMap(p=>[user.id,p.environment,p.version]);
 const writes=[db.prepare(`INSERT INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at)
 SELECT ?,?,?,'access-revoke',?,'success',? WHERE ${guards}
 AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=? AND json_extract(details,'$.revokedAt') IS NULL)
 AND (SELECT COUNT(*) FROM patrac_admin_audit WHERE actor_id=? AND created_at>?)<30`).bind(id,actor.id,user.id,details,stamp,...guardArgs,input.reference,actor.id,stamp-60000),
 db.prepare("UPDATE patrac_admin_audit SET details=json_set(details,'$.revokedAt',?,'$.revocationId',?) WHERE id=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)").bind(stamp,id,input.reference,id)];
 for(const plan of preview.plans){
  writes.push(db.prepare('UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id=? AND environment=? AND version=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)').bind(plan.expiresAt,user.id,plan.environment,plan.version,id));
  for(const s of plan.segments)writes.push(db.prepare(`INSERT INTO patrac_access_segments(user_id,environment,source,reference,start_at,end_at,revoked_at)
   SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)
   ON CONFLICT(user_id,environment,source,reference) DO UPDATE SET start_at=excluded.start_at,end_at=excluded.end_at,revoked_at=excluded.revoked_at`).bind(user.id,plan.environment,s.source,s.reference,s.startAt,s.accessUntil,s.revokedAt??null,id));
 }
 const result=await db.batch(writes);
 if(!result[0].meta.changes)throw new ErrorType('Přístup se mezitím změnil nebo byla překročena četnost změn. Obnovte náhled.',409,'ADMIN_CONFLICT');
 return {ok:true,message:'Nevyčerpaná část přidělení byla odebrána. Ostatní období zůstala zachovaná.'};
}
