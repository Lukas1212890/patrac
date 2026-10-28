import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {hashPassword} from 'better-auth/crypto';
import {newTeam} from '../worker/lib/patrac-engine.mjs';
test('Worker community flow enforces real sessions, two public slots, one concurrent account attempt and locked routes',async()=>{
 const built=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
 const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/public-worker-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PATRAC_AUTH_SECRET:'local-community-worker-key-not-for-production-8642',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000',PATRAC_BILLING_ENABLED:'true',PATRAC_STRIPE_MODE:'test',PATRAC_REGISTRATION_READY:'false'}});
 const request=(path,body,token)=>mf.dispatchFetch('http://localhost:8790'+path,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(token?{'X-Patrac-Account':token,...(path.startsWith('/api/auth/')?{Authorization:'Bearer '+token}:{})}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  const db=await mf.getD1Database('DB');for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0009_player_accounts.sql','0003_account_admin.sql','0004_billing.sql','0008_creator_limits.sql'])for(const sql of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split(';').map(v=>v.trim()).filter(Boolean))await db.prepare(sql).run();
  const before=await(await request('/api/public/expeditions')).json();assert.equal(before.ready,false);
  for(const sql of readFileSync(new URL('../drizzle/0005_public_expeditions.sql',import.meta.url),'utf8').split(';').map(v=>v.trim()).filter(Boolean))await db.prepare(sql).run();
  for(const sql of readFileSync(new URL('../drizzle/0006_public_reviews.sql',import.meta.url),'utf8').split(';').map(v=>v.trim()).filter(Boolean))await db.prepare(sql).run();
  for(const sql of readFileSync(new URL('../drizzle/0007_creator_rewards.sql',import.meta.url),'utf8').split(';').map(v=>v.trim()).filter(Boolean))await db.prepare(sql).run();
  const password='public-worker-fixture-password-long-8642',hash=await hashPassword(password),stamp=Date.now(),tokens={};
  for(const id of ['author','player','unpaid']){
   await db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.com',stamp,stamp).run();
   await db.prepare("INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,'credential',?,?,?,?)").bind(id,id,id,hash,stamp,stamp).run();
   if(id!=='unpaid')await db.prepare("INSERT INTO patrac_access(user_id,environment,expires_at) VALUES(?,'test',?)").bind(id,stamp+86400000).run();
   const login=await request('/api/auth/sign-in/email',{email:id+'@example.com',password});assert.equal(login.status,200);tokens[id]=login.headers.get('set-auth-token');
  }
  const station={name:'Start',lat:49.3,lng:17.39,radius:25,question:'Secret one',answer:'first',hints:[{type:'text',content:'Secret hint',minutes:2}]};
  const game={name:'Veřejná výprava',mode:'race',visibility:'public',timeEstimateOverride:null,publicInfo:{description:'Výprava pro všechny předplatitele do přírody.',difficulty:'easy',distanceKm:1,estimatedMinutes:30},stations:[station,{...station,name:'Druhá zastávka',lat:49.301,lng:17.391,answer:'last'}]};
  const create=await request('/api/expeditions',game,tokens.author);assert.equal(create.status,201,await create.clone().text());const {code}=await create.json();
  const initialRoute=await(await request('/api/expeditions/'+code,null,tokens.author)).json();assert.equal(initialRoute.game.routeInfo.timeEstimateSource,'automatic');assert.equal(initialRoute.game.routeInfo.estimatedMinutes,15);assert.ok(initialRoute.game.routeInfo.distanceMeters>100&&initialRoute.game.routeInfo.distanceMeters<200);
  const manualSave=await request('/api/expeditions/'+code,{action:'save',version:initialRoute.version,game:{...game,timeEstimateOverride:75,publicInfo:{...game.publicInfo,distanceKm:999,estimatedMinutes:999}}},tokens.author);assert.equal(manualSave.status,200,await manualSave.clone().text());
  const manualRoute=await(await request('/api/expeditions/'+code,null,tokens.author)).json();assert.equal(manualRoute.game.routeInfo.estimatedMinutes,75);assert.equal(manualRoute.game.publicInfo.timeEstimateSource,'author');assert.ok(manualRoute.game.publicInfo.distanceKm<1);
  assert.equal((await request('/api/expeditions/'+code,{action:'save',version:manualRoute.version,game:{...game,timeEstimateOverride:''}},tokens.author)).status,400);
  assert.equal((await request('/api/expeditions/'+code,{action:'save',version:manualRoute.version,game},tokens.author)).status,200);
  assert.equal((await request('/api/expeditions',game,tokens.unpaid)).status,402);
  assert.equal((await request('/api/expeditions',game,tokens.author)).status,201);assert.equal((await request('/api/expeditions',game,tokens.author)).status,409);
  for(let i=0;i<3;i++)assert.equal((await request('/api/expeditions',{...game,visibility:'private'},tokens.author)).status,201);
  const profile=await(await request('/api/account',null,tokens.author)).json();assert.equal(profile.expeditionCount,3);assert.equal(profile.publicExpeditionCount,2);
  await db.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').bind('author',stamp).run();
  const limitInput={action:'limits',id:'author',privateLimit:5,publicLimit:4,version:0,reason:'Individuální nastavení účtu školy.',requestKey:crypto.randomUUID()};
  assert.equal((await request('/api/admin/users',limitInput,tokens.player)).status,403);
  const limitsSaved=await request('/api/admin/users',limitInput,tokens.author);assert.equal(limitsSaved.status,200,await limitsSaved.clone().text());
  const customProfile=await(await request('/api/account',null,tokens.author)).json();assert.equal(customProfile.expeditionLimit,5);assert.equal(customProfile.publicExpeditionLimit,4);
  assert.equal((await request('/api/expeditions',game,tokens.author)).status,201);assert.equal((await request('/api/expeditions',{...game,visibility:'private'},tokens.author)).status,201);
  assert.equal((await request('/api/admin/users',{...limitInput,privateLimit:0,publicLimit:0,version:1,requestKey:crypto.randomUUID()},tokens.author)).status,200);
  assert.equal((await request('/api/expeditions',{...game,expeditionLimit:1000},tokens.author)).status,409);assert.equal((await request('/api/expeditions',{...game,visibility:'private',expeditionLimit:1000},tokens.author)).status,409);
  const zeroProfile=await(await request('/api/account',null,tokens.author)).json();assert.equal(zeroProfile.expeditionCount,4);assert.equal(zeroProfile.publicExpeditionCount,3);assert.equal(zeroProfile.expeditionLimit,0);assert.equal(zeroProfile.publicExpeditionLimit,0);
  const oldToken='f'.repeat(64),oldHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(oldToken))),b=>b.toString(16).padStart(2,'0')).join('');
  await db.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').bind('YZABCDE',oldHash,JSON.stringify({...game,visibility:'private'})).run();
  const claim=await(await request('/api/account',{action:'claim',games:[{code:'YZABCDE',token:oldToken}],expeditionLimit:1000},tokens.author)).json();assert.equal(claim.linked,0);assert.equal(claim.limitReached,true);assert.equal(claim.expeditionLimit,0);
  assert.equal((await(await request('/api/public/expeditions')).json()).expeditions.length,0);
  assert.equal((await request('/api/expeditions/'+code,{action:'publish'},tokens.player)).status,403);
  assert.equal((await request('/api/expeditions/'+code,{action:'publish'},tokens.author)).status,200);
  const listing=await(await request('/api/public/expeditions')).json();assert.equal(listing.expeditions.length,1);assert.equal(listing.expeditions[0].timeEstimateSource,'automatic');assert.equal(listing.expeditions[0].estimatedMinutes,15);assert.equal(JSON.stringify(listing).includes('routePayload'),false);assert.equal(JSON.stringify(listing).includes('first'),false);assert.equal(JSON.stringify(listing).includes('49.301'),false);
  assert.equal((await request('/api/public/expeditions/'+code+'/start',{confirm:true})).status,401);
  assert.equal((await request('/api/public/expeditions/'+code+'/start',{confirm:true},tokens.unpaid)).status,402);
  assert.equal((await request('/api/public/expeditions/'+code+'/start',{confirm:true},tokens.author)).status,403);
  assert.equal((await request('/api/expeditions/'+code,{action:'join',name:'Bypass',teamToken:'a'.repeat(64)})).status,403);
  const starts=await Promise.all([request('/api/public/expeditions/'+code+'/start',{confirm:true,userId:'unpaid'},tokens.player),request('/api/public/expeditions/'+code+'/start',{confirm:true},tokens.player)]);
  for(const response of starts)assert.equal(response.status,200,await response.clone().text());
  const first=await starts[0].json(),second=await starts[1].json();assert.equal(first.attempt.id,second.attempt.id);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_public_attempts').first()).n,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_teams WHERE code=?').bind(code).first()).n,1);
  const owner=await(await request('/api/expeditions/'+code,null,tokens.author)).json();assert.equal(owner.publicLocked,true);
  assert.equal((await request('/api/expeditions/'+code,{action:'save',game,version:owner.version},tokens.author)).status,409);
  const play=await(await request('/api/public/expeditions/'+code+'/play',null,tokens.player)).json();assert.equal(play.team.station.question,undefined);assert.equal(play.game.startedAt,first.attempt.startedAt);assert.equal(JSON.stringify(play).includes('"last"'),false);
  assert.equal((await request('/api/public/expeditions/'+code+'/play',{action:'answer',index:0,answer:'first'},tokens.player)).status,403);
  const arrive=await request('/api/public/expeditions/'+code+'/play',{action:'arrive',index:0,position:{lat:49.3,lng:17.39,acc:5,timestamp:Date.now()}},tokens.player);assert.equal(arrive.status,200,await arrive.clone().text());
  const riddle=await(await request('/api/public/expeditions/'+code+'/play',null,tokens.player)).json();assert.equal(riddle.team.station.question,'Secret one');assert.equal(riddle.team.station.hints[0].content,undefined);
  assert.equal((await request('/api/auth/update-user',{name:'New nickname'},tokens.player)).status,403);
  assert.equal((await request('/api/account',{action:'nickname',name:'New nickname',oldName:'player',password,acknowledge:true},tokens.player)).status,200);
  const repeated=await(await request('/api/public/expeditions/'+code+'/start',{confirm:true},tokens.player)).json();assert.equal(repeated.attempt.id,first.attempt.id);assert.equal(repeated.attempt.startedAt,first.attempt.startedAt);
  const reviewPath='/api/public/expeditions/'+code+'/reviews';
  assert.equal((await request(reviewPath,{action:'save',stars:5,comment:'Pěkné!'})).status,401);
  assert.equal((await request(reviewPath,{action:'save',stars:5,comment:'Pěkné!'},tokens.player)).status,403);
  await request('/api/public/expeditions/'+code+'/play',{action:'answer',index:0,answer:'first'},tokens.player);
  await request('/api/public/expeditions/'+code+'/play',{action:'arrive',index:1,position:{lat:49.301,lng:17.391,acc:5,timestamp:Date.now()}},tokens.player);
  for(let i=0;i<99;i++){const id='reward-player-'+i,team='reward-team-'+i;await db.batch([
   db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,'ZZ hráč '+i,id+'@example.com',stamp,stamp),
   db.prepare('INSERT INTO patrac_teams(id,code,token_hash,name_key,payload,version) VALUES(?,?,?,?,?,0)').bind(team,code,'token-'+team,'name-'+team,JSON.stringify({...newTeam(team,'ZZ hráč '+i,stamp),startedAt:stamp-999999,finishedAt:stamp-1,penaltyMs:0,index:2})),
   db.prepare("INSERT INTO patrac_public_attempts VALUES(?,?,?,?,?,'test')").bind(team,code,id,team,stamp),
  ]);}
  assert.equal((await request('/api/public/expeditions/'+code+'/play',{action:'answer',index:1,answer:'last'},tokens.player)).status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_creator_rewards').first()).n,1);
  const rewardAccess=await db.prepare("SELECT * FROM patrac_access WHERE user_id='author' AND environment='test'").first();assert.equal(rewardAccess.version,1);assert.ok(rewardAccess.expires_at>stamp+30*86400000);
  const rewardProfile=await(await request('/api/billing',null,tokens.author)).json();assert.equal(rewardProfile.creatorRewards.awardedMonths,2);assert.equal(rewardProfile.creatorRewards.expeditions.find(g=>g.code===code).nextMilestone,200);
  await request('/api/public/expeditions/'+code+'/play',{action:'answer',index:1,answer:'last'},tokens.player);
  const scheduledOutcome=await (await mf.getWorker()).scheduled({cron:'0 * * * *'});assert.equal(scheduledOutcome.outcome,'ok');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_creator_rewards').first()).n,1);

  assert.equal((await request(reviewPath,{action:'save',stars:6,comment:''},tokens.player)).status,400);
  const posted=await request(reviewPath,{action:'save',stars:5,comment:'Pěkná výprava!'},tokens.player);assert.equal(posted.status,200,await posted.clone().text());
  const rated=await(await request('/api/public/expeditions/'+code)).json();assert.equal(rated.reviews.average,5);assert.equal(rated.reviews.count,1);assert.equal(rated.reviews.items[0].nickname,'New nickname');assert.equal(rated.reviews.ownReview,null);
  assert.equal((await request(reviewPath,{action:'save',stars:5,comment:''},tokens.author)).status,403);
  assert.equal((await(await request(reviewPath)).json()).items.length,1);
  const board=await(await request('/api/public/rankings',null,tokens.player)).json();assert.equal(board.ready,true);assert.equal(board.ratedExpeditions[0].code,code);assert.equal(board.activePlayers[0].nickname,'New nickname');assert.equal(board.myResults.items[0].rank,1);assert.equal(board.myResults.stats.completed,1);assert.deepEqual(board.myExpeditions,[]);const accountNotices=await(await request('/api/account/notices',null,tokens.author)).json();assert.ok(accountNotices.notices.some(n=>n.type==='reward'&&n.code===code&&n.months===2&&n.milestone===100));assert.ok(accountNotices.notices.some(n=>n.type==='limits'&&n.privateLimit===0));assert.equal(JSON.stringify(accountNotices).includes('actor_id'),false);const authorBoard=await(await request('/api/public/rankings',null,tokens.author)).json();assert.equal(authorBoard.myExpeditions.length,3);assert.equal(authorBoard.myExpeditions.find(g=>g.code===code).rating.average,5);assert.equal(authorBoard.creatorRewards.awardedMonths,2);
  assert.equal((await(await request('/api/public/rankings')).json()).myResults,null);assert.equal((await request('/api/public/results')).status,401);assert.equal((await(await request('/api/public/results',null,tokens.unpaid)).json()).items.length,0);
  assert.equal((await request('/api/expeditions/'+code,{action:'hide'},tokens.author)).status,200);assert.equal((await(await request('/api/public/expeditions')).json()).expeditions.length,0);assert.equal((await request('/api/public/expeditions/'+code+'/play',null,tokens.player)).status,200);
  assert.equal((await(await request('/api/public/attempts',null,tokens.unpaid)).json()).attempts.length,0);
  const finalOwner=await(await request('/api/expeditions/'+code,null,tokens.author)).json();
  assert.equal((await request('/api/expeditions/'+code,{action:'delete',version:finalOwner.version,confirmation:code},tokens.author)).status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_public_attempts').first()).n,0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_public_reviews').first()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_creator_rewards').first()).n,1);
  assert.equal((await request('/api/public/expeditions/'+code+'/play',null,tokens.player)).status,404);
 }finally{await mf.dispose();}
});
