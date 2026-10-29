import {LEGAL_VERSION} from '../shared/legal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createBilling,addMonths,verifyStripeSignature,requirePaidAccess,PLANS} from '../worker/lib/billing.mjs';
function d1(native){const statement=(sql,values=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async all(){return{results:native.prepare(sql).all(...values)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};}});return{prepare:sql=>statement(sql),async batch(statements){native.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};}
function fixture(overrides={}){
 const native=new DatabaseSync(':memory:');native.exec(readFileSync(new URL('../drizzle/0002_creator_auth.sql',import.meta.url),'utf8'));native.exec(readFileSync(new URL('../drizzle/0004_billing.sql',import.meta.url),'utf8'));
 native.exec("INSERT INTO patrac_auth_user VALUES('user','Tester','user@example.com',1,NULL,1,1)");
 const db=d1(native),env={DB:db,PATRAC_BILLING_ENABLED:'true',PATRAC_STRIPE_MODE:'test',STRIPE_SECRET_KEY:'sk_test_local_fixture',STRIPE_WEBHOOK_SECRET:'whsec_local_fixture',...overrides},calls=[],sessions=new Map();
 let stamp=Date.UTC(2026,0,31,12,15),next=0;
 const fetcher=async(url,options)=>{calls.push({url,options});if(options.method==='POST'){
  const body=new URLSearchParams(options.body),id='cs_test_fixture'+(++next),price=body.get('line_items[0][price]');
  const session={id,url:'https://checkout.stripe.com/c/pay/'+id,status:'open',payment_status:'unpaid',client_reference_id:body.get('client_reference_id'),metadata:{patrac_order:body.get('metadata[patrac_order]'),patrac_user:body.get('metadata[patrac_user]')},livemode:false,mode:'payment',currency:'czk',amount_total:PLANS.find(p=>p.price===price).amount,line_items:{has_more:false,data:[{quantity:1,price:{id:price}}]}};
  sessions.set(id,session);return Response.json(session);
 }const id=new URL(url).pathname.split('/').at(-1);return Response.json(sessions.get(id));};
 const api=createBilling({db,env,fetcher,now:()=>stamp});
 return{native,db,env,api,calls,sessions,user:{id:'user',email:'user@example.com'},setClock:v=>stamp=v};
}
async function purchase(f,months=3,key=crypto.randomUUID()){
 const response=await f.api.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months,requestKey:key,amount:1,userId:'attacker'});
 const session=f.sessions.get(response.url.split('/').at(-1));session.status='complete';session.payment_status='paid';return session;
}
test('calendar-month extension clamps month ends and preserves UTC time, including leap years',()=>{
 assert.equal(new Date(addMonths(Date.UTC(2026,0,31,12,15),3)).toISOString(),'2026-04-30T12:15:00.000Z');
 assert.equal(new Date(addMonths(Date.UTC(2024,1,29,5),12)).toISOString(),'2025-02-28T05:00:00.000Z');
});
test('checkout uses server price and account; retries reuse the same session; unavailable live prices fail closed',async()=>{
 const f=fixture(),key=crypto.randomUUID();const a=await f.api.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months:3,requestKey:key,amount:1,userId:'other'});const b=await f.api.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months:3,requestKey:key});assert.deepEqual(a,b);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);const body=new URLSearchParams(f.calls[0].options.body);assert.equal(body.get('line_items[0][price]'),PLANS[0].price);assert.equal(body.get('metadata[patrac_user]'),'user');assert.equal(body.get('mode'),'payment');
 await assert.rejects(()=>f.api.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months:6,requestKey:key}),e=>e.status===409);
 const live=createBilling({db:f.db,env:{...f.env,PATRAC_STRIPE_MODE:'live'}});await assert.rejects(()=>live.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months:3,requestKey:crypto.randomUUID()}),e=>e.status===503);f.native.close();
});
test('unpaid session never grants access; duplicate paid events grant once, renewal extends current expiry',async()=>{
 const f=fixture(),session=await purchase(f);session.payment_status='unpaid';await f.api.fulfill(session.id);assert.equal((await f.api.state('user')).active,false);
 session.payment_status='paid';await f.api.fulfill(session.id);await f.api.fulfill(session.id);assert.equal(new Date((await f.api.state('user')).expiresAt).toISOString(),'2026-04-30T12:15:00.000Z');
 f.setClock(Date.UTC(2026,1,10));const renewal=await purchase(f,6);await f.api.fulfill(renewal.id);assert.equal(new Date((await f.api.state('user')).expiresAt).toISOString(),'2026-10-30T12:15:00.000Z');assert.equal(f.native.prepare('SELECT version FROM patrac_access').get().version,2);f.native.close();
});
test('expired access starts from payment confirmation; test grants never unlock live environment',async()=>{
 const f=fixture(),a=await purchase(f);await f.api.fulfill(a.id);f.setClock(Date.UTC(2027,0,1));const b=await purchase(f);await f.api.fulfill(b.id);assert.equal(new Date((await f.api.state('user')).expiresAt).toISOString(),'2027-04-01T00:00:00.000Z');
 const live=createBilling({db:f.db,env:{...f.env,PATRAC_STRIPE_MODE:'live'}});assert.equal((await live.state('user')).active,false);f.native.close();
});
test('mismatched amount, currency, price, account, session, environment or quantity never grants access',async()=>{
 for(const mutate of [s=>s.amount_total=1,s=>s.currency='eur',s=>s.line_items.data[0].price.id='price_fake',s=>s.metadata.patrac_user='other',s=>s.id='cs_test_other',s=>s.livemode=true,s=>s.line_items.data[0].quantity=2]){
  const f=fixture(),s=await purchase(f);mutate(s);await assert.rejects(()=>f.api.fulfill([...f.sessions.keys()][0]),e=>e.status===400);assert.equal((await f.api.state('user')).active,false);f.native.close();
 }
});
test('transaction rollback prevents partial grant and a retry recovers; paid entitlement enforced on server',async()=>{
 const f=fixture();f.setClock(Date.now());await assert.rejects(()=>requirePaidAccess(f.env,'user'),e=>e.status===402);
 const s=await purchase(f);f.native.exec("CREATE TRIGGER simulate_failure BEFORE UPDATE ON patrac_access BEGIN SELECT RAISE(ABORT,'test failure');END");
 await assert.rejects(()=>f.api.fulfill(s.id));assert.equal(f.native.prepare('SELECT paid_at FROM patrac_orders').get().paid_at,null);
 f.native.exec('DROP TRIGGER simulate_failure');await f.api.fulfill(s.id);await requirePaidAccess(f.env,'user');await assert.rejects(()=>requirePaidAccess({...f.env,PATRAC_STRIPE_MODE:'live'},'user'),e=>e.status===402);f.native.close();
});
test('signature verifies exact payload, rejects tampering, stale timestamps and missing secrets',async()=>{
 const raw='{"type":"checkout.session.completed"}',secret='whsec_fixture',stamp=Math.floor(Date.now()/1000);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp+'.'+raw))).toString('hex');const header=`t=${stamp},v1=${signature}`;
 await verifyStripeSignature(raw,header,secret);await assert.rejects(()=>verifyStripeSignature(raw+' ',header,secret));await assert.rejects(()=>verifyStripeSignature(raw,header,secret,(stamp+301)*1000));await assert.rejects(()=>verifyStripeSignature(raw,header,''),e=>e.status===503);
});
test('disabled billing needs no migration and checkout cannot run; checkout rate limits reserve in SQL',async()=>{
 const off=createBilling({db:{},env:{PATRAC_BILLING_ENABLED:'false'}});assert.equal((await off.state('any')).enabled,false);await assert.rejects(()=>off.checkout({},{termsVersion:LEGAL_VERSION,immediateAccess:true}),e=>e.status===503);
 const f=fixture();for(let i=0;i<10;i++)await f.api.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months:3,requestKey:crypto.randomUUID()});await assert.rejects(()=>f.api.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months:3,requestKey:crypto.randomUUID()}),e=>e.status===429);f.native.close();
});

