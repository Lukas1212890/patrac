import {GameError} from './patrac-engine.mjs';
import {billingEnvironment} from './billing.mjs';
export async function reviewsReady(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_public_reviews'").first();}
export async function repliesReady(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_review_replies'").first();}
export function validateReview(input){
 if(!Number.isInteger(input.stars)||input.stars<1||input.stars>5)throw new GameError('Vyberte hodnocení od 1 do 5 hvězdiček.');
 if(typeof input.comment!=='string'||input.comment.trim().length>1000)throw new GameError('Komentář může mít nejvýše 1000 znaků.');
 return{stars:input.stars,comment:input.comment.trim()};
}
export function createReviewService({db,env,now=Date.now}){
 const environment=billingEnvironment(env);
 /** @param {string} code @param {{id:string}|null} user */
 async function route(code,user=null){
  const row=await db.prepare("SELECT e.code,c.creator_id FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=? AND json_extract(e.payload,'$.visibility')='public' AND (json_extract(e.payload,'$.published')=1 OR c.creator_id=?) AND json_extract(e.payload,'$.status')='running'").bind(code,user?.id||'').first();
  if(!row)throw new GameError('Výprava už není veřejně dostupná.',404);return row;
 }
 async function canReview(code,user,ownerId){
  if(!user||user.id===ownerId)return false;
  return !!await db.prepare("SELECT a.id FROM patrac_public_attempts a JOIN patrac_teams t ON t.id=a.team_id WHERE a.code=? AND a.user_id=? AND a.environment=? AND json_extract(t.payload,'$.finishedAt') IS NOT NULL").bind(code,user.id,environment).first();
 }
 async function summary(code){
  const row=await db.prepare('SELECT COUNT(*) AS count,AVG(stars) AS average FROM patrac_public_reviews WHERE code=? AND environment=?').bind(code,environment).first();
  return{count:row.count,average:row.average===null?null:Math.round(row.average*10)/10};
 }
 async function page(code,offset=0,owner=false){
  const ready=await repliesReady(db);
  const rows=await db.prepare(`SELECT substr(u.name,1,60) AS nickname,r.stars,r.comment,r.created_at AS createdAt,r.updated_at AS updatedAt
   ${owner?',r.user_id AS reviewKey':''}${ready?',q.content AS reply,q.updated_at AS replyAt,COALESCE(q.version,0) AS replyVersion':''}
   FROM patrac_public_reviews r JOIN patrac_auth_user u ON u.id=r.user_id
   ${ready?'LEFT JOIN patrac_review_replies q ON q.code=r.code AND q.review_user_id=r.user_id AND q.environment=r.environment':''}
   WHERE r.code=? AND r.environment=? ORDER BY r.created_at DESC,r.user_id ASC LIMIT 21 OFFSET ?`).bind(code,environment,offset).all();
  return{items:rows.results.slice(0,20),hasMore:rows.results.length>20,nextOffset:offset+20};
 }
 async function detail(code,user,ownerId){
  if(!await reviewsReady(db))return{ready:false,count:0,average:null,items:[],hasMore:false,ownReview:null,canReview:false};
  const own=user?await db.prepare('SELECT stars,comment FROM patrac_public_reviews WHERE code=? AND user_id=? AND environment=?').bind(code,user.id,environment).first():null;
  return{ready:true,...await summary(code),...await page(code,0,user?.id===ownerId),repliesReady:await repliesReady(db),ownReview:own,canReview:await canReview(code,user,ownerId)};
 }
 /** @param {string} code @param {any} offset @param {{id:string}|null} user */
 async function list(code,offset,user=null){
  const game=await route(code,user);if(!await reviewsReady(db))throw new GameError('Hodnocení právě připravujeme.',503);
  const value=offset===null?0:Number(offset);if(!Number.isSafeInteger(value)||value<0||value>10000)throw new GameError('Neplatná stránka hodnocení.');return page(code,value,game.creator_id===user?.id);
 }
 async function save(code,user,input){
  if(!user)throw new GameError('Pro hodnocení se přihlaste.',401);
  if(!await reviewsReady(db))throw new GameError('Hodnocení právě připravujeme.',503);
  const game=await route(code,user);
  if(input.action==='reply')return reply(code,user,input,game);
  if(input.action==='delete'){
   await db.prepare('DELETE FROM patrac_public_reviews WHERE code=? AND user_id=? AND environment=?').bind(code,user.id,environment).run();return{ok:true};
  }
  if(input.action!=='save')throw new GameError('Neplatná akce hodnocení.');
  if(!await canReview(code,user,game.creator_id))throw new GameError('Hodnotit můžete po dokončení výpravy. Autor vlastní výpravu nehodnotí.',403);
  const review=validateReview(input),stamp=now();
  // One row per account and environment. The INSERT rechecks completion and availability atomically.
  const saved=await db.prepare(`INSERT INTO patrac_public_reviews(code,user_id,environment,stars,comment,created_at,updated_at)
   SELECT ?,?,?,?,?,?,? WHERE EXISTS(
    SELECT 1 FROM patrac_public_attempts a JOIN patrac_teams t ON t.id=a.team_id JOIN patrac_expeditions e ON e.code=a.code
    WHERE a.code=? AND a.user_id=? AND a.environment=? AND json_extract(t.payload,'$.finishedAt') IS NOT NULL
     AND json_extract(e.payload,'$.published')=1 AND json_extract(e.payload,'$.status')='running')
   ON CONFLICT(code,user_id,environment) DO UPDATE SET stars=excluded.stars,comment=excluded.comment,updated_at=excluded.updated_at`)
   .bind(code,user.id,environment,review.stars,review.comment,stamp,stamp,code,user.id,environment).run();
  if(!saved.meta.changes)throw new GameError('Výprava se mezitím změnila. Obnovte stránku.',409);
  return{ok:true};
 }
 async function manage(code,user){
  if(!user)throw new GameError('Přihlaste se.',401);
  const game=await route(code,user);if(game.creator_id!==user.id)throw new GameError('K přehledu nemáte přístup.',403);
  return detail(code,user,game.creator_id);
 }
 async function reply(code,user,input,game){
  if(game.creator_id!==user.id)throw new GameError('Odpovědět může jen tvůrce výpravy.',403);
  if(!await repliesReady(db))throw new GameError('Odpovědi právě připravujeme.',503);
  if(typeof input.reviewKey!=='string'||input.reviewKey.length>200||typeof input.content!=='string'||!input.content.trim()||input.content.trim().length>1000||!Number.isSafeInteger(input.version)||input.version<0)throw new GameError('Odpověď musí mít 1 až 1000 znaků.');
  const review=await db.prepare('SELECT comment,updated_at FROM patrac_public_reviews WHERE code=? AND user_id=? AND environment=?').bind(code,input.reviewKey,environment).first();
  if(!review?.comment)throw new GameError('Na toto hodnocení nelze odpovědět: komentář už není dostupný.',409);
  if(review.updated_at!==input.reviewUpdatedAt)throw new GameError('Komentář se mezitím změnil. Obnovte přehled.',409);
  const content=input.content.trim(),stamp=now();
  const saved=await db.prepare(`INSERT INTO patrac_review_replies(code,review_user_id,environment,content,created_at,updated_at,version)
   SELECT ?,?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM patrac_public_reviews r JOIN patrac_expeditions e ON e.code=r.code JOIN patrac_creator_games c ON c.code=e.code WHERE r.code=? AND r.user_id=? AND r.environment=? AND r.updated_at=? AND length(trim(r.comment))>0 AND c.creator_id=? AND json_extract(e.payload,'$.status')='running')
   AND (?=0 OR EXISTS(SELECT 1 FROM patrac_review_replies WHERE code=? AND review_user_id=? AND environment=?))
   ON CONFLICT(code,review_user_id,environment) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at,version=patrac_review_replies.version+1 WHERE patrac_review_replies.version=? AND patrac_review_replies.content IS NOT excluded.content`)
   .bind(code,input.reviewKey,environment,content,stamp,stamp,code,input.reviewKey,environment,input.reviewUpdatedAt,user.id,input.version,code,input.reviewKey,environment,input.version).run();
  if(!saved.meta.changes){const existing=await db.prepare('SELECT content FROM patrac_review_replies WHERE code=? AND review_user_id=? AND environment=?').bind(code,input.reviewKey,environment).first();if(existing?.content!==content)throw new GameError('Odpověď se mezitím změnila. Obnovte přehled.',409);}
  return{ok:true};
 }
 return{detail,list,save,manage};
}
