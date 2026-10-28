import {routeEstimateSQL} from './routeInfo.mjs';
import {routeInfoFor} from '../../shared/routeEstimate.mjs';
import {GameError,newTeam,applyAction,teamProjection,score} from './patrac-engine.mjs';
import {accessState,billingEnvironment} from './billing.mjs';
import {createReviewService,reviewsReady} from './publicReviews.mjs';
import {createCreatorRewards} from './creatorRewards.mjs';
export async function communityReady(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_public_attempts'").first();}
export function validatePublicInfo(value,routeInfo){
 const info=value||{};
 if(typeof info.description!=='string'||info.description.trim().length<10||info.description.trim().length>1500)throw new GameError('Veřejné výpravě doplňte popis (10 až 1500 znaků).');
 if(!['easy','medium','hard'].includes(info.difficulty))throw new GameError('Vyberte obtížnost veřejné výpravy.');
 if(!routeInfo)throw new GameError('Nejprve doplňte souřadnice všech stanovišť.');
 return{description:info.description.trim(),difficulty:info.difficulty,...routeInfo};
}
export async function requirePublicAccess(db,env,userId,stamp=Date.now()){const access=await accessState(db,userId,billingEnvironment(env),stamp);if(!access.active)throw new GameError('Veřejné výpravy jsou dostupné s aktivním předplatným. Vyberte si období v profilu.',402);return access;}
const CARD=`${routeEstimateSQL} AS routePayload,e.code,json_extract(e.payload,'$.name') AS name,json_extract(e.payload,'$.publicInfo.description') AS description,
 json_extract(e.payload,'$.publicInfo.difficulty') AS difficulty,json_extract(e.payload,'$.publicInfo.distanceKm') AS distanceKm,
 json_extract(e.payload,'$.publicInfo.estimatedMinutes') AS estimatedMinutes,json_extract(e.payload,'$.stations[0].lat') AS lat,
 json_extract(e.payload,'$.stations[0].lng') AS lng,json_array_length(json_extract(e.payload,'$.stations')) AS totalStations,
 substr(u.name,1,60) AS author,c.creator_id AS ownerId`;
const PUBLIC="json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.published')=1 AND json_extract(e.payload,'$.status')='running'";
const BASE='FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code JOIN patrac_auth_user u ON u.id=c.creator_id';
const safeCard=({ownerId,routePayload,...card})=>({...card,...routeInfoFor(JSON.parse(routePayload))});
export function createPublicService({db,env,revealPhoto,now=Date.now}){
 const environment=billingEnvironment(env),reviews=createReviewService({db,env,now});
 async function ready(){if(!await communityReady(db))throw new GameError('Veřejné výpravy se právě připravují.',503);}
 async function paid(user){if(!user)throw new GameError('Pro veřejnou výpravu se přihlaste.',401);return requirePublicAccess(db,env,user.id,now());}
 async function ownAttempt(code,userId){return db.prepare('SELECT a.id AS attempt_id,a.created_at,t.*,e.payload AS game_payload FROM patrac_public_attempts a JOIN patrac_teams t ON t.id=a.team_id JOIN patrac_expeditions e ON e.code=a.code WHERE a.code=? AND a.user_id=? AND a.environment=?').bind(code,userId,environment).first();}
 function attemptSummary(row){if(!row)return null;const team=JSON.parse(row.payload),game=JSON.parse(row.game_payload);return{id:row.attempt_id,code:row.code,name:game.name,startedAt:team.startedAt,finishedAt:team.finishedAt,index:team.index,totalStations:game.stations.length,totalMs:score(game,team,now()).totalMs,hidden:!game.published,deleted:game.status==='deleting'};}
 async function leaderboard(code){const rows=await db.prepare(`SELECT substr(u.name,1,60) AS nickname,
  CAST(json_extract(t.payload,'$.finishedAt') AS INTEGER)-CAST(json_extract(t.payload,'$.startedAt') AS INTEGER)+COALESCE(CAST(json_extract(t.payload,'$.penaltyMs') AS INTEGER),0) AS totalMs,
  json_extract(t.payload,'$.finishedAt') AS finishedAt
  FROM patrac_public_attempts a JOIN patrac_teams t ON t.id=a.team_id JOIN patrac_auth_user u ON u.id=a.user_id
  WHERE a.code=? AND a.environment=? AND json_extract(t.payload,'$.finishedAt') IS NOT NULL
  ORDER BY totalMs ASC,finishedAt ASC,a.id ASC LIMIT 10`).bind(code,environment).all();return rows.results;}
 async function listing(bounds){if(!await communityReady(db))return{ready:false,expeditions:[]};
  let box=[-180,-85,180,85];if(bounds){box=bounds.split(',').map(Number);if(box.length!==4||!box.every(Number.isFinite)||box[0]<-180||box[2]>180||box[1]<-90||box[3]>90||box[0]>box[2]||box[1]>box[3])throw new GameError('Neplatná oblast mapy.');}
  const rows=await db.prepare(`SELECT ${CARD} ${BASE} WHERE ${PUBLIC} AND json_extract(e.payload,'$.stations[0].lng') BETWEEN ? AND ? AND json_extract(e.payload,'$.stations[0].lat') BETWEEN ? AND ? ORDER BY e.code LIMIT 151`).bind(box[0],box[2],box[1],box[3]).all();
  const expeditions=rows.results.slice(0,150).map(safeCard);
  if(expeditions.length&&await reviewsReady(db)){
   const ratings=[];for(let offset=0;offset<expeditions.length;offset+=90){const group=expeditions.slice(offset,offset+90);const page=await db.prepare(`SELECT code,COUNT(*) AS count,ROUND(AVG(stars),1) AS average FROM patrac_public_reviews WHERE environment=? AND code IN (${group.map(()=>'?').join(',')}) GROUP BY code`).bind(environment,...group.map(e=>e.code)).all();ratings.push(...page.results);}
   const byCode=new Map(ratings.map(r=>[r.code,{count:r.count,average:r.average}]));for(const item of expeditions)item.rating=byCode.get(item.code)||{count:0,average:null};
  }
  return{ready:true,expeditions,hasMore:rows.results.length>150};
 }
 async function detail(code,user){await ready();const card=await db.prepare(`SELECT ${CARD} ${BASE} WHERE e.code=? AND ${PUBLIC}`).bind(code).first();
  if(!card)throw new GameError('Výprava už není veřejně dostupná.',404);
  return{environment,expedition:safeCard(card),reviews:await reviews.detail(code,user,card.ownerId),leaderboard:await leaderboard(code),attempt:user?attemptSummary(await ownAttempt(code,user.id)):null,access:user?await accessState(db,user.id,billingEnvironment(env),now()):{active:false},isAuthor:card.ownerId===user?.id,now:now()};
 }
 async function start(code,user,confirmation){await ready();await paid(user);
  if(confirmation!==true)throw new GameError('Potvrďte jediný pokus a zveřejnění přezdívky s výsledkem.');
  const existing=await ownAttempt(code,user.id);if(existing)return{attempt:attemptSummary(existing),reused:true};
  const card=await db.prepare(`SELECT ${CARD} ${BASE} WHERE e.code=? AND ${PUBLIC}`).bind(code).first();if(!card)throw new GameError('Výprava není zveřejněná.',404);
  if(card.ownerId===user.id)throw new GameError('Autor nemůže soutěžit v žebříčku vlastní výpravy.',403);
  const stamp=now(),id=crypto.randomUUID(),teamId=crypto.randomUUID(),team={...newTeam(teamId,String(user.nickname||'Hráč').trim().slice(0,60),stamp),startedAt:stamp};
  const available=`EXISTS(SELECT 1 FROM patrac_expeditions e WHERE e.code=? AND ${PUBLIC}) AND NOT EXISTS(SELECT 1 FROM patrac_public_attempts WHERE code=? AND user_id=? AND environment=?)`;
  const results=await db.batch([
   db.prepare(`INSERT OR IGNORE INTO patrac_teams(id,code,token_hash,name_key,payload,version) SELECT ?,?,?,?,?,0 WHERE ${available}`)
    .bind(teamId,code,'account:'+crypto.randomUUID(),'public:'+environment+':'+user.id,JSON.stringify(team),code,code,user.id,environment),
   db.prepare('INSERT OR IGNORE INTO patrac_public_attempts(id,code,user_id,team_id,created_at,environment) SELECT ?,?,?,id,?,? FROM patrac_teams WHERE id=?').bind(id,code,user.id,stamp,environment,teamId),
   db.prepare('UPDATE patrac_expeditions SET version=version+1 WHERE code=? AND EXISTS(SELECT 1 FROM patrac_public_attempts WHERE id=?)').bind(code,id),
  ]);
  const attempt=await ownAttempt(code,user.id);if(!attempt)throw new GameError('Výpravu mezitím autor skryl. Obnovte mapu.',409);
  return{attempt:attemptSummary(attempt),reused:!results[1].meta.changes};
 }
 async function play(code,user,input){await ready();await paid(user);const row=await ownAttempt(code,user.id);if(!row)throw new GameError('Tuto výpravu nejprve zahajte z mapy.',404);
  const game=JSON.parse(row.game_payload);if(game.visibility!=='public'||game.status!=='running')throw new GameError('Výprava už není dostupná.',410);
  if(input){
   if(!['arrive','answer','hint','solution'].includes(input.action))throw new GameError('Neplatná herní akce.');
   for(let i=0;i<5;i++){
    const current=i===0?row:await db.prepare('SELECT * FROM patrac_teams WHERE id=?').bind(row.id).first();if(!current)throw new GameError('Výprava byla odstraněna.',410);
    const next=applyAction(game,JSON.parse(current.payload),input,now()),wrong=next.wrongAnswer;delete next.wrongAnswer;
    const result=await db.prepare("UPDATE patrac_teams SET payload=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM patrac_expeditions WHERE code=? AND json_extract(payload,'$.status')='running')").bind(JSON.stringify(next),row.id,current.version,code).run();
    if(result.meta.changes){if(next.finishedAt){try{await createCreatorRewards({db,env,now}).rewardExpedition(code);}catch{console.error('Creator reward deferred to scheduled retry');}}return{ok:true,wrongAnswer:!!wrong};}
   }throw new GameError('Pokus se právě mění v jiném okně. Obnovte ho.',409);
  }
  const team=JSON.parse(row.payload),projection=teamProjection(game,team,now());
  if(projection.station?.hints)projection.station.hints=await Promise.all(projection.station.hints.map(async hint=>{
   if(hint.type!=='photo'||!team.events.some(e=>e.type==='hint'&&e.index===team.index&&e.hintId===hint.id))return hint;
   const original=game.stations[team.index].hints.find(h=>h.id===hint.id);return{...hint,content:(await revealPhoto(original)).content};
  }));
  const counts=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN json_extract(payload,'$.finishedAt') IS NOT NULL THEN 1 ELSE 0 END) AS finished FROM patrac_teams WHERE code=?").bind(code).first();
  return{role:'team',game:{code,name:game.name,mode:'race',status:'running',startedAt:team.startedAt,totalStations:game.stations.length,visibility:'public'},team:projection,counts,now:now()};
 }
 async function history(user){await ready();if(!user)throw new GameError('Přihlaste se ke svému účtu.',401);
  const rows=await db.prepare('SELECT a.id AS attempt_id,a.created_at,t.*,e.payload AS game_payload FROM patrac_public_attempts a JOIN patrac_teams t ON t.id=a.team_id JOIN patrac_expeditions e ON e.code=a.code WHERE a.user_id=? AND a.environment=? ORDER BY a.created_at DESC LIMIT 100').bind(user.id,environment).all();return{attempts:rows.results.map(attemptSummary)};
 }
 return{listing,detail,start,play,history};
}
