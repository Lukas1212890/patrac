import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {hashPassword} from 'better-auth/crypto';
test('Worker HTTP admin routes enforce origins and real session roles before exposing account data',async()=>{
  const built=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
  const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/admin-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PATRAC_AUTH_SECRET:'local-admin-worker-test-key-never-used-in-production',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000',PATRAC_REGISTRATION_READY:'false'}});
  const request=(path,body,token,origin='http://localhost:3000')=>mf.dispatchFetch('http://localhost:8790'+path,{method:body?'POST':'GET',headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json',...(token?{'X-Patrac-Account':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  try{
    assert.equal((await request('/api/admin/users')).status,401);
    assert.equal((await request('/api/admin/users',{action:'revoke',id:'admin'},null,'')).status,403);
    const db=await mf.getD1Database('DB');
    for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0003_account_admin.sql']){
      for(const sql of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
    }
    const stamp=Date.now(),password='native-worker-admin-test-password-923',hash=await hashPassword(password);
    for(const id of ['admin','regular']){
      await db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.com',stamp,stamp).run();
      await db.prepare('INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,\'credential\',?,?,?,?)').bind(id,id,id,hash,stamp,stamp).run();
    }
    await db.prepare('INSERT INTO patrac_admin_accounts(user_id,created_at) VALUES(?,?)').bind('admin',stamp).run();
    async function login(id){const r=await request('/api/auth/sign-in/email',{email:id+'@example.com',password});assert.equal(r.status,200,await r.clone().text());return r.headers.get('set-auth-token');}
    const admin=await login('admin'),regular=await login('regular');
    assert.equal((await request('/api/admin/users',null,regular)).status,403);
    assert.equal((await request('/api/admin/users',null,admin,'https://untrusted.example')).status,403);
    const result=await request('/api/admin/users',null,admin);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store, private');
    const users=await result.json();assert.equal(users.total,2);assert.equal(JSON.stringify(users).includes(hash),false);
    const detail=await(await request('/api/admin/users/regular',null,admin)).json();
    const changed=await request('/api/admin/users',{action:'update',id:'regular',name:'Nové jméno',email:'regular@example.com',updatedAt:detail.user.updatedAt},admin);
    assert.equal(changed.status,200,await changed.clone().text());
    assert.equal((await(await request('/api/admin/users/regular',null,admin)).json()).user.name,'Nové jméno');
    const current=(await(await request('/api/admin/users/regular',null,admin)).json()).user;
    const emailChange=await request('/api/admin/users',{action:'update',id:'regular',name:current.name,email:'updated@example.com',updatedAt:current.updatedAt},admin);
    assert.equal(emailChange.status,200,await emailChange.clone().text());
    assert.equal((await request('/api/admin/users',null,regular)).status,401);
  }finally{await mf.dispose();}
});
