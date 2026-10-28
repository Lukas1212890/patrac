import { GameError } from './patrac-engine.mjs';
import {limitsReady,limitSQL} from './creatorLimits.mjs';
export const EXPEDITION_LIMIT=3;
export const PUBLIC_EXPEDITION_LIMIT=2;
export const expeditionCountSQL="SELECT COUNT(*) AS total FROM patrac_creator_games c JOIN patrac_expeditions e ON e.code=c.code WHERE c.creator_id=? AND COALESCE(json_extract(e.payload,'$.visibility'),'private')='private'";
export const publicExpeditionCountSQL=expeditionCountSQL.replace("='private'","='public'");
export async function expeditionCount(db,userId,visibility='private'){return (await db.prepare(visibility==='public'?publicExpeditionCountSQL:expeditionCountSQL).bind(userId).first()).total;}
export async function reserveExpedition(db,{code,ownerHash,payload,userId,now}){
 const visibility=JSON.parse(payload).visibility==='public'?'public':'private',countSQL=visibility==='public'?publicExpeditionCountSQL:expeditionCountSQL,fallback=visibility==='public'?PUBLIC_EXPEDITION_LIMIT:EXPEDITION_LIMIT,custom=await limitsReady(db),limit=custom?limitSQL(visibility):'?';
 // A D1 batch is one transaction: parallel requests cannot both claim the final slot.
 return db.batch([
  db.prepare(`INSERT OR IGNORE INTO patrac_expeditions(code,owner_hash,payload,version)
   SELECT ?,?,?,0 WHERE (${countSQL})<${limit}`).bind(code,ownerHash,payload,userId,custom?userId:fallback),
  db.prepare('INSERT OR IGNORE INTO patrac_creator_games(code,creator_id,linked_at) SELECT code,?,? FROM patrac_expeditions WHERE code=? AND owner_hash=?')
   .bind(userId,now,code,ownerHash),
 ]);
}
export async function removeExpedition(db,bucket,{code,userId,version,confirmation}){
 if(confirmation!==code||!Number.isSafeInteger(version)||version<0)throw new GameError('Pro smazání opište kód výpravy.');
 const row=await db.prepare('SELECT e.* FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=? AND c.creator_id=?').bind(code,userId).first();
 if(!row)throw new GameError('Výprava nebyla nalezena nebo k ní nemáte přístup.',404);
 if(row.version!==version)throw new GameError('Výpravu mezitím změnilo jiné okno. Obnovte ji a smazání potvrďte znovu.',409);
 let revision=row.version;
 if(JSON.parse(row.payload).status!=='deleting'){
  const result=await db.prepare(`UPDATE patrac_expeditions SET payload=json_set(payload,'$.status','deleting'),version=version+1
   WHERE code=? AND version=? AND EXISTS(SELECT 1 FROM patrac_creator_games WHERE code=? AND creator_id=?)`).bind(code,revision,code,userId).run();
  if(!result.meta.changes)throw new GameError('Průběh se změnil. Obnovte výpravu.',409);
  revision++;
 }
 // Keep the tombstone and ownership until all private photos are gone. Failed cleanup can be retried.
 try{
  if(!bucket)throw Error('Missing photo storage');
  let cursor;
  for(let page=0;page<10;page++){
   const objects=await bucket.list({prefix:`hints/${code}/`,limit:1000,...(cursor?{cursor}:{})});
   if(objects.objects.length)await bucket.delete(objects.objects.map(o=>o.key));
   if(!objects.truncated){cursor=undefined;break;}cursor=objects.cursor;
  }
  if(cursor)throw Error('More cleanup pages remain');
 }catch{throw new GameError('Výprava čeká na dokončení mazání fotografií. Obnovte přehled a zkuste ji smazat znovu.',503);}
 const guard="EXISTS(SELECT 1 FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=? AND c.creator_id=? AND e.version=? AND json_extract(e.payload,'$.status')='deleting')";
 const hasAttempts=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_public_attempts'").first();
 const hasReviews=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_public_reviews'").first();
 const results=await db.batch([
  ...(hasReviews?[db.prepare('DELETE FROM patrac_public_reviews WHERE code=? AND '+guard).bind(code,code,userId,revision)]:[]),
  ...(hasAttempts?[db.prepare('DELETE FROM patrac_public_attempts WHERE code=? AND '+guard).bind(code,code,userId,revision)]:[]),
  db.prepare('DELETE FROM patrac_teams WHERE code=? AND '+guard).bind(code,code,userId,revision),
  ...(typeof JSON.parse(row.payload).adminDeletion==='string'?[db.prepare("UPDATE patrac_admin_audit SET status='success' WHERE id=? AND target_id=? AND action='delete-expedition' AND json_extract(details,'$.code')=? AND "+guard).bind(JSON.parse(row.payload).adminDeletion,userId,code,code,userId,revision)]:[]),
  db.prepare("DELETE FROM patrac_creator_games WHERE code=? AND creator_id=? AND EXISTS(SELECT 1 FROM patrac_expeditions WHERE code=? AND version=? AND json_extract(payload,'$.status')='deleting')").bind(code,userId,code,revision),
  db.prepare("DELETE FROM patrac_expeditions WHERE code=? AND owner_hash=? AND version=? AND json_extract(payload,'$.status')='deleting' AND NOT EXISTS(SELECT 1 FROM patrac_creator_games WHERE code=?)").bind(code,row.owner_hash,revision,code),
 ]);
 if(!results[results.length-1].meta.changes)throw new GameError('Mazání se nepodařilo dokončit. Obnovte přehled a opakujte je.',409);
 return {ok:true,deleted:true};
}
