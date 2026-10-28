import {GameError} from './patrac-engine.mjs';
import {billingEnvironment} from './billing.mjs';
export async function reviewsReady(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_public_reviews'").first();}
export function validateReview(input){
 if(!Number.isInteger(input.stars)||input.stars<1||input.stars>5)throw new GameError('Vyberte hodnocení od 1 do 5 hvězdiček.');
 if(typeof input.comment!=='string'||input.comment.trim().length>1000)throw new GameError('Komentář může mít nejvýše 1000 znaků.');
 return{stars:input.stars,comment:input.comment.trim()};
}
export function createReviewService({db,env,now=Date.now}){
 const environment=billingEnvironment(env);
 async function route(code){
  const row=await db.prepare("SELECT e.code,c.creator_id FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code=e.code WHERE e.code=? AND json_extract(e.payload,'$.visibility')='public' AND json_extract(e.payload,'$.published')=1 AND json_extract(e.payload,'$.status')='running'").bind(code).first();
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
 async function page(code,offset=0){
  const rows=await db.prepare(`SELECT substr(u.name,1,60) AS nickname,r.stars,r.comment,r.created_at AS createdAt,r.updated_at AS updatedAt
   FROM patrac_public_reviews r JOIN patrac_auth_user u ON u.id=r.user_id WHERE r.code=? AND r.environment=? ORDER BY r.created_at DESC,r.user_id ASC LIMIT 21 OFFSET ?`).bind(code,environment,offset).all();
  return{items:rows.results.slice(0,20),hasMore:rows.results.length>20,nextOffset:offset+20};
 }
 async function detail(code,user,ownerId){
  if(!await reviewsReady(db))return{ready:false,count:0,average:null,items:[],hasMore:false,ownReview:null,canReview:false};
  const own=user?await db.prepare('SELECT stars,comment FROM patrac_public_reviews WHERE code=? AND user_id=? AND environment=?').bind(code,user.id,environment).first():null;
  return{ready:true,...await summary(code),...await page(code),ownReview:own,canReview:await canReview(code,user,ownerId)};
 }
 async function list(code,offset){
  await route(code);if(!await reviewsReady(db))throw new GameError('Hodnocení právě připravujeme.',503);
  const value=offset===null?0:Number(offset);if(!Number.isSafeInteger(value)||value<0||value>10000)throw new GameError('Neplatná stránka hodnocení.');return page(code,value);
 }
 async function save(code,user,input){
  if(!user)throw new GameError('Pro hodnocení se přihlaste.',401);
  if(!await reviewsReady(db))throw new GameError('Hodnocení právě připravujeme.',503);
  const game=await route(code);
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
 return{detail,list,save};
}
