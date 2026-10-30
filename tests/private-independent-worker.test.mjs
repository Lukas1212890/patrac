import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {hashPassword} from 'better-auth/crypto';
import {validateExpedition,newTeam} from '../worker/lib/patrac-engine.mjs';
test('private code allows independent timed starts, pre-start abandonment, concurrent players and editing only when no one is playing',async()=>{
 const built=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
 const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/private-independent-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PATRAC_AUTH_SECRET:'local-private-play-key-not-for-production-123456',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000',PATRAC_REGISTRATION_READY:'false',PATRAC_BILLING_ENABLED:'false'}});
 const req=(path,body,token)=>mf.dispatchFetch('http://localhost:8790'+path,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(token?{'X-Patrac-Account':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const ok=async(path,body,token)=>{const r=await req(path,body,token);assert.ok(r.status<300,await r.clone().text());return r.json();};
 try{
 const db=await mf.getD1Database('DB');for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql','0005_public_expeditions.sql','0006_public_reviews.sql','0007_creator_rewards.sql','0008_creator_limits.sql','0009_player_accounts.sql','0011_runtime_mode.sql'])for(const sql of readFileSync('drizzle/'+file,'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const stamp=Date.now(),password='private-test-password-123456',hash=await hashPassword(password),tokens={};
 for(const id of ['owner','alice','bob','charlie']){await db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.com',stamp,stamp).run();await db.prepare("INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,'credential',?,?,?,?)").bind(id,id,id,hash,stamp,stamp).run();const login=await req('/api/auth/sign-in/email',{email:id+'@example.com',password});assert.equal(login.status,200);tokens[id]=login.headers.get('set-auth-token');}
 await db.prepare("INSERT INTO patrac_access(user_id,environment,expires_at,version) VALUES('owner','test',?,0)").bind(Date.now()+90*86400000).run();
 const draft={name:'Soukromá cesta',visibility:'private',mode:'race',stations:[{name:'Dub',lat:49.3,lng:17.39,radius:25,question:'Kolik?',answer:'jedna',hints:[{type:'text',content:'První číslo',minutes:10}]}]};
 const created=await ok('/api/expeditions',draft,tokens.owner),path='/api/expeditions/'+created.code;
 for(const id of ['alice','bob','charlie'])await ok(path,{action:'join'},tokens[id]);
 let alice=await ok(path,null,tokens.alice);assert.equal(alice.game.status,'running');assert.equal(alice.game.startedAt,null);assert.equal(alice.team.station.name,'Dub');assert.equal(alice.team.station.question,undefined);assert.equal((await ok(path,null,tokens.owner)).activePlayers,0);
 const arrive=()=>({action:'arrive',index:0,position:{lat:49.3,lng:17.39,acc:2,timestamp:Date.now()}});
 assert.equal((await req(path,arrive(),tokens.alice)).status,409);
 await ok(path,{action:'abandon',confirm:true},tokens.charlie);assert.ok((await ok(path,null,tokens.charlie)).team.abandonedAt);assert.equal((await req(path,{action:'begin',confirm:true},tokens.charlie)).status,409);
 await ok(path,{action:'begin',confirm:true},tokens.alice);const first=(await ok(path,null,tokens.alice)).team.startedAt;await ok(path,{action:'begin',confirm:true},tokens.alice);assert.equal((await ok(path,null,tokens.alice)).team.startedAt,first);
 await db.prepare("UPDATE patrac_teams SET payload=json_set(payload,'$.startedAt',?) WHERE code=? AND user_id='alice'").bind(Date.now()-600000,created.code).run();
 await ok(path,{action:'begin',confirm:true},tokens.bob);const bob=await ok(path,null,tokens.bob);alice=await ok(path,null,tokens.alice);assert.ok(bob.team.startedAt>alice.team.startedAt);assert.equal((await ok(path,null,tokens.owner)).activePlayers,2);
 let owner=await ok(path,null,tokens.owner);assert.equal((await req(path,{action:'save',version:owner.version,game:draft},tokens.owner)).status,409);
 await ok(path,{action:'abandon',confirm:true},tokens.alice);await ok(path,arrive(),tokens.bob);await ok(path,{action:'hint',index:0,hintId:'h0'},tokens.bob);await ok(path,{action:'solution',index:0},tokens.bob);await ok(path,{action:'answer',index:0,answer:'jedna'},tokens.bob);
 const finished=await ok(path,null,tokens.bob);assert.ok(finished.team.finishedAt);assert.equal(finished.team.penaltyMs,40*60000);owner=await ok(path,null,tokens.owner);assert.equal(owner.activePlayers,0);await ok(path,{action:'save',version:owner.version,game:{...draft,name:'Upravená cesta'}},tokens.owner);
 assert.equal((await req('/api/expeditions',{...draft,mode:'treasure'},tokens.owner)).status,400);
 const legacy={...validateExpedition(draft),visibility:'private',status:'waiting',startedAt:null};
 await db.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').bind('ABCDEFG','owner-key',JSON.stringify(legacy)).run();await db.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').bind('ABCDEFG','owner',Date.now()).run();await ok('/api/expeditions/ABCDEFG',{action:'join'},tokens.alice);await ok('/api/expeditions/ABCDEFG',{action:'abandon',confirm:true},tokens.alice);assert.ok((await ok('/api/expeditions/ABCDEFG',null,tokens.alice)).team.abandonedAt);
 const commonStart=Date.now()-60000;legacy.status='running';legacy.startedAt=commonStart;await db.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').bind('HJKLMNP','owner-key',JSON.stringify(legacy)).run();await db.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').bind('HJKLMNP','owner',Date.now()).run();const old=newTeam('old-play','bob',commonStart);await db.prepare('INSERT INTO patrac_teams(id,code,token_hash,name_key,payload,version,user_id) VALUES(?,?,?,?,?,0,?)').bind(old.id,'HJKLMNP','old-token','account:bob',JSON.stringify(old),'bob').run();assert.equal((await ok('/api/expeditions/HJKLMNP',null,tokens.bob)).game.startedAt,commonStart);
 await ok('/api/expeditions/HJKLMNP',{action:'join'},tokens.alice);assert.equal((await ok('/api/expeditions/HJKLMNP',null,tokens.alice)).game.startedAt,null);
 await db.prepare("UPDATE patrac_expeditions SET payload=json_set(payload,'$.startedAt',?) WHERE code='HJKLMNP'").bind(Date.now()-72*3600000).run();const prepared=await ok('/api/expeditions/HJKLMNP',null,tokens.alice);assert.equal(prepared.team.abandonedAt,undefined);assert.equal(prepared.game.startedAt,null);
 }finally{await mf.dispose();}
});