test('restricted test key supports checkout and idempotent access grants',async()=>{
 const f=fixture({STRIPE_SECRET_KEY:'rk_test_fixture'});
 const session=await purchase(f);await f.api.fulfill(session.id);await f.api.fulfill(session.id);
 assert.equal((await f.api.state('user')).active,true);
 assert.ok(f.calls.every(c=>c.options.headers.Authorization==='Bearer rk_test_fixture'));
 assert.equal(f.native.prepare('SELECT version FROM patrac_access').get().version,1);f.native.close();
});
test('restricted live key reaches checkout; wrong-mode and public keys never reach Stripe',async()=>{
 const f=fixture();
 for(const key of ['rk_live_fixture','rk_test_fixture','pk_live_fixture']){
  let calls=0;
  const api=createBilling({db:f.db,env:{...f.env,PATRAC_STRIPE_MODE:'live',STRIPE_SECRET_KEY:key,STRIPE_PRICE_3:'price_live3'},fetcher:async(url,options)=>{
   calls++;assert.equal(options.headers.Authorization,'Bearer rk_live_fixture');
   assert.equal(new URLSearchParams(options.body).get('line_items[0][price]'),'price_live3');
   return Response.json({id:'cs_livefixture',url:'https://checkout.stripe.com/c/pay/cs_livefixture'});
  }});
  const attempt=()=>api.checkout(f.user,{termsVersion:LEGAL_VERSION,immediateAccess:true,months:3,environment:'live',requestKey:crypto.randomUUID()});
  if(key==='rk_live_fixture'){await attempt();assert.equal(calls,1);}
  else{await assert.rejects(attempt,e=>e.status===503);assert.equal(calls,0);}
 }
 f.native.close();
});

