import {reportContent,reportsList,moderateExpedition,hideReportedComment,resolveReport} from '../worker/lib/contentModeration.mjs';
import {creatorNotices} from '../worker/lib/creatorNotices.mjs';
import {createAdminService,AdminError} from '../worker/lib/adminService.mjs';
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
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0004_billing.sql','0005_public_expeditions.sql','0006_public_reviews.sql','0010_review_replies.sql','0003_account_admin.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
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

test('report validation, deduplication, snapshots and resolving preserve playable games',async()=>{
 const f=fixture();await f.add('ABCDEFG');
 const send=(user,input)=>reportContent({db:f.db,env:f.env,user,code:'ABCDEFG',input,now:f.now()});
 const input={kind:'expedition',reason:'danger',description:'Nebezpečná cesta přes staveniště.'};
 await assert.rejects(()=>send(null,input),e=>e.status===401);
 await assert.rejects(()=>send(f.users.alice,{...input,description:'a'}));
 await send(f.users.alice,input);await assert.rejects(()=>send(f.users.alice,input),e=>e.status===429);
 const reports=(await reportsList(f.db)).reports;assert.equal(reports.length,1);assert.equal(reports[0].ownerId,'author');
 assert.equal((await f.api.listing()).expeditions.length,1);
 await resolveReport(f.db,{id:reports[0].id,resolution:'Prověřeno, cesta je bezpečná.'},f.now());assert.equal((await reportsList(f.db)).reports.length,0);
 f.native.close();
});
test('safety suspension blocks discovery and active play, cannot be bypassed by stale version, restores same attempt',async()=>{
 const f=fixture();await f.add('ABCDEFG');const first=await f.api.start('ABCDEFG',f.users.alice,true);
 const mod=async(action,version)=>moderateExpedition({db:f.db,actor:{id:'author'},user:{id:'author'},input:{action,code:'ABCDEFG',version,reason:'Nebezpečný vstup na uzavřený most'},now:f.now,ErrorType:AdminError});
 let version=f.native.prepare('SELECT version FROM patrac_expeditions').get().version;
 await mod('suspend-expedition',version);
 assert.equal((await f.api.listing()).expeditions.length,0);
 await assert.rejects(()=>f.api.detail('ABCDEFG',f.users.alice),e=>e.status===404);
 await assert.rejects(()=>f.api.play('ABCDEFG',f.users.alice),e=>e.status===403);
 await assert.rejects(()=>mod('restore-expedition',version),e=>e.status===409);
 assert.equal((await creatorNotices(f.db,'author','test')).notices[0].type,'suspend-expedition');
 version=f.native.prepare('SELECT version FROM patrac_expeditions').get().version;await mod('restore-expedition',version);
 assert.equal((await f.api.listing()).expeditions.length,1);
 assert.equal((await f.api.start('ABCDEFG',f.users.alice,true)).attempt.id,first.attempt.id);
 const service=createAdminService({db:f.db,getSession:async()=>({user:{id:'alice',emailVerified:true},session:{createdAt:f.now()}}),now:f.now});
 await assert.rejects(()=>service.change({}, {action:'suspend-expedition',id:'author'}),e=>e.status===403);
 f.native.close();
});
test('comment report snapshot blocks stale removal; moderation preserves stars and records reason',async()=>{
 const f=fixture();await f.add('ABCDEFG');
 f.native.prepare("INSERT INTO patrac_public_reviews(code,user_id,environment,stars,comment,created_at,updated_at) VALUES('ABCDEFG','alice','test',2,'Nevhodný komentář',?,?)").run(f.now(),f.now());
 const key=f.native.prepare('SELECT rowid FROM patrac_public_reviews').get().rowid;
 await reportContent({db:f.db,env:f.env,user:f.users.bob,code:'ABCDEFG',input:{kind:'review',reviewKey:key,reason:'abuse',description:'Komentář obsahuje osobní útok.'},now:f.now()});
 const report=(await reportsList(f.db)).reports[0];
 f.native.prepare("UPDATE patrac_public_reviews SET comment='Upravený text'").run();
 const input={id:report.id,reason:'Odstraněno pro osobní útok'};
 await assert.rejects(()=>hideReportedComment({db:f.db,actor:{id:'author'},input,now:f.now()}),e=>e.status===409);
 f.native.prepare("UPDATE patrac_public_reviews SET comment='Nevhodný komentář'").run();
 await hideReportedComment({db:f.db,actor:{id:'author'},input,now:f.now()});
 const review=f.native.prepare('SELECT stars,comment FROM patrac_public_reviews').get();assert.equal(review.stars,2);assert.equal(review.comment,'');
 assert.equal((await reportsList(f.db)).reports.length,0);
 const notice=(await creatorNotices(f.db,'alice','test')).notices[0];assert.equal(notice.type,'hide-comment');assert.equal(notice.reason,input.reason);
 f.native.close();
});

