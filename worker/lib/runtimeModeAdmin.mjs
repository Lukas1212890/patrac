import {readRuntimeMode,modeConfiguration,verifyMode} from './runtimeMode.mjs';
import {AdminError} from './adminService.mjs';
export async function runtimeModeStatus(db,raw){return{...await readRuntimeMode(db,raw.PATRAC_STRIPE_MODE),test:modeConfiguration(raw,'test'),live:modeConfiguration(raw,'live')};}
export async function changeRuntimeMode({db,raw,actor,input,fetcher=fetch,now=Date.now}){
 const state=await readRuntimeMode(db,raw.PATRAC_STRIPE_MODE);
 if(!state.ready)throw new AdminError('Nejprve spusťte databázovou migraci 0011_runtime_mode.sql.',503);
 if(!['test','live'].includes(input.mode)||!Number.isSafeInteger(input.version)||input.confirm!==true)throw new AdminError('Potvrďte změnu režimu celé hry.');
 if(state.mode===input.mode)return{ok:true,message:'Tento režim už je aktivní.'};
 if(state.version!==input.version)throw new AdminError('Režim mezitím změnil jiný správce. Obnovte přehled.',409,'ADMIN_CONFLICT');
 const check=await verifyMode(raw,input.mode,fetcher);
 if(!check.verified)throw new AdminError(check.error+(check.missing.length?' Chybí: '+check.missing.join(', '):''),409,'MODE_NOT_READY');
 const id=crypto.randomUUID(),stamp=now(),details=JSON.stringify({from:state.mode,to:input.mode,operation:id,accountId:check.accountId});
 const result=await db.batch([
  db.prepare("INSERT INTO patrac_admin_audit(id,actor_id,target_id,action,details,status,created_at) SELECT ?,?,?,'runtime-mode',?,'success',? WHERE EXISTS(SELECT 1 FROM patrac_runtime_mode WHERE id=1 AND version=?)").bind(id,actor.id,actor.id,details,stamp,input.version),
  db.prepare("UPDATE patrac_runtime_mode SET mode=?,version=version+1,updated_at=?,updated_by=? WHERE id=1 AND version=? AND EXISTS(SELECT 1 FROM patrac_admin_audit WHERE id=?)").bind(input.mode,stamp,actor.id,input.version,id),
 ]);
 if(!result[1].meta.changes)throw new AdminError('Režim mezitím změnil jiný správce. Obnovte přehled.',409,'ADMIN_CONFLICT');
 return{ok:true,message:input.mode==='live'?'Ostrý režim je aktivní. Nové platby používají skutečné peníze.':'Testovací režim je aktivní.'};
}
