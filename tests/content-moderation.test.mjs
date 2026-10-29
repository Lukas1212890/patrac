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
