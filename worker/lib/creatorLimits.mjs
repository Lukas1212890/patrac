export async function limitsReady(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_creator_limits'").first();}
export function limitSQL(visibility='private'){
 const column=visibility==='public'?'public_limit':'private_limit',fallback=visibility==='public'?2:3;
 return `COALESCE((SELECT ${column} FROM patrac_creator_limits WHERE user_id=?),${fallback})`;
}
export async function creatorLimits(db,userId){
 if(!await limitsReady(db))return{ready:false,private:3,public:2,version:0};
 const row=await db.prepare('SELECT private_limit,public_limit,version FROM patrac_creator_limits WHERE user_id=?').bind(userId).first();
 return{ready:true,private:row?.private_limit??3,public:row?.public_limit??2,version:row?.version??0};
}
export async function changeCreatorLimits({db,actor,user,input,now,ErrorType}){
 if(!await limitsReady(db))throw new ErrorType('Individuální limity čekají na aktivaci databáze.',503);
 if(![input.privateLimit,input.publicLimit].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=1000)||!Number.isSafeInteger(input.version)||input.version<0)throw new ErrorType('Limity musí být celá čísla od 0 do 1000.');
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(reason.length<3||reason.length>240)throw new ErrorType('Zadejte důvod změny (3 až 240 znaků).');
 if(typeof input.requestKey!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(input.requestKey))throw new ErrorType('Neplatný požadavek na změnu limitů.');
 const id='limits_'+input.requestKey;
 async function repeated(){const row=await db.prepare('SELECT * FROM patrac_admin_audit WHERE id=?').bind(id).first();if(!row)return null;const data=JSON.parse(row.details);if(row.actor_id!==actor.id||row.target_id!==user.id||row.action!=='limits'||row.status!=='success'||data.privateLimit!==input.privateLimit||data.publicLimit!==input.publicLimit||data.reason!==reason)throw new ErrorType('Identifikátor změny byl již použit.',409,'ADMIN_CONFLICT');return{ok:true,message:'Tyto limity už byly uloženy.'};}
 const old=await repeated();if(old)return old;
 await db.prepare('INSERT OR IGNORE INTO patrac_creator_limits(user_id,updated_at) VALUES(?,?)').bind(user.id,now()).run();
 const current=await creatorLimits(db,user.id);if(current.version!==input.version)throw new ErrorType('Limity mezitím změnil jiný správce. Obnovte detail účtu.',409,'ADMIN_CONFLICT');
 const stamp=now(),details=JSON.stringify({oldPrivateLimit:current.private,oldPublicLimit:current.public,privateLimit:input.privateLimit,publicLimit:input.publicLimit,reason,operation:crypto.randomUUID()});
 const result=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at)
   SELECT ?,?,?,'limits',?,'success',? WHERE EXISTS(SELECT 1 FROM patrac_creator_limits WHERE user_id=? AND version=?)
   AND (SELECT COUNT(*) FROM patrac_admin_audit WHERE actor_id=? AND created_at>?)<30`).bind(id,actor.id,user.id,details,stamp,user.id,input.version,actor.id,stamp-60000),
  db.prepare(`UPDATE patrac_creator_limits SET private_limit=?,public_limit=?,version=version+1,updated_at=? WHERE user_id=? AND version=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=? AND details=?)`).bind(input.privateLimit,input.publicLimit,stamp,user.id,input.version,id,details),
 ]);
 if(!result[0].meta.changes){const duplicate=await repeated();if(duplicate)return duplicate;throw new ErrorType('Limity nelze uložit. Obnovte detail nebo chvíli počkejte.',409,'ADMIN_CONFLICT');}
 return{ok:true,message:'Limity byly uloženy: '+input.privateLimit+' soukromých a '+input.publicLimit+' veřejných výprav. Stávající výpravy zůstávají zachované.'};
}
