import {carryAdminAccess} from './adminAccessCarryover.mjs';
import {addMonths,billingEnvironment} from './billing.mjs';
import {GameError} from './patrac-engine.mjs';
export const REWARD_THRESHOLD=100,REWARD_MONTHS=2;
const COUNT=`SELECT COUNT(*) AS completed FROM patrac_public_attempts a JOIN patrac_teams t ON t.id=a.team_id
 WHERE a.code=? AND a.environment=? AND a.user_id<>?
 AND json_extract(t.payload,'$.finishedAt') IS NOT NULL AND json_extract(t.payload,'$.startedAt') IS NOT NULL`;
export async function creatorRewardsReady(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_creator_rewards'").first();}
export function createCreatorRewards({db,env,now=Date.now}){
 const environment=billingEnvironment(env);
 async function rewardExpedition(code){
  if(!await creatorRewardsReady(db))return{ready:false,granted:0};
  const game=await db.prepare(`SELECT c.creator_id AS userId,json_extract(e.payload,'$.name') AS name
   FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code JOIN patrac_auth_user creator ON creator.id=c.creator_id AND creator.emailVerified=1
   WHERE e.code=? AND json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.status')='running'`).bind(code).first();
  if(!game)return{ready:true,granted:0};
  const completed=await db.prepare(COUNT).bind(code,environment,game.userId).first();
  const count=completed.completed,last=await db.prepare('SELECT COALESCE(MAX(milestone),0) AS milestone FROM patrac_creator_rewards WHERE code=? AND environment=?').bind(code,environment).first();
  let granted=0;
  for(let milestone=last.milestone+100;milestone<=count&&milestone<=last.milestone+1000;milestone+=100){
   if(environment==='live')await carryAdminAccess(db,game.userId);
   await db.prepare('INSERT OR IGNORE INTO patrac_access(user_id,environment) VALUES(?,?)').bind(game.userId,environment).run();
   let done=false;
   for(let retry=0;retry<8;retry++){
    const current=await db.prepare('SELECT expires_at,version FROM patrac_access WHERE user_id=? AND environment=?').bind(game.userId,environment).first();
    if(!current)return{ready:true,granted};
    const stamp=now(),until=addMonths(Math.max(stamp,current.expires_at),REWARD_MONTHS),activation=crypto.randomUUID();
    const result=await db.batch([
     db.prepare(`INSERT OR IGNORE INTO patrac_creator_rewards(code,user_id,environment,milestone,expedition_name,months,granted_at,access_until,activation_id)
      SELECT ?,?,?,?,?,2,?,?,? WHERE EXISTS(SELECT 1 FROM patrac_access WHERE user_id=? AND environment=? AND version=?)
      AND EXISTS(SELECT 1 FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code JOIN patrac_auth_user creator ON creator.id=c.creator_id AND creator.emailVerified=1 WHERE e.code=? AND c.creator_id=? AND json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.status')='running')
      AND (${COUNT})>=?`)
      .bind(code,game.userId,environment,milestone,game.name,stamp,until,activation,game.userId,environment,current.version,code,game.userId,code,environment,game.userId,milestone),
     db.prepare(`UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id=? AND environment=? AND version=?
      AND EXISTS(SELECT 1 FROM patrac_creator_rewards WHERE activation_id=?)`).bind(until,game.userId,environment,current.version,activation),
    ]);
    if(result[0].meta.changes){granted++;done=true;break;}
    if(await db.prepare('SELECT milestone FROM patrac_creator_rewards WHERE code=? AND environment=? AND milestone=?').bind(code,environment,milestone).first()){done=true;break;}
    if(!await db.prepare("SELECT code FROM patrac_expeditions WHERE code=? AND json_extract(payload,'$.status')='running'").bind(code).first())return{ready:true,granted};
   }
   if(!done)throw new GameError('Odměna čeká na opakované přiznání.',503);
  }
  return{ready:true,granted};
 }
 async function sweep(){
  if(!await creatorRewardsReady(db))return{ready:false,checked:0};
  const rows=await db.prepare(`SELECT e.code FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code JOIN patrac_auth_user creator ON creator.id=c.creator_id AND creator.emailVerified=1
   JOIN patrac_public_attempts a ON a.code=e.code AND a.environment=? AND a.user_id<>c.creator_id
   JOIN patrac_teams t ON t.id=a.team_id
   WHERE json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.status')='running'
   AND json_extract(t.payload,'$.finishedAt') IS NOT NULL AND json_extract(t.payload,'$.startedAt') IS NOT NULL
   GROUP BY e.code HAVING COUNT(*)>=100+COALESCE((SELECT MAX(milestone) FROM patrac_creator_rewards r WHERE r.code=e.code AND r.environment=?),0)
   ORDER BY e.code LIMIT 10`).bind(environment,environment).all();
  let failed=false;for(const row of rows.results){try{await rewardExpedition(row.code);}catch{failed=true;console.error('Creator reward retry failed');}}
  if(failed)throw new GameError('Některé odměny čekají na opakování.',503);
  return{ready:true,checked:rows.results.length};
 }
 async function summary(userId){
  if(!await creatorRewardsReady(db))return{ready:false,expeditions:[],awardedMonths:0,history:[]};
  const rows=await db.prepare(`SELECT e.code,json_extract(e.payload,'$.name') AS name,
   (${COUNT.replace('a.code=?','a.code=e.code')}) AS completed,
   COALESCE((SELECT MAX(milestone) FROM patrac_creator_rewards r WHERE r.code=e.code AND r.environment=?),0) AS awarded
   FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code JOIN patrac_auth_user creator ON creator.id=c.creator_id AND creator.emailVerified=1 WHERE c.creator_id=? AND json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.status')<>'deleting'`).bind(environment,userId,environment,userId).all();
  // Use the per-expedition code in the correlated counter, rather than a client-supplied identifier.
  const history=await db.prepare('SELECT code,expedition_name AS name,milestone,months,granted_at AS grantedAt,access_until AS accessUntil FROM patrac_creator_rewards WHERE user_id=? AND environment=? ORDER BY granted_at DESC,code,milestone DESC LIMIT 20').bind(userId,environment).all();
  const total=await db.prepare('SELECT COALESCE(SUM(months),0) AS months FROM patrac_creator_rewards WHERE user_id=? AND environment=?').bind(userId,environment).first();
  return{ready:true,awardedMonths:total.months,history:history.results,expeditions:rows.results.map(row=>({...row,progress:Math.min(100,Math.max(0,row.completed-row.awarded)),nextMilestone:row.awarded+100,remaining:Math.max(0,row.awarded+100-row.completed),pendingMonths:Math.max(0,Math.floor((row.completed-row.awarded)/100))*2}))};
 }
 return{rewardExpedition,sweep,summary};
}
