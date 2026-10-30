import {newTeam,score,stationTimings,GameError} from './patrac-engine.mjs';
import {attemptStartedAt} from '../../shared/playLimits.mjs';
const ready=new WeakMap();
export const PRIVATE_HISTORY_SCHEMA=`CREATE TABLE IF NOT EXISTS patrac_private_history(previous_team_id TEXT PRIMARY KEY,code TEXT NOT NULL REFERENCES patrac_expeditions(code) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,snapshot TEXT NOT NULL,finished_at INTEGER NOT NULL,total_ms INTEGER NOT NULL,replacement_id TEXT NOT NULL)`;
export async function ensurePrivateHistory(db){
 if(!ready.has(db))ready.set(db,(async()=>{await db.prepare(PRIVATE_HISTORY_SCHEMA).run();await db.prepare('CREATE INDEX IF NOT EXISTS patrac_private_history_user ON patrac_private_history(user_id,finished_at DESC)').run();await db.prepare('CREATE INDEX IF NOT EXISTS patrac_private_history_code ON patrac_private_history(code)').run();})().catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
}
export async function privatePlayHistory(db,userId){
 await ensurePrivateHistory(db);
 const rows=await db.prepare(`SELECT h.previous_team_id AS id,h.code,h.finished_at AS finishedAt,h.total_ms AS totalMs,json_extract(e.payload,'$.name') AS name FROM patrac_private_history h JOIN patrac_expeditions e ON e.code=h.code WHERE h.user_id=? ORDER BY h.finished_at DESC,h.previous_team_id LIMIT 100`).bind(userId).all();
 return rows.results;
}
export async function privateOwnerHistory(db,code){
 await ensurePrivateHistory(db);
 const rows=await db.prepare('SELECT h.snapshot,u.name FROM patrac_private_history h LEFT JOIN patrac_auth_user u ON u.id=h.user_id WHERE h.code=? ORDER BY h.finished_at DESC,h.previous_team_id').bind(code).all();
 return rows.results.map(r=>{const s=JSON.parse(r.snapshot);return{...s.team,...s.score,timings:s.timings,archived:true,name:r.name||s.team.name};});
}
export async function restartPrivatePlay(db,{code,userId,nickname,teamId,game,now=Date.now()}){
 if(game.visibility==='public')throw new GameError('Veřejné výpravy mají jediný pokus.',403);
 if(typeof teamId!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(teamId))throw new GameError('Obnovte výpravu a zkuste to znovu.',409);
 await ensurePrivateHistory(db);
 const repeated=await db.prepare('SELECT previous_team_id FROM patrac_private_history WHERE previous_team_id=? AND code=? AND user_id=?').bind(teamId,code,userId).first();if(repeated)return{ok:true,replayed:true};
 const row=await db.prepare('SELECT * FROM patrac_teams WHERE code=? AND user_id=?').bind(code,userId).first();
 if(!row||row.id!==teamId)throw new GameError('Průběh se mezitím změnil. Obnovte výpravu.',409);
 const team=JSON.parse(row.payload);
 if(!team.finishedAt||team.abandonedAt)throw new GameError('Zopakovat lze pouze dokončenou soukromou výpravu.',409);
 const replacementId=crypto.randomUUID(),next={...newTeam(replacementId,nickname,now),individualStart:true,startedAt:null};
 const snapshot=JSON.stringify({team:{...team,individualStart:true,startedAt:attemptStartedAt(game,team)},score:score(game,team,now),timings:stationTimings(game,team)});
 const available="EXISTS(SELECT 1 FROM patrac_expeditions e WHERE e.code=? AND COALESCE(json_extract(e.payload,'$.visibility'),'private')='private' AND json_extract(e.payload,'$.moderation') IS NULL AND json_extract(e.payload,'$.status') IN ('waiting','running'))";
 const result=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO patrac_private_history(previous_team_id,code,user_id,snapshot,finished_at,total_ms,replacement_id) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM patrac_teams WHERE id=? AND version=? AND user_id=?) AND ${available} AND (SELECT COUNT(*) FROM patrac_teams WHERE code=? AND json_extract(payload,'$.finishedAt') IS NULL AND json_extract(payload,'$.abandonedAt') IS NULL)<30`).bind(teamId,code,userId,snapshot,team.finishedAt,score(game,team,now).totalMs,replacementId,row.id,row.version,userId,code,code),
  db.prepare(`UPDATE patrac_teams SET id=?,payload=?,version=version+1 WHERE id=? AND version=? AND user_id=? AND EXISTS(SELECT 1 FROM patrac_private_history WHERE previous_team_id=? AND replacement_id=?) AND ${available}`).bind(replacementId,JSON.stringify(next),row.id,row.version,userId,teamId,replacementId,code)
 ]);
 if(result[0].meta.changes&&result[1].meta.changes)return{ok:true};
 if(await db.prepare('SELECT previous_team_id FROM patrac_private_history WHERE previous_team_id=? AND code=? AND user_id=?').bind(teamId,code,userId).first())return{ok:true,replayed:true};
 throw new GameError('Výprava se změnila nebo je plná. Obnovte ji a zkuste to znovu.',409);
}
