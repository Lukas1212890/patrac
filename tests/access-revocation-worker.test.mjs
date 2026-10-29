import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {hashPassword} from 'better-auth/crypto';
test('HTTP preview, atomic D1 revoke and player notice work through authenticated Worker routes',async()=>{
 const built=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
 const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/access-revoke-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PATRAC_AUTH_SECRET:'local-access-revoke-test-key-not-production-923',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000',PATRAC_REGISTRATION_READY:'false',PATRAC_BILLING_ENABLED:'true',PATRAC_STRIPE_MODE:'test'}});
 const request=(path,body,token)=>mf.dispatchFetch('http://localhost:8790'+path,{method:body?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(token?{'X-Patrac-Account':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
 const db=await mf.getD1Database('DB');
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0009_player_accounts.sql','0003_account_admin.sql','0004_billing.sql'])for(const sql of readFileSync('drizzle/'+file,'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 const stamp=Date.now(),password='worker-test-revoke-password-123',hash=await hashPassword(password),tokens={};
 for(const id of ['admin','player']){
 await db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.com',stamp,stamp).run();
 await db.prepare("INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,'credential',?,?,?,?)").bind(id,id,id,hash,stamp,stamp).run();
 const login=await request('/api/auth/sign-in/email',{email:id+'@example.com',password});assert.equal(login.status,200);tokens[id]=login.headers.get('set-auth-token');
 }
 await db.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').bind('admin',stamp).run();
 const gift={action:'access',id:'player',environment:'test',months:12,reason:'Testovací hráč',version:0,requestKey:'worker-gift-request-123'};
 let response=await request('/api/admin/users',gift,tokens.admin);assert.equal(response.status,200,await response.clone().text());
 const path='/api/admin/users/player/access-preview?grant=access_worker-gift-request-123';
 assert.equal((await request(path,null,tokens.player)).status,403);
 response=await request(path,null,tokens.admin);assert.equal(response.status,200,await response.clone().text());const preview=await response.json();assert.equal(preview.plans.length,2);assert.equal(JSON.stringify(preview).includes('segments'),false);
 const input={action:'access-revoke',id:'player',environment:'test',reference:preview.reference,reason:'Oprava přiděleného přístupu',versions:Object.fromEntries(preview.plans.map(p=>[p.environment,p.version])),requestKey:'worker-revoke-request-123'};
 assert.equal((await request('/api/admin/users',input,tokens.player)).status,403);
 response=await request('/api/admin/users',input,tokens.admin);assert.equal(response.status,200,await response.clone().text());
 assert.equal((await request('/api/admin/users',input,tokens.admin)).status,200);
 const detail=await(await request('/api/admin/users/player',null,tokens.admin)).json();assert.equal(detail.billing.active,false);assert.ok(detail.billing.subscription.history[0].revokedAt);
 const notices=await(await request('/api/account/notices?format=3',null,tokens.player)).json();assert.equal(notices.notices.filter(n=>n.type==='access-revoke').length,1);assert.equal(notices.notices.find(n=>n.type==='access-revoke').reason,input.reason);
 const users=await(await request('/api/admin/users?source=admin&status=active',null,tokens.admin)).json();assert.equal(users.total,0);
 }finally{await mf.dispose();}
});
