import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {createECDH,randomBytes} from 'node:crypto';
import ece from 'http_ece';
test('Worker encrypts real Web Push messages, queues committed events once, separates test payments, retries and removes expired endpoints',async()=>{
 const built=await build({stdin:{contents:`import * as p from './worker/lib/adminPush.mjs';import {env} from 'cloudflare:workers';export default {async fetch(request){const input=await request.json(),secret='local-push-test-secret-not-for-production-123456';let sent=[];try{if(input.action==='config')return Response.json(await p.pushConfig(env.DB,secret));if(input.action==='subscribe')return Response.json(await p.savePushSubscription(env.DB,input.userId||'admin',input,secret));if(input.action==='test')return Response.json(await p.testAdminPush(env.DB,secret,'admin',input.endpoint));if(input.action==='capture')await p.captureAdminPush(env.DB);if(input.action==='send')await p.sendAdminPush(env.DB,secret,{now:input.now||Date.now(),fetcher:async(url,options)=>{sent.push({url,headers:Object.fromEntries(new Headers(options.headers)),body:Buffer.from(options.body).toString('base64')});return new Response('',{status:input.status||201});}});if(input.action==='unsubscribe')await p.removePushSubscription(env.DB,'admin',input.endpoint);return Response.json(sent);}catch(e){return Response.json({error:e.message,code:e.code},{status:e.status||500});}}}`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
 let providerStatus=201;const realRequests=[];
 const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/push-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,outboundService:async request=>{realRequests.push({method:request.method,encoding:request.headers.get('content-encoding'),bodyLength:(await request.arrayBuffer()).byteLength});return new Response(providerStatus===201?'':JSON.stringify({reason:'BadJwtToken'}),{status:providerStatus});},d1Databases:['DB']});
 const api=async body=>{const r=await mf.dispatchFetch('http://localhost/',{method:'POST',body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();};
 try{
 const db=await mf.getD1Database('DB');
 for(const file of ['0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql'])for(const sql of readFileSync('drizzle/'+file,'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const now=Date.now();
 for(const id of ['admin','other']){await db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.com',now-1000,now).run();await db.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').bind(id,now).run();}
 const config=await api({action:'config'});assert.ok(config.public_key);assert.equal(config.private_key.includes(config.public_key),false);
 const client=createECDH('prime256v1');client.generateKeys();const auth=randomBytes(16).toString('base64url');
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/local-fixture',keys:{p256dh:client.getPublicKey().toString('base64url'),auth}};
 await api({action:'subscribe',subscription});
 const rejected=await mf.dispatchFetch('http://localhost/',{method:'POST',body:JSON.stringify({action:'subscribe',userId:'other',subscription})});assert.equal(rejected.status,409);
 const invalid=await mf.dispatchFetch('http://localhost/',{method:'POST',body:JSON.stringify({action:'subscribe',subscription:{...subscription,endpoint:'https://127.0.0.1/private'}})});assert.equal(invalid.status,400);
 const stamp=Date.now()+10;
 await db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)').bind('player','Nový hráč','private-email@example.com',stamp,stamp).run();
 await db.prepare("INSERT INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at,paid_at) VALUES('paid','player','test','test',3,19900,'price',?,?)").bind(stamp,stamp).run();
 await db.prepare("INSERT INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at) VALUES('unpaid','player','live','unpaid',3,19900,'price',?)").bind(stamp).run();
 await db.prepare("INSERT INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at,paid_at) VALUES('livepaid','player','live','livepaid',6,34900,'price',?,?)").bind(stamp,stamp).run();
 await api({action:'capture'});await api({action:'capture'});assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_push_deliveries').first()).n,3);
 const sent=await api({action:'send',now:stamp+100});assert.equal(sent.length,3);
 const payloads=sent.map(s=>{assert.equal(s.headers['content-encoding'],'aes128gcm');assert.match(s.headers.authorization,/vapid/);return JSON.parse(ece.decrypt(Buffer.from(s.body,'base64'),{version:'aes128gcm',privateKey:client,authSecret:auth}).toString());});
 assert.equal(payloads.find(p=>p.tag==='registration:player').title,'Nový hráč v Pátrači');assert.match(payloads.find(p=>p.tag==='payment:paid').title,/TESTOVACÍ/);assert.equal(JSON.stringify(payloads).includes('private-email'),false);assert.equal(payloads.find(p=>p.tag==='payment:livepaid').title,'Nová platba – Pátrač');
 assert.equal((await api({action:'send',now:stamp+200})).length,0);
 await db.prepare("INSERT INTO patrac_push_events VALUES('retry',?,?)").bind(JSON.stringify({title:'Retry',body:'retry',tag:'retry'}),stamp).run();
 await db.prepare("INSERT INTO patrac_push_deliveries(event_id,subscription_id) SELECT 'retry',id FROM patrac_admin_push").run();
 assert.equal((await api({action:'send',now:stamp+1000,status:503})).length,1);assert.equal((await api({action:'send',now:stamp+1100})).length,0);
 assert.equal((await api({action:'send',now:stamp+70000,status:410})).length,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_admin_push').first()).n,0);
 await api({action:'subscribe',subscription});await db.prepare("DELETE FROM patrac_admin_accounts WHERE user_id='admin'").run();
 await db.prepare("INSERT INTO patrac_push_events VALUES('revoked',?,?)").bind(JSON.stringify({title:'No role'}),Date.now()).run();await db.prepare("INSERT INTO patrac_push_deliveries(event_id,subscription_id) SELECT 'revoked',id FROM patrac_admin_push").run();assert.equal((await api({action:'send'})).length,0);
 await db.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').bind('admin',Date.now()).run();
 for(let i=0;i<12;i++){await db.prepare('INSERT INTO patrac_push_events VALUES(?,?,?)').bind('backlog:'+i,JSON.stringify({title:'Queued',tag:'backlog:'+i}),Date.now()).run();await db.prepare('INSERT INTO patrac_push_deliveries(event_id,subscription_id) SELECT ?,id FROM patrac_admin_push').bind('backlog:'+i).run();}
 await api({action:'test',endpoint:subscription.endpoint});assert.equal(realRequests.length,1);assert.equal(realRequests[0].method,'POST');assert.equal(realRequests[0].encoding,'aes128gcm');assert.equal(realRequests[0].bodyLength,4096);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM patrac_push_deliveries WHERE event_id LIKE 'backlog:%' AND done_at IS NOT NULL").first()).n,0);
 providerStatus=403;const failed=await mf.dispatchFetch('http://localhost/',{method:'POST',body:JSON.stringify({action:'test',endpoint:subscription.endpoint})});assert.equal(failed.status,503);const failure=await failed.json();assert.equal(failure.code,'PUSH_HTTP_403');assert.match(failure.error,/BadJwtToken/);assert.equal(failure.error.includes('Zkontrolujte oprávnění'),false);
 }finally{await mf.dispose();}
});
