import {carryAdminAccess} from './adminAccessCarryover.mjs';
import { GameError } from './patrac-engine.mjs';
export const PLANS = Object.freeze([
 {months:3,amount:19900,price:'price_1UVU6cANHHDZraJ6zOLs3WIp'},
 {months:6,amount:34900,price:'price_1UVU8ZANHHDZraJ6o3YPxTc1'},
 {months:12,amount:59900,price:'price_1UVU9KANHHDZraJ6c0OvfpMZ'},
]);
const APP='https://patrac.stopik.cz';
export function addMonths(stamp, months) {
 const date=new Date(stamp),day=date.getUTCDate();
 date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+months);
 const end=new Date(date);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 date.setUTCDate(Math.min(day,end.getUTCDate()));return date.getTime();
}
export function billingEnvironment(env) { return env.PATRAC_STRIPE_MODE==='live'?'live':'test'; }
export async function accessState(db, userId, environment, now=Date.now()) {
 if(environment==='live')await carryAdminAccess(db,userId);
 const row=await db.prepare('SELECT expires_at FROM patrac_access WHERE user_id=? AND environment=?').bind(userId,environment).first();
 return {expiresAt:row?.expires_at||null,active:(row?.expires_at||0)>now};
}
export async function requirePaidAccess(env,userId) {
 if(env.PATRAC_BILLING_ENABLED!=='true')return;
 const access=await accessState(env.DB,userId,billingEnvironment(env));
 if(!access.active)throw new GameError('Pro tvorbu, úpravy a spuštění výpravy si aktivujte přístup v profilu.',402);
}
export function createBilling({db,env,fetcher=fetch,now=Date.now}) {
 const environment=billingEnvironment(env);
 const available=()=>env.PATRAC_BILLING_ENABLED==='true'&&!!env.STRIPE_SECRET_KEY&&!!env.STRIPE_WEBHOOK_SECRET;
 async function stripe(path,params,idempotencyKey) {
  const key=env.STRIPE_SECRET_KEY;
  if(!key||!key.startsWith(environment==='test'?'sk_test_':'sk_live_'))throw new GameError('Platební brána není nakonfigurovaná.',503);
  const response=await fetcher('https://api.stripe.com/v1/'+path,{
   method:params?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),
   headers:{Authorization:'Bearer '+key,'Stripe-Version':'2025-06-30.basil',...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
   ...(params?{body:new URLSearchParams(params).toString()}:{}),
  });
  if(!response.ok)throw new GameError('Platební brána je dočasně nedostupná. Zkuste to znovu.',503);
  return response.json();
 }
 async function state(userId) {
  if(env.PATRAC_BILLING_ENABLED!=='true')return {active:false,expiresAt:null,enabled:false,available:false,environment,plans:PLANS.map(p=>({months:p.months,amount:p.amount})),orders:[]};
  const access=await accessState(db,userId,environment,now());
  const orders=await db.prepare('SELECT id,months,amount,created_at,paid_at,access_until FROM patrac_orders WHERE user_id=? AND environment=? ORDER BY created_at DESC LIMIT 20').bind(userId,environment).all();
  return {...access,enabled:env.PATRAC_BILLING_ENABLED==='true',available:available(),environment,plans:PLANS.map(p=>({months:p.months,amount:p.amount})),orders:orders.results};
 }
 async function checkout(user,input) {
  if(input.environment&&input.environment!==environment)throw new GameError('Režim hry se změnil. Obnovte profil před platbou.',409);
  if(!available())throw new GameError('Platby se právě připravují.',503);
  const plan=PLANS.find(p=>p.months===input.months);
  if(!plan||typeof input.requestKey!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(input.requestKey))throw new GameError('Neplatná varianta přístupu.');
  // Live prices must be explicitly supplied; sandbox IDs can never charge real money.
  const price=env['STRIPE_PRICE_'+plan.months]||(environment==='test'?plan.price:null);
  if(!/^price_[A-Za-z0-9]+$/.test(price||''))throw new GameError('Cena není nastavená.',503);
  let order=await db.prepare('SELECT * FROM patrac_orders WHERE user_id=? AND environment=? AND request_key=?').bind(user.id,environment,input.requestKey).first();
  if(order&&order.months!==plan.months)throw new GameError('Opakovaný požadavek má jinou variantu.',409);
  if(order?.paid_at)throw new GameError('Tato objednávka už byla zaplacená. Obnovte profil.',409);
  if(!order){
   const id=crypto.randomUUID();
   await db.prepare(`INSERT OR IGNORE INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM patrac_orders WHERE user_id=? AND created_at>?)<10`)
    .bind(id,user.id,environment,input.requestKey,plan.months,plan.amount,price,now(),user.id,now()-3600000).run();
   order=await db.prepare('SELECT * FROM patrac_orders WHERE user_id=? AND environment=? AND request_key=?').bind(user.id,environment,input.requestKey).first();
   if(!order)throw new GameError('Příliš mnoho platebních pokusů. Zkuste to později.',429);
  }
  if(order.checkout_url){const old=await stripe('checkout/sessions/'+encodeURIComponent(order.session_id));if(old.status!=='open')throw new GameError('Platba již byla dokončena nebo vypršela. Obnovte profil a zkuste to znovu.',409);return {url:order.checkout_url};}
  const session=await stripe('checkout/sessions',{
   mode:'payment','line_items[0][price]':order.price_id,'line_items[0][quantity]':'1','payment_method_types[0]':'card',
   client_reference_id:order.id,'metadata[patrac_order]':order.id,'metadata[patrac_user]':user.id,
   customer_email:user.email,locale:'cs',success_url:APP+'/?billing=success',cancel_url:APP+'/?billing=cancel',
  },'patrac-'+order.id);
  if(!/^cs_(test_)?[A-Za-z0-9]+$/.test(session.id||'')||!session.url?.startsWith('https://checkout.stripe.com/'))throw new GameError('Neplatná odpověď platební brány.',503);
  await db.prepare('UPDATE patrac_orders SET session_id=?,checkout_url=? WHERE id=? AND session_id IS NULL').bind(session.id,session.url,order.id).run();
  return {url:session.url};
 }
 async function fulfill(sessionId) {
  if(!/^cs_(test_)?[A-Za-z0-9]+$/.test(sessionId||''))throw new GameError('Neplatná platba.');
  const session=await stripe('checkout/sessions/'+encodeURIComponent(sessionId)+'?expand[]=line_items');
  if(session.payment_status!=='paid'||session.status!=='complete')return {received:true};
  const order=await db.prepare('SELECT * FROM patrac_orders WHERE id=?').bind(session.client_reference_id||'').first();
  // Ignore unrelated Stripe transactions, including dashboard-generated test events.
  if(!order)return {received:true};
  const lines=session.line_items?.data;
  if(order.environment!==environment||session.livemode!==(environment==='live')||session.mode!=='payment'||session.currency!=='czk'||session.amount_total!==order.amount||session.metadata?.patrac_order!==order.id||session.metadata?.patrac_user!==order.user_id||!Array.isArray(lines)||lines.length!==1||session.line_items.has_more||lines[0].price?.id!==order.price_id||lines[0].quantity!==1||(order.session_id&&order.session_id!==session.id))throw new GameError('Údaje platby nesouhlasí.',400);
  if(environment==='live')await carryAdminAccess(db,order.user_id);
  await db.prepare('INSERT OR IGNORE INTO patrac_access(user_id,environment) VALUES(?,?)').bind(order.user_id,environment).run();
  for(let i=0;i<8;i++){
   const current=await db.prepare('SELECT * FROM patrac_access WHERE user_id=? AND environment=?').bind(order.user_id,environment).first();
   const stamp=now(),until=addMonths(Math.max(stamp,current.expires_at),order.months),activation=crypto.randomUUID();
   // D1 batch is a transaction. The order and access revision advance together once only.
   const result=await db.batch([
    db.prepare(`UPDATE patrac_orders SET paid_at=?,access_until=?,activation_id=?,session_id=? WHERE id=? AND paid_at IS NULL
     AND EXISTS(SELECT 1 FROM patrac_access WHERE user_id=? AND environment=? AND version=?)`)
     .bind(stamp,until,activation,session.id,order.id,order.user_id,environment,current.version),
    db.prepare(`UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id=? AND environment=? AND version=?
     AND EXISTS(SELECT 1 FROM patrac_orders WHERE id=? AND activation_id=?)`)
     .bind(until,order.user_id,environment,current.version,order.id,activation),
   ]);
   if(result[0].meta.changes)return {received:true};
   if((await db.prepare('SELECT paid_at FROM patrac_orders WHERE id=?').bind(order.id).first())?.paid_at)return {received:true};
  }
  throw new GameError('Platba čeká na opakované potvrzení.',503);
 }
 return {state,checkout,fulfill};
}
export async function verifyStripeSignature(raw,header,secret,now=Date.now()) {
 if(!secret?.startsWith('whsec_'))throw new GameError('Potvrzování plateb není nastavené.',503);
 const parts=(header||'').split(','),times=parts.filter(p=>p.startsWith('t='));
 if(times.length!==1||!/^t=\d+$/.test(times[0]))throw new GameError('Neplatný podpis.',400);
 const stamp=times[0].slice(2);
 if(Math.abs(now/1000-Number(stamp))>300)throw new GameError('Podpis vypršel.',400);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const payload=new TextEncoder().encode(stamp+'.'+raw);
 for(const part of parts){if(!/^v1=[a-f0-9]{64}$/.test(part))continue;const bytes=Uint8Array.from(part.slice(3).match(/../g),h=>parseInt(h,16));if(await crypto.subtle.verify('HMAC',key,bytes,payload))return;}
 throw new GameError('Neplatný podpis.',400);
}