test('resolved reports remain searchable with moderator identity; filtering and pagination happen in SQL',async()=>{
 const f=fixture();await f.add('ABCDEFG');
 await reportContent({db:f.db,env:f.env,user:f.users.alice,code:'ABCDEFG',input:{kind:'expedition',reason:'danger',description:'První nahlášený problém'},now:f.now()});
 const report=(await reportsList(f.db)).reports[0];
 await resolveReport(f.db,{id:report.id,resolution:'Místo prověřeno, přístupná cesta.'},f.now(),'author');
 const resolved=await reportsList(f.db,{status:'resolved',environment:'test'});
 assert.equal(resolved.total,1);assert.equal(resolved.reports[0].resolvedBy,'author');assert.match(resolved.reports[0].resolution,/prověřeno/);
 assert.equal((await reportsList(f.db,{status:'resolved',environment:'live'})).total,0);
 for(let i=0;i<30;i++)f.native.prepare('INSERT INTO patrac_content_reports(id,user_id,code,environment,kind,reason,description,snapshot,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('extra-'+i,'alice','ABCDEFG',i%2?'live':'test','expedition','other','Popis problému',JSON.stringify({name:'Výprava'}),f.now()+i);
 const first=await reportsList(f.db),second=await reportsList(f.db,{page:1});
 assert.equal(first.total,30);assert.equal(first.pending,30);assert.equal(first.reports.length,25);assert.equal(first.hasMore,true);assert.equal(second.reports.length,5);assert.equal(second.hasMore,false);
 assert.equal(new Set([...first.reports,...second.reports].map(r=>r.id)).size,30);
 assert.equal((await reportsList(f.db,{environment:'live'})).total,15);
 await assert.rejects(()=>reportsList(f.db,{status:'unexpected'}));await assert.rejects(()=>reportsList(f.db,{page:-1}));
 f.native.close();
});
test('players see suspension reason in their own history; unrelated accounts never receive the attempt',async()=>{
 const f=fixture();await f.add('ABCDEFG');await f.api.start('ABCDEFG',f.users.alice,true);
 const version=f.native.prepare('SELECT version FROM patrac_expeditions').get().version;
 await moderateExpedition({db:f.db,actor:{id:'author'},user:{id:'author'},input:{action:'suspend-expedition',code:'ABCDEFG',version,reason:'Uzavřená cesta'},now:f.now,ErrorType:AdminError});
 assert.equal((await f.api.history(f.users.alice)).attempts[0].suspensionReason,'Uzavřená cesta');
 assert.equal((await f.api.history(f.users.bob)).attempts.length,0);
 f.native.close();
});

test('moderation notices target active participants only, preserve environment and survive completion or route removal',async()=>{
 const f=fixture();await f.add('ABCDEFG');await f.add('HJKLMNP',{...f.base,visibility:'private'});
 await f.api.start('ABCDEFG',f.users.alice,true);await f.api.start('ABCDEFG',f.users.bob,true);
 f.native.prepare("UPDATE patrac_teams SET payload=json_set(payload,'$.finishedAt',?) WHERE name_key='public:test:bob'").run(f.now());
 f.native.exec('ALTER TABLE patrac_teams ADD COLUMN user_id TEXT');
 f.native.prepare('INSERT INTO patrac_teams(id,code,token_hash,name_key,payload,user_id) VALUES(?,?,?,?,?,?)').run('private-bob','HJKLMNP','hash','bob',JSON.stringify({startedAt:f.now(),events:[],index:0}),'bob');
 async function mod(code,action){const version=f.native.prepare('SELECT version FROM patrac_expeditions WHERE code=?').get(code).version;return moderateExpedition({db:f.db,actor:{id:'author'},user:{id:'author'},input:{action,code,version,reason:'Prověření bezpečnosti trasy'},now:f.now,ErrorType:AdminError});}
 await mod('ABCDEFG','suspend-expedition');await mod('HJKLMNP','suspend-expedition');
 const types=async(user,env)=> (await creatorNotices(f.db,user,env)).notices.filter(n=>n.type.startsWith('player-'));
 assert.equal((await types('alice','test')).length,1);assert.equal((await types('alice','live')).length,0);
 assert.equal((await types('bob','test')).length,1);assert.equal((await types('bob','live')).length,1);assert.equal((await types('bob','test'))[0].code,'HJKLMNP');
 assert.equal((await types('unpaid','test')).length,0);
 f.tick(1000);await mod('ABCDEFG','restore-expedition');
 assert.deepEqual((await types('alice','test')).map(n=>n.type),['player-restore','player-suspend']);
 f.native.prepare("UPDATE patrac_teams SET payload=json_set(payload,'$.finishedAt',?) WHERE code='ABCDEFG'").run(f.now());
 const captured=await types('alice','test');
 f.native.exec("DELETE FROM patrac_public_attempts WHERE code='ABCDEFG';DELETE FROM patrac_teams WHERE code='ABCDEFG';DELETE FROM patrac_creator_games WHERE code='ABCDEFG';DELETE FROM patrac_expeditions WHERE code='ABCDEFG';");
 assert.deepEqual(await types('alice','test'),captured);
 f.native.close();
});
test('resolved report notice belongs only to reporter and uses a stable identifier across reads',async()=>{
 const f=fixture();await f.add('ABCDEFG');
 await reportContent({db:f.db,env:f.env,user:f.users.alice,code:'ABCDEFG',input:{kind:'expedition',reason:'other',description:'Prosím prověřte tuto výpravu.'},now:f.now()});
 const report=(await reportsList(f.db)).reports[0];
 await resolveReport(f.db,{id:report.id,resolution:'Prověřeno a upraveno.'},f.now(),'author');
 const filter=async(id,environment)=>(await creatorNotices(f.db,id,environment)).notices.filter(n=>n.type==='report-resolved');
 const notices=await filter('alice','test');assert.equal(notices.length,1);assert.equal(notices[0].resolution,'Prověřeno a upraveno.');
 assert.deepEqual(await filter('alice','test'),notices);assert.equal((await filter('alice','live')).length,0);assert.equal((await filter('bob','test')).length,0);
 const {markNoticeReads,noticeReads}=await import('../worker/lib/noticeReads.mjs');const {noticeReadId}=await import('../shared/noticeReadState.mjs');
 await markNoticeReads(f.db,'alice',notices,[noticeReadId(notices[0])]);assert.deepEqual(await noticeReads(f.db,'alice',await filter('alice','test')),[noticeReadId(notices[0])]);
 f.native.close();
});
test('failure to record participant notices rolls back suspension and its audit',async()=>{
 const f=fixture();await f.add('ABCDEFG');await f.api.start('ABCDEFG',f.users.alice,true);
 const {moderationNoticesReady}=await import('../worker/lib/moderationNotices.mjs');await moderationNoticesReady(f.db);
 f.native.exec("CREATE TRIGGER reject_moderation_notice BEFORE INSERT ON patrac_moderation_notices BEGIN SELECT RAISE(ABORT,'fixture failure');END;");
 const version=f.native.prepare('SELECT version FROM patrac_expeditions').get().version;
 await assert.rejects(()=>moderateExpedition({db:f.db,actor:{id:'author'},user:{id:'author'},input:{action:'suspend-expedition',code:'ABCDEFG',version,reason:'Nebezpečný most'},now:f.now,ErrorType:AdminError}));
 assert.equal(JSON.parse(f.native.prepare('SELECT payload FROM patrac_expeditions').get().payload).moderation,undefined);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_admin_audit').get().n,0);
 f.native.close();
});

test('existing historical resolution notes are not published retroactively as notifications',async()=>{
 const f=fixture();await f.add('ABCDEFG');
 await reportContent({db:f.db,env:f.env,user:f.users.alice,code:'ABCDEFG',input:{kind:'expedition',reason:'other',description:'Hlášení před aktualizací služby'},now:f.now()});
 f.native.prepare('UPDATE patrac_content_reports SET resolved_at=?,resolution=?').run(f.now(),'Historická poznámka správce');
 const notices=(await creatorNotices(f.db,'alice','test')).notices;assert.equal(notices.some(n=>n.type==='report-resolved'),false);
 f.native.close();
});