test('checkout rejects missing, old, or nonboolean consent before contacting Stripe',async()=>{
 const f=fixture();
 for(const input of [{},{termsVersion:'old',immediateAccess:true},{termsVersion:LEGAL_VERSION,immediateAccess:'true'}])await assert.rejects(()=>f.api.checkout(f.user,{months:3,requestKey:crypto.randomUUID(),...input}),e=>e.status===400);
 assert.equal(f.calls.length,0);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_orders').get().n,0);
 await purchase(f);const row=f.native.prepare('SELECT * FROM patrac_legal_acceptance').get();assert.equal(row.user_id,'user');assert.equal(row.kind,'purchase-immediate');assert.equal(row.version,LEGAL_VERSION);f.native.close();
});

test('paid mail retries after failure without granting access twice and includes accepted contract',async()=>{
 const f=fixture(),session=await purchase(f);let attempts=0,body='';
 const api=createBilling({db:f.db,env:f.env,fetcher:async()=>Response.json(session),sendMail:async(to,subject,text)=>{attempts++;assert.equal(to,'user@example.com');body=text;if(attempts===1)throw Error('mail unavailable');}});
 await assert.rejects(()=>api.fulfill(session.id),/mail unavailable/);
 assert.equal(f.native.prepare('SELECT version FROM patrac_access').get().version,1);
 await api.fulfill(session.id);await api.fulfill(session.id);assert.equal(attempts,2);assert.equal(f.native.prepare('SELECT version FROM patrac_access').get().version,1);
 assert.match(body,/Vzor oznámení o odstoupení/);assert.match(body,/TESTOVACÍ PLATBA/);assert.ok(body.length<12000);assert.ok(Buffer.byteLength(JSON.stringify({to:'user@example.com',subject:'Potvrzení platby – Pátrač',text:body}))<16000);f.native.close();
});
