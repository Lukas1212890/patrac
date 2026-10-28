import {GameError} from './patrac-engine.mjs';
import {billingEnvironment} from './billing.mjs';
import {communityReady} from './publicExpeditions.mjs';
import {reviewsReady} from './publicReviews.mjs';
import {createCreatorRewards,creatorRewardsReady} from './creatorRewards.mjs';
const VISIBLE="json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.status')='running' AND json_extract(e.payload,'$.published')=1";
const FINISHED=`WITH finished AS (
 SELECT a.id,a.code,a.user_id,json_extract(e.payload,'$.name') AS name,
 json_extract(e.payload,'$.published') AS published,
 CAST(json_extract(t.payload,'$.finishedAt') AS INTEGER) AS finishedAt,
 COALESCE(CAST(json_extract(t.payload,'$.penaltyMs') AS INTEGER),0) AS penaltyMs,
 CAST(json_extract(t.payload,'$.finishedAt') AS INTEGER)-CAST(json_extract(t.payload,'$.startedAt') AS INTEGER)+COALESCE(CAST(json_extract(t.payload,'$.penaltyMs') AS INTEGER),0) AS totalMs
 FROM patrac_public_attempts a JOIN patrac_teams t ON t.id=a.team_id JOIN patrac_expeditions e ON e.code=a.code
 JOIN patrac_creator_games c ON c.code=e.code
 WHERE a.environment=? AND json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.status')='running'
 AND a.user_id<>c.creator_id AND json_extract(t.payload,'$.finishedAt') IS NOT NULL
 AND json_extract(t.payload,'$.startedAt') IS NOT NULL
)`;
export function createRankingService({db,env}){
 const environment=billingEnvironment(env);
 const activityCTE=FINISHED+`, activity AS (
 SELECT user_id,COUNT(*) AS completed FROM finished GROUP BY user_id
 ), ranked AS (SELECT user_id,completed,DENSE_RANK() OVER(ORDER BY completed DESC) AS rank FROM activity)`;
 async function ownStats(user){
  const count=await db.prepare(FINISHED+' SELECT COUNT(*) AS completed FROM finished WHERE user_id=?').bind(environment,user.id).first();
  const activity=await db.prepare(activityCTE+' SELECT rank,completed FROM ranked WHERE user_id=?').bind(environment,user.id).first();
  return{completed:count.completed,activityRank:activity?.rank??null,activityCompleted:activity?.completed??0};
 }
 async function results(user,offset='0'){
  if(!user)throw new GameError('Pro vlastní výsledky se přihlaste.',401);
  if(!await communityReady(db))throw new GameError('Veřejné výpravy se právě připravují.',503);
  const page=Number(offset??0);if(!Number.isSafeInteger(page)||page<0||page>10000)throw new GameError('Neplatná stránka výsledků.');
  const rows=await db.prepare(FINISHED+`, standings AS (
   SELECT *,ROW_NUMBER() OVER(PARTITION BY code ORDER BY totalMs ASC,finishedAt ASC,id ASC) AS rank,
   COUNT(*) OVER(PARTITION BY code) AS finishers FROM finished
  ) SELECT code,name,totalMs,totalMs-penaltyMs AS elapsedMs,penaltyMs,finishedAt,rank,finishers,CASE WHEN published=1 THEN 0 ELSE 1 END AS hidden
   FROM standings WHERE user_id=? ORDER BY finishedAt DESC,code ASC LIMIT 21 OFFSET ?`).bind(environment,user.id,page).all();
  return{items:rows.results.slice(0,20).map(r=>({...r,hidden:!!r.hidden})),hasMore:rows.results.length>20,nextOffset:page+20};
 }
 async function authored(user,ratingsReady){
  const rows=await db.prepare("SELECT e.code,json_extract(e.payload,'$.name') AS name,json_extract(e.payload,'$.status') AS status,json_extract(e.payload,'$.published') AS published FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE c.creator_id=? AND json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.status')<>'deleting' ORDER BY c.linked_at DESC,e.code").bind(user.id).all();
  if(!rows.results.length)return[];
  const codes=rows.results.map(r=>r.code),slots=codes.map(()=>'?').join(',');
  const finishers=await db.prepare(FINISHED+` SELECT code,COUNT(*) AS completed FROM finished WHERE code IN (${slots}) GROUP BY code`).bind(environment,...codes).all();
  let ratings=[],positions=[];
  if(ratingsReady){
   ratings=(await db.prepare(`SELECT code,COUNT(*) AS count,ROUND(AVG(stars),1) AS average FROM patrac_public_reviews WHERE environment=? AND code IN (${slots}) GROUP BY code`).bind(environment,...codes).all()).results;
   positions=(await db.prepare(`WITH ranked AS (
    SELECT e.code,ROW_NUMBER() OVER(ORDER BY AVG(r.stars) DESC,COUNT(*) DESC,e.code ASC) AS rank
    FROM patrac_public_reviews r JOIN patrac_expeditions e ON e.code=r.code JOIN patrac_creator_games c ON c.code=e.code
    WHERE r.environment=? AND ${VISIBLE} GROUP BY e.code
   ) SELECT code,rank FROM ranked WHERE code IN (${slots})`).bind(environment,...codes).all()).results;
  }
  return rows.results.map(row=>({...row,published:!!row.published,completed:finishers.results.find(r=>r.code===row.code)?.completed||0,
   rating:ratings.find(r=>r.code===row.code)||{count:0,average:null},rank:positions.find(r=>r.code===row.code)?.rank??null}));
 }
 async function overview(user){
  if(!await communityReady(db))return{ready:false,environment,ratedExpeditions:[],activePlayers:[],myExpeditions:null,myResults:null};
  const ratingsReady=await reviewsReady(db);let ratedExpeditions=[];
  if(ratingsReady){
   const rows=await db.prepare(`SELECT e.code,json_extract(e.payload,'$.name') AS name,substr(u.name,1,60) AS author,
    COUNT(*) AS count,ROUND(AVG(r.stars),1) AS average,json_extract(e.payload,'$.publicInfo.distanceKm') AS distanceKm,
    json_extract(e.payload,'$.publicInfo.difficulty') AS difficulty
    FROM patrac_public_reviews r JOIN patrac_expeditions e ON e.code=r.code
    JOIN patrac_creator_games c ON c.code=e.code JOIN patrac_auth_user u ON u.id=c.creator_id
    WHERE r.environment=? AND ${VISIBLE} GROUP BY e.code ORDER BY AVG(r.stars) DESC,COUNT(*) DESC,e.code ASC LIMIT 20`).bind(environment).all();ratedExpeditions=rows.results;
  }
  const players=await db.prepare(activityCTE+` SELECT substr(u.name,1,60) AS nickname,r.completed,r.rank,
   CASE WHEN r.user_id=? THEN 1 ELSE 0 END AS isMe FROM ranked r JOIN patrac_auth_user u ON u.id=r.user_id
   ORDER BY r.completed DESC,u.name COLLATE NOCASE ASC,r.user_id ASC LIMIT 20`).bind(environment,user?.id||'').all();
  return{ready:true,environment,ratingsReady,rewardsReady:await creatorRewardsReady(db),ratedExpeditions,activePlayers:players.results.map(r=>({...r,isMe:!!r.isMe})),
   creatorRewards:user?await createCreatorRewards({db,env}).summary(user.id):null,
   myExpeditions:user?await authored(user,ratingsReady):null,
   myResults:user?{...await results(user),stats:await ownStats(user)}:null};
 }
 return{overview,results};
}
