import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { hashPassword } from 'better-auth/crypto';
import { createAccountAuth } from '../worker/lib/accountAuth.mjs';
import { createAdminService } from '../worker/lib/adminService.mjs';
const password='test-admin-password-long-enough-782';
function d1(native){
  const statement=(sql,values=[])=>({bind:(...next)=>statement(sql,next),async first(){return native.prepare(sql).get(...values)||null;},async all(){return{results:native.prepare(sql).all(...values)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};}});
  return{prepare:sql=>statement(sql),async batch(statements){native.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());native.exec('COMMIT');return result;}catch(e){native.exec('ROLLBACK');throw e;}}};
}
async function fixture(mailFailure=false,billingMode=null){
  const db=new DatabaseSync(':memory:');
  for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0009_player_accounts.sql','0003_account_admin.sql','0004_billing.sql'])db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const hash=await hashPassword(password),stamp=Date.now(),sent=[];
  for(const [id,email,name]of[['admin','admin@example.com','Správce'],['target','target@example.com','Tvůrce'],['regular','regular@example.com','Běžný účet']]){
    db.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').run(id,name,email,stamp,stamp);
    db.prepare('INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(?,?,\'credential\',?,?,?,?)').run(id,id,id,hash,stamp,stamp);
  }
  db.prepare('INSERT INTO patrac_admin_accounts(user_id,created_at) VALUES(?,?)').run('admin',stamp);
  const auth=createAccountAuth({DB:db,PATRAC_AUTH_SECRET:'local-admin-auth-test-key-never-used-on-production',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000',sendMail:async()=>{}});
  async function login(email){const r=await auth.handler(new Request('http://localhost:8790/api/auth/sign-in/email',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email,password})}));assert.equal(r.status,200);return new Request('http://localhost/admin',{headers:{'X-Patrac-Account':r.headers.get('set-auth-token')}});}
  const admin=await login('admin@example.com'),regular=await login('regular@example.com'),target=await login('target@example.com');
  let clock=Date.now();
  const service=createAdminService({db:d1(db),billingMode,getSession:req=>auth.api.getSession({headers:new Headers({Authorization:'Bearer '+(req.headers.get('x-patrac-account')||'')})}),sendReset:async email=>{if(mailFailure)throw Error('Mail unavailable');sent.push({kind:'reset',email});},sendVerification:async email=>{if(mailFailure)throw Error('Mail unavailable');sent.push({kind:'verify',email});},now:()=>clock});
  return{db,auth,service,admin,regular,target,sent,login,setClock:value=>{clock=value;}};
}
test('anonymous, regular and forged sessions cannot list or edit accounts; results contain no credentials',async()=>{
  const f=await fixture();
  for(const req of [new Request('http://localhost/'),f.regular,new Request('http://localhost/',{headers:{'X-Patrac-Account':'forged.admin'}})]){
    await assert.rejects(()=>f.service.list(req),e=>[401,403].includes(e.status));
    await assert.rejects(()=>f.service.change(req,{action:'reset',id:'target'}),e=>[401,403].includes(e.status));
  }
  assert.equal(f.sent.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM patrac_admin_audit').get().n,0);
  const result=await f.service.list(f.admin);assert.equal(result.total,3);assert.equal(result.users.length,3);
  const text=JSON.stringify(result);assert.equal(text.includes(password),false);assert.equal(text.includes('token'),false);assert.equal(text.includes('password'),false);
  f.db.close();
});
test('search escapes wildcards; edited names are audited; stale versions and duplicate emails are rejected',async()=>{
  const f=await fixture();
  assert.equal((await f.service.list(f.admin,{q:'target@'})).total,1);
  assert.equal((await f.service.list(f.admin,{q:'%'})).total,0);
  const before=(await f.service.detail(f.admin,'target')).user;
  await f.service.change(f.admin,{action:'update',id:'target',name:'Nová přezdívka',email:before.email,updatedAt:before.updatedAt});
  assert.equal(f.db.prepare('SELECT name FROM patrac_auth_user WHERE id=\'target\'').get().name,'Nová přezdívka');
  await assert.rejects(()=>f.service.change(f.admin,{action:'update',id:'target',name:'Přepsat',email:before.email,updatedAt:before.updatedAt}),e=>e.status===409);
  const current=(await f.service.detail(f.admin,'target')).user;
  await assert.rejects(()=>f.service.change(f.admin,{action:'update',id:'target',name:'Jméno',email:'admin@example.com',updatedAt:current.updatedAt}),e=>e.code==='ADMIN_EMAIL_TAKEN');
  assert.equal((await f.service.detail(f.admin,'target')).audit[0].status,'success');f.db.close();
});
test('changed email is unverified, sessions are revoked and verification is sent only to the stored new address',async()=>{
  const f=await fixture(),before=(await f.service.detail(f.admin,'target')).user;
  f.db.prepare("INSERT INTO patrac_auth_verification(id,identifier,value,expiresAt,createdAt,updatedAt) VALUES('old-reset','reset-password:old-token','target',?,?,?)").run(Date.now()+600000,Date.now(),Date.now());
  await f.service.change(f.admin,{action:'update',id:'target',name:before.name,email:'NEW@example.com',updatedAt:before.updatedAt});
  const row=f.db.prepare('SELECT email,emailVerified FROM patrac_auth_user WHERE id=\'target\'').get();
  assert.equal(row.email,'new@example.com');assert.equal(row.emailVerified,0);
  assert.equal(f.db.prepare("SELECT id FROM patrac_auth_verification WHERE identifier='reset-password:old-token'").get(),undefined);
  assert.equal(await f.auth.api.getSession({headers:new Headers({Authorization:'Bearer '+f.target.headers.get('x-patrac-account')})}),null);
  assert.deepEqual(f.sent,[{kind:'verify',email:'new@example.com'}]);f.db.close();
});
test('mail actions cannot use a supplied recipient and are rate-limited; revocation invalidates signed sessions',async()=>{
  const f=await fixture();
  for(let i=0;i<3;i++)await f.service.change(f.admin,{action:'reset',id:'target',email:'attacker@example.net'});
  await assert.rejects(()=>f.service.change(f.admin,{action:'reset',id:'target'}),e=>e.status===429);
  assert.ok(f.sent.every(x=>x.email==='target@example.com'));
  await f.service.change(f.admin,{action:'revoke',id:'target'});
  assert.equal(await f.auth.api.getSession({headers:new Headers({Authorization:'Bearer '+f.target.headers.get('x-patrac-account')})}),null);f.db.close();
});
test('old admin sessions can read but cannot mutate until a fresh login; membership does not follow the email',async()=>{
  const f=await fixture();f.setClock(Date.now()+16*60*1000);
  assert.equal((await f.service.list(f.admin)).total,3);
  await assert.rejects(()=>f.service.change(f.admin,{action:'reset',id:'target'}),e=>e.code==='ADMIN_REAUTH_REQUIRED');
  assert.equal(f.sent.length,0);f.setClock(Date.now());
  const before=(await f.service.detail(f.admin,'admin')).user;
  await f.service.change(f.admin,{action:'update',id:'admin',name:before.name,email:'new-admin@example.com',updatedAt:before.updatedAt});
  f.db.prepare('UPDATE patrac_auth_user SET emailVerified=1 WHERE id=\'admin\'').run();
  f.db.prepare('UPDATE patrac_auth_user SET email=\'admin@example.com\' WHERE id=\'regular\'').run();
  const attacker=await f.login('admin@example.com');
  await assert.rejects(()=>f.service.list(attacker),e=>e.status===403);
  const returned=await f.login('new-admin@example.com');assert.equal((await f.service.session(returned)).user.id,'admin');f.db.close();
});

test('a failed mail does not pretend an email edit was rolled back, and removed admin membership takes effect immediately',async()=>{
  const f=await fixture(true),before=(await f.service.detail(f.admin,'target')).user;
  const result=await f.service.change(f.admin,{action:'update',id:'target',name:before.name,email:'changed@example.com',updatedAt:before.updatedAt});
  assert.equal(result.ok,true);assert.equal(result.warning,true);
  assert.equal(f.db.prepare('SELECT email FROM patrac_auth_user WHERE id=\'target\'').get().email,'changed@example.com');
  assert.equal((await f.service.detail(f.admin,'target')).audit[0].status,'saved_mail_failed');
  f.db.prepare('DELETE FROM patrac_admin_accounts WHERE user_id=\'admin\'').run();
  await assert.rejects(()=>f.service.list(f.admin),e=>e.status===403);f.db.close();
});
test('ISO date revisions are accepted and names cannot inject SQL',async()=>{
  const f=await fixture(),stamp=new Date().toISOString();
  f.db.prepare('UPDATE patrac_auth_user SET updatedAt=? WHERE id=\'target\'').run(stamp);
  await f.service.change(f.admin,{action:'update',id:'target',name:"Robert'); DROP TABLE patrac_auth_user;--",email:'target@example.com',updatedAt:stamp});
  assert.equal((await f.service.list(f.admin)).total,3);
  const row=f.db.prepare('SELECT updatedAt FROM patrac_auth_user WHERE id=\'target\'').get();assert.ok(Number.isFinite(row.updatedAt));f.db.close();
});

function accessInput(extra={}){return {action:'access',id:'target',environment:'test',months:3,reason:'Dárek pro testování',version:0,requestKey:crypto.randomUUID(),...extra};}
test('admin sees current environment access and orders; manual grants are audited and idempotent without fake payments',async()=>{
 const f=await fixture(false,'test'),input=accessInput();
 const before=(await f.service.detail(f.admin,'target')).billing;assert.equal(before.active,false);assert.equal(before.version,0);
 const first=await f.service.change(f.admin,input);assert.equal(first.ok,true);
 const detail=await f.service.detail(f.admin,'target');assert.equal(detail.billing.active,true);assert.equal(detail.billing.environment,'test');assert.equal(detail.billing.version,1);assert.equal(detail.billing.orders.length,0);
 const audit=detail.audit[0];assert.equal(audit.action,'access');assert.equal(audit.status,'success');assert.equal(JSON.parse(audit.details).reason,input.reason);
 await f.service.change(f.admin,input);assert.equal((await f.service.detail(f.admin,'target')).billing.expiresAt,detail.billing.expiresAt);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM patrac_admin_audit WHERE action='access'").get().n,1);
 await assert.rejects(()=>f.service.change(f.admin,{...input,months:6}),e=>e.status===409);assert.equal(f.sent.length,0);f.db.close();
});
test('regular and stale sessions cannot grant; input cannot cross environments or select invalid periods',async()=>{
 const f=await fixture(false,'test');
 await assert.rejects(()=>f.service.change(f.regular,accessInput()),e=>e.status===403);
 f.setClock(Date.now()+16*60*1000);await assert.rejects(()=>f.service.change(f.admin,accessInput()),e=>e.code==='ADMIN_REAUTH_REQUIRED');f.setClock(Date.now());
 for(const input of [accessInput({environment:'live'}),accessInput({months:1}),accessInput({reason:''}),accessInput({version:-1}),accessInput({requestKey:'bad'})])await assert.rejects(()=>f.service.change(f.admin,input));
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM patrac_access').get().n,0);f.db.close();
});
test('manual extension adds to active access, and stale edits cannot overwrite a payment or another administrator',async()=>{
 const f=await fixture(false,'test');await f.service.change(f.admin,accessInput());
 const before=(await f.service.detail(f.admin,'target')).billing;
 await assert.rejects(()=>f.service.change(f.admin,accessInput()),e=>e.code==='ADMIN_CONFLICT');
 await f.service.change(f.admin,accessInput({months:6,version:before.version}));
 const after=(await f.service.detail(f.admin,'target')).billing;assert.ok(after.expiresAt>before.expiresAt);assert.equal(after.version,2);
 f.db.prepare("UPDATE patrac_access SET expires_at=expires_at+1000,version=version+1 WHERE user_id='target'").run();
 await assert.rejects(()=>f.service.change(f.admin,accessInput({version:after.version})),e=>e.code==='ADMIN_CONFLICT');assert.equal((await f.service.detail(f.admin,'target')).billing.expiresAt,after.expiresAt+1000);f.db.close();
});
test('a failed access transaction rolls back its audit and can be retried safely',async()=>{
 const f=await fixture(false,'test'),input=accessInput();
 f.db.exec("CREATE TRIGGER simulate_access_failure BEFORE UPDATE ON patrac_access BEGIN SELECT RAISE(ABORT,'fixture failure');END");
 await assert.rejects(()=>f.service.change(f.admin,input));assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM patrac_admin_audit WHERE action='access'").get().n,0);assert.equal((await f.service.detail(f.admin,'target')).billing.active,false);
 f.db.exec('DROP TRIGGER simulate_access_failure');await f.service.change(f.admin,input);assert.equal((await f.service.detail(f.admin,'target')).billing.version,1);f.db.close();
});
test('expired access starts today and sandbox grants do not become live grants',async()=>{
 const f=await fixture(false,'test');f.db.prepare("INSERT INTO patrac_access VALUES('target','test',1,0)").run();await f.service.change(f.admin,accessInput());
 assert.ok((await f.service.detail(f.admin,'target')).billing.expiresAt>Date.now());assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM patrac_access WHERE environment='live'").get().n,0);f.db.close();
 const off=await fixture();await assert.rejects(()=>off.service.change(off.admin,accessInput()),e=>e.status===503);off.db.close();
});
