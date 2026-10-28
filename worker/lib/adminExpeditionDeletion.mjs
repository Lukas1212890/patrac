import {activePlayerCount,activePlayersQuery,activePlayMessage} from './activeExpeditionPlayers.mjs';
import {removeExpedition} from './expeditionLifecycle.mjs';
import {GameError} from './patrac-engine.mjs';
export async function deleteAsAdmin({db,bucket,actor,user,input,now,ErrorType}){
 const {code,confirmation,version,requestKey}=input,reason=typeof input.reason==='string'?input.reason.trim():'';
 if(!/^[A-Z2-9]{7}$/.test(code||'')||confirmation!==code||!Number.isSafeInteger(version)||version<0)throw new ErrorType('Pro smazání opište kód výpravy a obnovte její detail.');
 if(reason.length<5||reason.length>500)throw new ErrorType('Vyplňte důvod smazání (5 až 500 znaků).');
 if(typeof requestKey!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(requestKey))throw new ErrorType('Neplatný požadavek na smazání.');
 const id='admin-delete_'+requestKey;
 let audit=await db.prepare('SELECT * FROM patrac_admin_audit WHERE id=?').bind(id).first();
 if(audit){const details=JSON.parse(audit.details);if(audit.target_id!==user.id||audit.action!=='delete-expedition'||details.code!==code||details.reason!==reason)throw new ErrorType('Identifikátor smazání byl již použit.',409,'ADMIN_CONFLICT');if(audit.status==='success')return{ok:true,message:'Výprava už byla smazána. Tvůrce má oznámení s důvodem.'};}
 let row=await db.prepare('SELECT e.* FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=? AND c.creator_id=?').bind(code,user.id).first();
 if(!row)throw new ErrorType('Výprava tomuto účtu nepatří nebo už neexistuje.',404);
 if(await activePlayerCount(db,code))throw new ErrorType(activePlayMessage,409,'ACTIVE_PLAYERS');
 const game=JSON.parse(row.payload);
 if(!audit){
  if(row.version!==version||game.adminDeletion)throw new ErrorType('Výpravu mezitím změnilo jiné okno. Obnovte detail účtu.',409,'ADMIN_CONFLICT');
  const details=JSON.stringify({code,name:game.name,reason}),stamp=now();
  const result=await db.batch([
   db.prepare(`INSERT OR IGNORE INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at)
    SELECT ?,?,?,'delete-expedition',?,'pending',? WHERE EXISTS(SELECT 1 FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=? AND c.creator_id=? AND e.version=? AND json_extract(e.payload,'$.adminDeletion') IS NULL AND NOT EXISTS(${activePlayersQuery('e.code')}))
    AND (SELECT COUNT(*) FROM patrac_admin_audit WHERE actor_id=? AND created_at>?)<30`).bind(id,actor.id,user.id,details,stamp,code,user.id,version,actor.id,stamp-60000),
   db.prepare(`UPDATE patrac_expeditions SET payload=json_set(payload,'$.adminDeletion',?),version=version+1
    WHERE code=? AND version=? AND NOT EXISTS(${activePlayersQuery('patrac_expeditions.code')}) AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=? AND details=? AND status='pending')`).bind(id,code,version,id,details),
  ]);
  if(!result[0].meta.changes)throw new ErrorType('Smazání nelze zahájit. Obnovte detail nebo chvíli počkejte.',409,'ADMIN_CONFLICT');
  row=await db.prepare('SELECT * FROM patrac_expeditions WHERE code=?').bind(code).first();
 }
 if(!row&&(await db.prepare('SELECT status FROM patrac_admin_audit WHERE id=?').bind(id).first())?.status==='success')return{ok:true,message:'Výprava už byla smazána. Tvůrce má oznámení s důvodem.'};
 if(!row||JSON.parse(row.payload).adminDeletion!==id)throw new ErrorType('Smazání se mezitím změnilo. Obnovte detail.',409,'ADMIN_CONFLICT');
 try{await removeExpedition(db,bucket,{code,userId:user.id,version:row.version,confirmation:code,now:now()});}
 catch(error){
  // A competing retry may already have completed the same transaction.
  if((await db.prepare('SELECT status FROM patrac_admin_audit WHERE id=?').bind(id).first())?.status==='success')return{ok:true,message:'Výprava byla smazána. Tvůrce má oznámení s důvodem.'};
  await db.prepare("UPDATE patrac_admin_audit SET status='cleanup_pending' WHERE id=? AND status<>'success'").bind(id).run();
  if(error instanceof GameError)throw new ErrorType(error.message,error.status,'ADMIN_DELETE_PENDING');throw error;
 }
 return{ok:true,message:'Výprava zůstává hratelná a odstraní se po 72 hodinách.'};
}
