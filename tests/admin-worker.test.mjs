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
    for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0009_player_accounts.sql','0003_account_admin.sql']){
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
    assert.equal((await request('/api/admin/push')).status,401);
    assert.equal((await request('/api/admin/push',null,regular)).status,403);
    const pushConfigResponse=await request('/api/admin/push',null,admin);assert.equal(pushConfigResponse.status,200);const pushConfig=await pushConfigResponse.json();assert.match(pushConfig.publicKey,/^[A-Za-z0-9_-]{87}$/);assert.deepEqual(Object.keys(pushConfig),['publicKey']);
    assert.equal((await request('/api/admin/push',{action:'subscribe'},regular)).status,403);
    assert.equal((await request('/api/admin/push',{action:'subscribe'},admin,'')).status,403);
    assert.equal((await request('/api/admin/push',{action:'subscribe'},admin)).status,400);

    assert.equal((await request('/api/admin/users',null,regular)).status,403);
    assert.equal((await request('/api/admin/users',null,admin,'https://untrusted.example')).status,403);
    const result=await request('/api/admin/users',null,admin);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store, private');
    const users=await result.json();assert.equal(users.total,2);assert.equal(JSON.stringify(users).includes(hash),false);
    const detail=await(await request('/api/admin/users/regular',null,admin)).json();
    const changed=await request('/api/admin/users',{action:'update',id:'regular',name:'Nové jméno',email:'regular@example.com',updatedAt:detail.user.updatedAt},admin);
    assert.equal(changed.status,200,await changed.clone().text());
    assert.equal((await(await request('/api/admin/users/regular',null,admin)).json()).user.name,'Nové jméno');
    const current=(await(await request('/api/admin/users/regular',null,admin)).json()).user;
    await db.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').bind('ABCDEFG','owner-hash',JSON.stringify({name:'Testovací výprava',visibility:'private',status:'waiting',stations:[]})).run();
    await db.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').bind('ABCDEFG','regular',stamp).run();
    const bucket=await mf.getR2Bucket('BUCKET');await bucket.put('hints/ABCDEFG/photo','image');await bucket.put('hints/HJKLMNP/keep','image');
    const deletion={action:'delete-expedition',id:'regular',code:'ABCDEFG',confirmation:'ABCDEFG',version:0,reason:'Výprava vede na uzavřený soukromý pozemek.',requestKey:crypto.randomUUID()};
    assert.equal((await request('/api/admin/users',deletion,regular)).status,403);
    assert.equal((await request('/api/admin/users',{...deletion,reason:''},admin)).status,400);
    assert.equal((await request('/api/account/notices')).status,401);
    assert.equal((await(await request('/api/admin/users/regular',null,admin)).json()).games[0].version,0);
    assert.equal((await request('/api/admin/runtime-mode',null,regular)).status,403);
    assert.equal((await request('/api/admin/runtime-mode',{mode:'live',version:0,confirm:true},regular)).status,403);
    const runtimeState=await request('/api/admin/runtime-mode',null,admin);assert.equal(runtimeState.status,200);const modeState=await runtimeState.json();assert.equal(modeState.ready,false);assert.equal(modeState.live.configured,false);assert.equal(JSON.stringify(modeState).includes('sk_live_'),false);
    const deleted=await request('/api/admin/users',deletion,admin);assert.equal(deleted.status,200,await deleted.clone().text());
    assert.ok(await bucket.get('hints/ABCDEFG/photo'));
    await db.prepare("UPDATE patrac_expeditions SET payload=json_set(payload,'$.deleteAt',?) WHERE code=?").bind(Date.now()-1,'ABCDEFG').run();
    await request('/api/account',null,regular);
    const noticeResponse=await request('/api/account/notices',null,regular);assert.equal(noticeResponse.status,200);assert.equal(noticeResponse.headers.get('cache-control'),'no-store, private');const notices=await noticeResponse.json();assert.equal(notices.notices.length,1);assert.equal(notices.notices[0].reason,deletion.reason);assert.equal(notices.notices[0].name,'Testovací výprava');assert.equal(JSON.stringify(notices).includes('admin@example.com'),false);
    assert.equal((await(await request('/api/account/notices?userId=regular',null,admin)).json()).notices.length,0);
    assert.equal((await request('/api/admin/users',deletion,admin)).status,200);assert.equal((await(await request('/api/account/notices',null,regular)).json()).notices.length,1);
    assert.equal(await bucket.get('hints/ABCDEFG/photo'),null);assert.ok(await bucket.get('hints/HJKLMNP/keep'));
    assert.equal((await db.prepare('SELECT code FROM patrac_expeditions WHERE code=?').bind('ABCDEFG').first()),null);
    assert.equal((await(await request('/api/admin/users/regular',null,admin)).json()).audit.filter(a=>a.action==='delete-expedition'&&a.status==='success').length,1);
    const emailInput={action:'update',id:'regular',name:current.name,email:'updated@example.com',updatedAt:current.updatedAt};
    let denied=await request('/api/admin/users',emailInput,admin);assert.equal(denied.status,428);
    denied=await request('/api/admin/users',{...emailInput,adminPassword:'wrong'},admin);assert.equal(denied.status,403);
    const emailChange=await request('/api/admin/users',{...emailInput,adminPassword:password},admin);
    assert.equal(emailChange.status,200,await emailChange.clone().text());
    assert.equal((await request('/api/admin/users',null,regular)).status,401);
  }finally{await mf.dispose();}
});
