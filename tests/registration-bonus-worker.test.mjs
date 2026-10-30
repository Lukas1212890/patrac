import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {LEGAL_VERSION} from '../shared/legal.mjs';
test('registration and email verification automatically grant exactly one test bonus',async()=>{
 const built=await build({stdin:{contents:`import {createAccountAuth} from './worker/lib/accountAuth.mjs';import {env} from 'cloudflare:workers';let auth;export default {fetch(request){auth ||= createAccountAuth({...env,sendMail:async(to,subject,text)=>{await env.DB.prepare('INSERT INTO test_mail VALUES(?,?,?)').bind(to,subject,text).run();}});return auth.handler(request);}}`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
 const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/legal-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:['DB'],bindings:{PATRAC_STRIPE_MODE:'test',PATRAC_AUTH_SECRET:'local-legal-test-key-not-production-12345',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000'}});
 try{
 const db=await mf.getD1Database('DB');
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0009_player_accounts.sql','0004_billing.sql'])for(const sql of readFileSync('drizzle/'+file,'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 await db.prepare('CREATE TABLE test_mail(recipient TEXT,subject TEXT,body TEXT)').run();
 const signup=body=>mf.dispatchFetch('http://localhost:8790/api/auth/sign-up/email',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'legal@example.com',name:'LegalTest',password:'legal-long-test-password-123',...body})});
 let response=await signup({});assert.equal(response.status,400);assert.equal((await response.json()).code,'LEGAL_ACCEPTANCE_REQUIRED');
 response=await signup({adultConfirmed:false,termsVersion:LEGAL_VERSION});assert.equal(response.status,400);
 response=await signup({adultConfirmed:true,termsVersion:LEGAL_VERSION});assert.equal(response.status,200,await response.clone().text());
 const user=await db.prepare('SELECT id FROM patrac_auth_user').first(),acceptance=await db.prepare('SELECT * FROM patrac_legal_acceptance').first();assert.equal(acceptance.user_id,user.id);assert.equal(acceptance.version,LEGAL_VERSION);assert.equal(acceptance.kind,'signup');
 const mail=await db.prepare('SELECT body FROM test_mail').first();assert.match(mail.body,/https:\/\/patrac.stopik.cz\/podminky/);assert.match(mail.body,/https:\/\/patrac.stopik.cz\/soukromi/);assert.equal(mail.body.includes('Vzor oznámení o odstoupení'),false);assert.ok(mail.body.length<1500);assert.match(acceptance.terms_snapshot,/Vzor oznámení o odstoupení/);assert.ok(mail.body.length<12000);assert.ok(Buffer.byteLength(JSON.stringify({to:'legal@example.com',subject:'Potvrzení účtu – Pátrač',text:mail.body}))<16000);
 const before=await db.prepare('SELECT * FROM patrac_registration_bonus WHERE user_id=?').bind(user.id).first();assert.equal(before.granted_at,null);
 const link=mail.body.match(/http:\/\/localhost:8790\/api\/auth\/verify-email[^\s]+/)[0];
 response=await mf.dispatchFetch(link,{redirect:'manual'});assert.ok(response.status<400,await response.clone().text());
 const grant=await db.prepare('SELECT * FROM patrac_registration_bonus WHERE user_id=?').bind(user.id).first();assert.ok(grant.granted_at);assert.ok(grant.access_until>grant.granted_at);
 const access=await db.prepare("SELECT * FROM patrac_access WHERE user_id=? AND environment='test'").bind(user.id).first();assert.equal(access.expires_at,grant.access_until);assert.equal(access.version,1);
 await mf.dispatchFetch(link,{redirect:'manual'});assert.equal((await db.prepare("SELECT version FROM patrac_access WHERE user_id=? AND environment='test'").bind(user.id).first()).version,1);
 }finally{await mf.dispose();}
});
