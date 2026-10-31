import test from 'node:test';
import assert from 'node:assert/strict';
import {checkTurnstile,turnstileConfig} from '../worker/lib/turnstile.mjs';
const env={PATRAC_TURNSTILE_SITE_KEY:'public-fixture',PATRAC_TURNSTILE_SECRET_KEY:'secret-fixture'};
const req=(token,path='sign-up/email')=>new Request('https://api.example/api/auth/'+path,{method:'POST',headers:token?{'x-patrac-turnstile':token}:{}});
test('protected endpoints fail closed for missing tokens, wrong host/action, failed verification and outages',async()=>{
 await assert.rejects(()=>checkTurnstile(req(),env),e=>e.status===403);
 await assert.rejects(()=>checkTurnstile(req('t'),{PATRAC_TURNSTILE_SITE_KEY:'partial'}),e=>e.status===503);
 for(const result of [{success:false},{success:true,hostname:'evil.example',action:'registration'},{success:true,hostname:'patrac.stopik.cz',action:'password_reset'}])await assert.rejects(()=>checkTurnstile(req('t'),env,async()=>Response.json(result)),e=>e.status===403);
 await assert.rejects(()=>checkTurnstile(req('t'),env,async()=>{throw Error('offline');}),e=>e.status===503);
});
test('matching single-use verification is required for both forms; login and unconfigured rollout are unchanged',async()=>{
 for(const [path,action]of [['sign-up/email','registration'],['request-password-reset','password_reset']])await checkTurnstile(req('token',path),env,async(url,options)=>{assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(JSON.parse(options.body).response,'token');return Response.json({success:true,hostname:'patrac.stopik.cz',action});});
 await checkTurnstile(req(null,'sign-in/email'),env,async()=>{throw Error('must not fetch');});await checkTurnstile(req(),{},async()=>{throw Error('must not fetch');});assert.equal(turnstileConfig(env).ready,true);
});

test('Better Auth browser client includes proof header in real signup and reset requests',async()=>{
 const {createAuthClient}=await import('better-auth/client');const original=globalThis.fetch,seen=[];
 globalThis.fetch=async(url,options)=>{seen.push({url:String(url),headers:new Headers(options.headers)});return Response.json({});};
 try{const client=createAuthClient({baseURL:'https://example.com/api/auth'});await client.signUp.email({email:'test@example.com',password:'long-enough-test-password',name:'Tester'},{headers:{'X-Patrac-Turnstile':'signup-proof'}});await client.requestPasswordReset({email:'test@example.com'},{headers:{'X-Patrac-Turnstile':'reset-proof'}});assert.equal(seen[0].headers.get('x-patrac-turnstile'),'signup-proof');assert.equal(seen[1].headers.get('x-patrac-turnstile'),'reset-proof');}finally{globalThis.fetch=original;}
});
