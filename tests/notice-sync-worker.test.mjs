import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {hashPassword} from 'better-auth/crypto';

test('notice reads persist across devices, isolate accounts and preserve newly delivered notices',async()=>{
 const built=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
 const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/notice-sync-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PATRAC_AUTH_SECRET:'notice-sync-local-test-secret-not-production',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000',PATRAC_REGISTRATION_READY:'false'}});
 const request=(path,data,token)=>mf.dispatchFetch('http://localhost:8790'+path,{method:data?'POST':'GET',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(token?{'X-Patrac-Account':token}:{})},...(data?{body:JSON.stringify(data)}:{})});
 try{
  const db=await mf.getD1Database('DB');
  for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0009_player_accounts.sql','0003_account_admin.sql'])for(const sql of readFileSync('drizzle/'+file,'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const stamp=Date.now(),password='local-notices-test-password-349',hash=await hashPassword(password);
  for(const id of ['alice','bob']){
   await db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.com',stamp,stamp).run();
   await db.prepare("INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,'credential',?,?,?,?)").bind(id,id,id,hash,stamp,stamp).run();
  }
  const add=async(id,user)=>db.prepare("INSERT INTO patrac_admin_audit VALUES(?,'admin',?,'limits',?,'success',?)").bind(id,user,JSON.stringify({oldPrivateLimit:3,oldPublicLimit:2,privateLimit:5,publicLimit:2}),stamp).run();
  await add('a1','alice');await add('a2','alice');await add('b1','bob');
  async function login(id){const r=await request('/api/auth/sign-in/email',{email:id+'@example.com',password});assert.equal(r.status,200,await r.clone().text());return r.headers.get('set-auth-token');}
  const phone=await login('alice'),computer=await login('alice'),bob=await login('bob');
  const inbox=async token=>{const r=await request('/api/account/notices?format=3',null,token);assert.equal(r.status,200,await r.clone().text());return r.json();};
  assert.equal((await request('/api/account/notices/read',{readIds:['typed-v2:a1']})).status,401);
  assert.deepEqual((await inbox(computer)).readIds,[]);
  let r=await request('/api/account/notices/read',{readIds:['typed-v2:a1']},phone);assert.equal(r.status,200,await r.clone().text());
  assert.deepEqual((await inbox(computer)).readIds,['typed-v2:a1']);
  // A second device acknowledges all visible notices; repeating writes is idempotent.
  for(let i=0;i<2;i++)assert.equal((await request('/api/account/notices/read',{readIds:['typed-v2:a1','typed-v2:a2']},computer)).status,200);
  assert.deepEqual((await inbox(phone)).readIds.sort(),['typed-v2:a1','typed-v2:a2']);
  await request('/api/account/notices/read',{readIds:['typed-v2:a1']},bob);
  assert.deepEqual((await inbox(bob)).readIds,[]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_notice_reads').first()).n,2);
  await add('a3','alice');const fresh=await inbox(computer);assert.equal(fresh.notices.length,3);assert.equal(fresh.readIds.includes('typed-v2:a3'),false);
  assert.equal((await request('/api/account/notices/read',{readIds:'all'},phone)).status,400);
 }finally{await mf.dispose();}
});
