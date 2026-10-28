import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRankingService} from '../worker/lib/communityRankings.mjs';
import {createReviewService,validateReview} from '../worker/lib/publicReviews.mjs';
import {createPublicService,communityReady} from '../worker/lib/publicExpeditions.mjs';
import {validateExpedition} from '../worker/lib/patrac-engine.mjs';
import {reserveExpedition,expeditionCount,removeExpedition} from '../worker/lib/expeditionLifecycle.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0004_billing.sql','0005_public_expeditions.sql','0006_public_reviews.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const statement=(sql,values=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async all(){return{results:native.prepare(sql).all(...values)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};}});
 const db={prepare:sql=>statement(sql),async batch(statements){native.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
 let stamp=Date.now();const users={};
 for(const id of ['author','alice','bob','unpaid']){native.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',stamp,stamp);users[id]={id,nickname:id,email:id+'@example.com'};if(id!=='unpaid')native.prepare("INSERT INTO patrac_access(user_id,environment,expires_at) VALUES(?,'test',?)").run(id,stamp+86400000);}
 const station={name:'Start',lat:49.3,lng:17.39,radius:25,question:'Secret riddle',answer:'secret answer',hints:[{type:'text',content:'Secret hint',minutes:2}]};
 const base={...validateExpedition({name:'Veřejná záhada',mode:'race',stations:[station,{...station,name:'Finish',lat:49.301,lng:17.391,question:'Second secret',answer:'finish answer'}]}),visibility:'public',published:true,status:'running',startedAt:null,publicInfo:{description:'Popis veřejné výpravy pro každého předplatitele.',difficulty:'easy',distanceKm:2,estimatedMinutes:40}};
 async function add(code,game={...base}){return reserveExpedition(db,{code,userId:'author',ownerHash:'owner-'+code,payload:JSON.stringify(game),now:stamp});}
 const env={PATRAC_STRIPE_MODE:'test',PATRAC_BILLING_ENABLED:'false'};
 const api=createPublicService({db,env,revealPhoto:async h=>({...h,content:'revealed photo'}),now:()=>stamp});
 return{native,db,api,env,users,base,add,tick:ms=>{stamp+=ms;},now:()=>stamp};
}
test('discovery reveals only the start and listing metadata, and ignores private or hidden routes',async()=>{
 const f=fixture();await f.add('ABCDEFG');await f.add('HJKLMNP',{...f.base,published:false});await f.add('QRSTUVX',{...f.base,visibility:'private'});
 const list=await f.api.listing();assert.equal(list.expeditions.length,1);assert.equal(list.expeditions[0].lat,49.3);const text=JSON.stringify(list);for(const hidden of ['secret answer','Secret riddle','Secret hint','49.301','stations','ownerHash','author@example.com'])assert.equal(text.includes(hidden),false,hidden);
 assert.equal((await f.api.listing('10,40,11,41')).expeditions.length,0);await assert.rejects(()=>f.api.listing('bad,bounds'));
 const detail=await f.api.detail('ABCDEFG',null);assert.equal(detail.attempt,null);assert.equal(detail.access.active,false);assert.deepEqual(detail.leaderboard,[]);await assert.rejects(()=>f.api.detail('HJKLMNP',null),e=>e.status===404);f.native.close();
});
test('starting requires payment even with billing disabled, explicit confirmation, and a non-author account',async()=>{
 const f=fixture();await f.add('ABCDEFG');
 await assert.rejects(()=>f.api.start('ABCDEFG',null,true),e=>e.status===401);
 await assert.rejects(()=>f.api.start('ABCDEFG',f.users.unpaid,true),e=>e.status===402);
 await assert.rejects(()=>f.api.start('ABCDEFG',f.users.author,true),e=>e.status===403);
 await assert.rejects(()=>f.api.start('ABCDEFG',f.users.alice,false));
 assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_public_attempts').get().n,0);f.native.close();
});
test('a repeated start resumes the same account attempt without resetting time, including after finish',async()=>{
 const f=fixture();await f.add('ABCDEFG');const first=await f.api.start('ABCDEFG',f.users.alice,true);f.tick(20000);const repeated=await f.api.start('ABCDEFG',{...f.users.alice,nickname:'New nickname'},true);
 assert.equal(repeated.attempt.id,first.attempt.id);assert.equal(repeated.attempt.startedAt,first.attempt.startedAt);assert.equal(repeated.reused,true);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_teams').get().n,1);
 await assert.rejects(()=>f.api.play('ABCDEFG',f.users.bob),e=>e.status===404);
 const view=await f.api.play('ABCDEFG',f.users.alice);assert.equal(view.team.station.question,undefined);assert.equal(JSON.stringify(view).includes('secret answer'),false);
 const fix=(lat=49.3,lng=17.39)=>({lat,lng,acc:5,timestamp:f.now()});
 await f.api.play('ABCDEFG',f.users.alice,{action:'arrive',index:0,position:fix()});
 const arrived=await f.api.play('ABCDEFG',f.users.alice);assert.equal(arrived.team.station.question,'Secret riddle');assert.equal(arrived.team.station.hints[0].content,undefined);
 await f.api.play('ABCDEFG',f.users.alice,{action:'hint',index:0,hintId:'h0'});await f.api.play('ABCDEFG',f.users.alice,{action:'hint',index:0,hintId:'h0'});
 f.tick(5000);await f.api.play('ABCDEFG',f.users.alice,{action:'answer',index:0,answer:'secret answer'});
 await f.api.play('ABCDEFG',f.users.alice,{action:'arrive',index:1,position:fix(49.301,17.391)});f.tick(5000);await f.api.play('ABCDEFG',f.users.alice,{action:'answer',index:1,answer:'finish answer'});
 const finished=await f.api.detail('ABCDEFG',f.users.alice);assert.equal(finished.leaderboard[0].totalMs,150000);assert.ok(finished.attempt.finishedAt);
 f.tick(60000);const final=await f.api.start('ABCDEFG',f.users.alice,true);assert.equal(final.attempt.id,first.attempt.id);assert.equal(final.attempt.totalMs,150000);
 assert.equal((await f.api.history(f.users.bob)).attempts.length,0);assert.equal((await f.api.history(f.users.alice)).attempts.length,1);f.native.close();
});
test('hiding blocks new players but preserves existing attempts; expired payment cannot continue or reset',async()=>{
 const f=fixture();await f.add('ABCDEFG');const first=await f.api.start('ABCDEFG',f.users.alice,true);
 f.native.exec("UPDATE patrac_expeditions SET payload=json_set(payload,'$.published',json('false')) WHERE code='ABCDEFG'");
 assert.equal((await f.api.listing()).expeditions.length,0);await assert.rejects(()=>f.api.start('ABCDEFG',f.users.bob,true),e=>e.status===404);
 assert.equal((await f.api.play('ABCDEFG',f.users.alice)).game.code,'ABCDEFG');
 f.native.exec("UPDATE patrac_access SET expires_at=0 WHERE user_id='alice'");await assert.rejects(()=>f.api.play('ABCDEFG',f.users.alice),e=>e.status===402);
 const history=await f.api.history(f.users.alice);assert.equal(history.attempts[0].id,first.attempt.id);assert.equal(history.attempts[0].hidden,true);
 f.native.exec("UPDATE patrac_access SET expires_at=9999999999999 WHERE user_id='alice'");assert.equal((await f.api.start('ABCDEFG',f.users.alice,true)).attempt.id,first.attempt.id);f.native.close();
});
test('private and public quotas are independent, and deletion clears account attempts with the route',async()=>{
 const f=fixture();for(const code of ['ABCDEFG','HJKLMNP'])assert.equal((await f.add(code))[1].meta.changes,1);
 assert.equal((await f.add('QRSTUVX'))[1].meta.changes,0);
 for(const code of ['QRSTUVX','YZABCDE','FGHJKLM'])assert.equal((await f.add(code,{...f.base,visibility:'private'}))[1].meta.changes,1);
 assert.equal(await expeditionCount(f.db,'author'),3);assert.equal(await expeditionCount(f.db,'author','public'),2);
 await f.api.start('ABCDEFG',f.users.alice,true);
 const row=f.native.prepare("SELECT version FROM patrac_expeditions WHERE code='ABCDEFG'").get();
 await removeExpedition(f.db,{list:async()=>({objects:[],truncated:false}),delete:async()=>{}},{code:'ABCDEFG',userId:'author',version:row.version,confirmation:'ABCDEFG'});
 assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_public_attempts').get().n,0);assert.equal(await expeditionCount(f.db,'author','public'),1);assert.equal(await expeditionCount(f.db,'author'),3);f.native.close();
});
test('TOP 10 excludes unfinished attempts and includes hint penalties, not just arrival time',async()=>{
 const f=fixture();await f.add('ABCDEFG');
 for(let i=0;i<13;i++){const id='p'+i;f.native.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,1,1)').run(id,id,id+'@example.com');const team={id,name:id,startedAt:1000,finishedAt:i===12?null:2000+i*100,penaltyMs:i===0?120000:0,index:2,events:[]};f.native.prepare('INSERT INTO patrac_teams VALUES(?,?,?,?,?,0)').run(id,'ABCDEFG','token'+id,id,JSON.stringify(team));f.native.prepare('INSERT INTO patrac_public_attempts(id,code,user_id,team_id,created_at) VALUES(?,?,?,?,?)').run(id,'ABCDEFG',id,id,1);}
 const top=(await f.api.detail('ABCDEFG',null)).leaderboard;assert.equal(top.length,10);assert.equal(top[0].nickname,'p1');assert.equal(top.some(v=>v.nickname==='p12'),false);assert.equal(top.some(v=>v.nickname==='p0'),false);f.native.close();
});

test('sandbox attempts and leaderboards do not consume a live attempt',async()=>{
 const f=fixture();await f.add('ABCDEFG');const testAttempt=await f.api.start('ABCDEFG',f.users.alice,true);
 f.native.prepare("INSERT INTO patrac_access(user_id,environment,expires_at) VALUES('alice','live',?)").run(f.now()+86400000);
 const live=createPublicService({db:f.db,env:{PATRAC_STRIPE_MODE:'live'},revealPhoto:async h=>h,now:f.now});
 assert.equal((await live.detail('ABCDEFG',f.users.alice)).attempt,null);assert.equal((await live.history(f.users.alice)).attempts.length,0);
 const actual=await live.start('ABCDEFG',f.users.alice,true);assert.notEqual(actual.attempt.id,testAttempt.attempt.id);
 assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_public_attempts').get().n,2);f.native.close();
});

test('reviews require completion, allow one editable rating, isolate accounts and environments, and update map averages',async()=>{
 const f=fixture();await f.add('ABCDEFG');const reviews=createReviewService({db:f.db,env:f.env,now:f.now});
 const input={action:'save',stars:5,comment:' Pěkná trasa! '};
 await assert.rejects(()=>reviews.save('ABCDEFG',null,input),e=>e.status===401);
 await assert.rejects(()=>reviews.save('ABCDEFG',f.users.author,input),e=>e.status===403);
 await assert.rejects(()=>reviews.save('ABCDEFG',f.users.alice,input),e=>e.status===403);
 for(const value of [0,6,1.5,'5',null])assert.throws(()=>validateReview({stars:value,comment:''}));
 assert.throws(()=>validateReview({stars:5,comment:'x'.repeat(1001)}));
 for(const user of [f.users.alice,f.users.bob]){
  await f.api.start('ABCDEFG',user,true);
  f.native.prepare("UPDATE patrac_teams SET payload=json_set(payload,'$.finishedAt',?) WHERE id=(SELECT team_id FROM patrac_public_attempts WHERE code=? AND user_id=?)").run(f.now(), 'ABCDEFG',user.id);
 }
 // A completed player may review after access expires; no extra purchase is needed to leave feedback.
 f.native.exec("UPDATE patrac_access SET expires_at=0 WHERE user_id='alice'");
 await reviews.save('ABCDEFG',f.users.alice,input);f.tick(1000);
 await reviews.save('ABCDEFG',f.users.alice,{action:'save',stars:3,comment:'<script>alert(1)</script>'});
 let detail=await f.api.detail('ABCDEFG',f.users.alice);assert.equal(detail.reviews.count,1);assert.equal(detail.reviews.average,3);assert.equal(detail.reviews.canReview,true);assert.equal(detail.reviews.ownReview.stars,3);assert.equal(detail.reviews.items[0].comment,'<script>alert(1)</script>');assert.ok(detail.reviews.items[0].updatedAt>detail.reviews.items[0].createdAt);
 await reviews.save('ABCDEFG',f.users.bob,{action:'save',stars:5,comment:''});
 assert.equal((await f.api.detail('ABCDEFG',null)).reviews.average,4);
 assert.deepEqual((await f.api.listing()).expeditions[0].rating,{count:2,average:4});
 const exposed=JSON.stringify((await f.api.detail('ABCDEFG',null)).reviews);for(const value of ['user_id','@example.com','alice@example.com'])assert.equal(exposed.includes(value),false);
 assert.equal((await f.api.detail('ABCDEFG',f.users.unpaid)).reviews.ownReview,null);
 const live=createReviewService({db:f.db,env:{PATRAC_STRIPE_MODE:'live'},now:f.now});assert.equal((await live.detail('ABCDEFG',f.users.alice,'author')).count,0);await assert.rejects(()=>live.save('ABCDEFG',f.users.alice,input),e=>e.status===403);
 await reviews.save('ABCDEFG',f.users.unpaid,{action:'delete',user_id:'bob'});assert.equal((await f.api.detail('ABCDEFG',null)).reviews.count,2);
 await reviews.save('ABCDEFG',f.users.alice,{action:'delete'});detail=await f.api.detail('ABCDEFG',null);assert.equal(detail.reviews.count,1);assert.equal(detail.reviews.average,5);
 await assert.rejects(()=>reviews.list('ABCDEFG','-1'));await assert.rejects(()=>reviews.list('ABCDEFG','1.5'));
 f.native.exec("UPDATE patrac_expeditions SET payload=json_set(payload,'$.published',0) WHERE code='ABCDEFG'");await assert.rejects(()=>reviews.save('ABCDEFG',f.users.bob,input),e=>e.status===404);await assert.rejects(()=>reviews.list('ABCDEFG','0'),e=>e.status===404);
 const row=f.native.prepare("SELECT version FROM patrac_expeditions WHERE code='ABCDEFG'").get();await removeExpedition(f.db,{list:async()=>({objects:[],truncated:false}),delete:async()=>{}},{code:'ABCDEFG',userId:'author',version:row.version,confirmation:'ABCDEFG'});assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_public_reviews').get().n,0);f.native.close();
});
test('reviews paginate without exposing account identifiers and tolerate a staged missing migration',async()=>{
 const f=fixture();await f.add('ABCDEFG');const reviews=createReviewService({db:f.db,env:f.env,now:f.now});
 for(let i=0;i<23;i++){const id='reviewer'+i;f.native.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',f.now(),f.now());f.native.prepare("INSERT INTO patrac_public_reviews VALUES(?,?,'test',5,?,?,?)").run('ABCDEFG',id,'Recenze '+i,f.now()+i,f.now()+i);}
 const first=await reviews.list('ABCDEFG','0');assert.equal(first.items.length,20);assert.equal(first.hasMore,true);const second=await reviews.list('ABCDEFG',String(first.nextOffset));assert.equal(second.items.length,3);assert.equal(second.hasMore,false);assert.equal(new Set([...first.items,...second.items].map(r=>r.nickname)).size,23);
 f.native.exec('DROP TABLE patrac_public_reviews');assert.equal((await f.api.detail('ABCDEFG',null)).reviews.ready,false);assert.equal((await f.api.listing()).expeditions.length,1);await assert.rejects(()=>reviews.save('ABCDEFG',f.users.alice,{action:'save',stars:5,comment:''}),e=>e.status===503);f.native.close();
});

test('community rankings compare public completed games, include penalties in own rank, and isolate private data',async()=>{
 const f=fixture();await f.add('ABCDEFG');await f.add('HJKLMNP');await f.add('QRSTUVX',{...f.base,visibility:'private'});
 const rankings=createRankingService({db:f.db,env:f.env}),reviews=createReviewService({db:f.db,env:f.env,now:f.now});
 async function finish(code,user,duration,penalty=0){const attempt=await f.api.start(code,user,true);f.native.prepare("UPDATE patrac_teams SET payload=json_set(payload,'$.finishedAt',?,'$.index',2,'$.penaltyMs',?) WHERE id=(SELECT team_id FROM patrac_public_attempts WHERE code=? AND user_id=?)").run(attempt.attempt.startedAt+duration,penalty,code,user.id);}
 await finish('ABCDEFG',f.users.alice,100000,120000);await finish('ABCDEFG',f.users.bob,180000);await finish('HJKLMNP',f.users.alice,100000);
 // Legacy/malformed records attached to a private game must never enter any public ranking.
 f.native.prepare('INSERT INTO patrac_teams VALUES(?,?,?,?,?,0)').run('private-team','QRSTUVX','private-token','private-name',JSON.stringify({startedAt:f.now(),finishedAt:f.now()+1,penaltyMs:0}));
 f.native.prepare("INSERT INTO patrac_public_attempts VALUES(?,?,?,?,?,'test')").run('private-attempt','QRSTUVX','unpaid','private-team',f.now());
 await reviews.save('ABCDEFG',f.users.alice,{action:'save',stars:5,comment:'Skvělé!'});await reviews.save('ABCDEFG',f.users.bob,{action:'save',stars:3,comment:''});await reviews.save('HJKLMNP',f.users.alice,{action:'save',stars:5,comment:''});
 const publicView=await rankings.overview(null);assert.equal(publicView.myResults,null);assert.equal(publicView.myExpeditions,null);assert.equal(publicView.ratedExpeditions[0].code,'HJKLMNP');assert.equal(publicView.ratedExpeditions[1].average,4);assert.equal(publicView.ratedExpeditions[1].count,2);
 assert.equal(publicView.activePlayers[0].nickname,'alice');assert.equal(publicView.activePlayers[0].completed,2);assert.equal(publicView.activePlayers[1].completed,1);assert.equal(publicView.activePlayers[1].rank,2);
 const created=await rankings.overview(f.users.author);assert.equal(created.myExpeditions.length,2);assert.equal(created.myExpeditions.find(g=>g.code==='ABCDEFG').rank,2);assert.equal(created.myExpeditions.find(g=>g.code==='ABCDEFG').completed,2);assert.equal(created.myExpeditions.find(g=>g.code==='HJKLMNP').rank,1);
 const own=await rankings.overview(f.users.alice);assert.deepEqual(own.myExpeditions,[]);assert.equal(own.myResults.stats.completed,2);assert.equal(own.myResults.stats.activityRank,1);assert.ok(own.activePlayers.find(p=>p.isMe&&p.nickname==='alice'));
 const slower=own.myResults.items.find(i=>i.code==='ABCDEFG');assert.equal(slower.rank,2);assert.equal(slower.finishers,2);assert.equal(slower.totalMs,220000);assert.equal(slower.penaltyMs,120000);assert.equal(slower.elapsedMs,100000);
 const bob=await rankings.results(f.users.bob);assert.equal(bob.items.length,1);assert.equal(bob.items[0].rank,1);assert.equal(bob.items[0].totalMs,180000);
 await assert.rejects(()=>rankings.results(null),e=>e.status===401);await assert.rejects(()=>rankings.results(f.users.alice,'-1'));await assert.rejects(()=>rankings.results(f.users.alice,'1.5'));
 const safe=JSON.stringify(publicView);for(const field of ['user_id','@example.com','Secret riddle','secret answer','lat','lng','private-team','unpaid'])assert.equal(safe.includes(field),false,field);
 f.native.exec("UPDATE patrac_expeditions SET payload=json_set(payload,'$.published',0) WHERE code='HJKLMNP'");
 const hiddenAuthor=await rankings.overview(f.users.author);const hiddenOwn=hiddenAuthor.myExpeditions.find(g=>g.code==='HJKLMNP');assert.equal(hiddenOwn.rank,null);assert.equal(hiddenOwn.published,false);assert.equal(hiddenOwn.rating.average,5);assert.equal(hiddenOwn.completed,1);
 const hidden=await rankings.overview(f.users.alice);assert.equal(hidden.ratedExpeditions.length,1);assert.equal(hidden.myResults.stats.completed,2);assert.equal(hidden.myResults.items.find(i=>i.code==='HJKLMNP').hidden,true);assert.equal(hidden.activePlayers.length,2);assert.equal(hidden.activePlayers[0].completed,2);assert.equal(hidden.activePlayers[0].rank,1);assert.equal(hidden.activePlayers[1].completed,1);
 const live=await createRankingService({db:f.db,env:{PATRAC_STRIPE_MODE:'live'}}).overview(f.users.alice);assert.equal(live.activePlayers.length,0);assert.equal(live.ratedExpeditions.length,0);assert.equal(live.myResults.items.length,0);
 f.native.exec('DROP TABLE patrac_public_reviews');assert.equal((await rankings.overview(null)).ratingsReady,false);f.native.close();
});

test('personal rankings paginate and show the real position beyond TOP 10; missing schema is staged safely',async()=>{
 const f=fixture();await f.add('ABCDEFG');const rankings=createRankingService({db:f.db,env:f.env});
 function attempt(code,user,id,duration){f.native.prepare('INSERT INTO patrac_teams VALUES(?,?,?,?,?,0)').run('team-'+id,code,'token-'+id,'key-'+id,JSON.stringify({startedAt:f.now(),finishedAt:f.now()+duration,penaltyMs:0}));f.native.prepare("INSERT INTO patrac_public_attempts VALUES(?,?,?,?,?,'test')").run('attempt-'+id,code,user,'team-'+id,f.now());}
 for(let i=0;i<24;i++){const id='finisher-'+i;f.native.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',f.now(),f.now());attempt('ABCDEFG',id,id,1000+i);}
 attempt('ABCDEFG','alice','alice-first',999999);
 const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 for(let i=0;i<21;i++){const code='ZZZZZA'+alphabet[i];f.native.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').run(code,'owner-'+code,JSON.stringify({...f.base,published:false}));f.native.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').run(code,'author',f.now());attempt(code,'alice','alice-'+i,2000+i);}
 const first=await rankings.results(f.users.alice);assert.equal(first.items.length,20);assert.equal(first.hasMore,true);const last=await rankings.results(f.users.alice,String(first.nextOffset));assert.equal(last.items.length,2);assert.equal(last.hasMore,false);assert.equal(new Set([...first.items,...last.items].map(i=>i.code)).size,22);
 const actual=[...first.items,...last.items].find(i=>i.code==='ABCDEFG');assert.equal(actual.rank,25);assert.equal(actual.finishers,25);assert.equal(first.items[0].code,'ABCDEFG');assert.equal((await rankings.overview(null)).activePlayers.length,20);
 f.native.exec('DROP TABLE patrac_public_attempts');assert.equal((await rankings.overview(null)).ready,false);f.native.close();
});
