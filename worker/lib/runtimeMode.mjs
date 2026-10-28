import {PLANS} from './billing.mjs';
export function modeEnv(raw,mode){
 const prefix=mode==='live'?'LIVE':'TEST',legacy=raw.STRIPE_SECRET_KEY?.startsWith('sk_'+mode+'_')||(!raw.STRIPE_SECRET_KEY&&(raw.PATRAC_STRIPE_MODE==='live'?'live':'test')===mode);
 const selected={...raw,PATRAC_STRIPE_MODE:mode,STRIPE_SECRET_KEY:raw['STRIPE_'+prefix+'_SECRET_KEY']||(legacy?raw.STRIPE_SECRET_KEY:''),STRIPE_WEBHOOK_SECRET:raw['STRIPE_'+prefix+'_WEBHOOK_SECRET']||(legacy?raw.STRIPE_WEBHOOK_SECRET:'')};
 for(const p of PLANS)selected['STRIPE_PRICE_'+p.months]=raw['STRIPE_'+prefix+'_PRICE_'+p.months]||(mode==='live'?raw['STRIPE_PRICE_'+p.months]:p.price);
 return selected;
}
export async function readRuntimeMode(db,fallback='test'){
 const ready=!!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_runtime_mode'").first();
 const row=ready?await db.prepare('SELECT mode,version FROM patrac_runtime_mode WHERE id=1').first():null;
 return{ready:!!row,mode:row?.mode||(fallback==='live'?'live':'test'),version:row?.version??0};
}
export function modeConfiguration(raw,mode){
 const env=modeEnv(raw,mode),missing=[];
 if(!env.STRIPE_SECRET_KEY?.startsWith('sk_'+mode+'_'))missing.push('STRIPE_'+mode.toUpperCase()+'_SECRET_KEY');
 if(!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))missing.push('STRIPE_'+mode.toUpperCase()+'_WEBHOOK_SECRET');
 for(const p of PLANS)if(!/^price_[A-Za-z0-9]+$/.test(env['STRIPE_PRICE_'+p.months]||''))missing.push('STRIPE_'+mode.toUpperCase()+'_PRICE_'+p.months);
 return{configured:missing.length===0,missing};
}
export async function verifyMode(raw,mode,fetcher=fetch){
 const check=modeConfiguration(raw,mode);if(!check.configured)return{...check,verified:false,error:'Doplňte chybějící nastavení v Cloudflare.'};
 const env=modeEnv(raw,mode);
 async function get(path){const r=await fetcher('https://api.stripe.com/v1/'+path,{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':'2025-06-30.basil'},redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Stripe nastavení se nepodařilo ověřit.');return r.json();}
 try{
  const account=await get('account');if(mode==='live'&&(!account.charges_enabled||!account.payouts_enabled))throw Error('Stripe účet ještě nemá povolené platby a výplaty.');
  for(const p of PLANS){const price=await get('prices/'+encodeURIComponent(env['STRIPE_PRICE_'+p.months]));if(price.livemode!==(mode==='live')||!price.active||price.currency!=='czk'||price.unit_amount!==p.amount||price.type!=='one_time')throw Error('Cena pro '+p.months+' měsíců nesouhlasí s tarifem '+p.amount/100+' Kč.');}
  const endpoints=await get('webhook_endpoints?limit=100');const expected='https://patrac-api.bednarik.workers.dev/api/billing/webhook'+(mode==='live'?'/live':'');
  if(!endpoints.data?.some(e=>e.status==='enabled'&&(mode==='test'?[expected,expected+'/test']:[expected]).includes(e.url)&&e.livemode===(mode==='live')&&['checkout.session.completed','checkout.session.async_payment_succeeded'].every(v=>e.enabled_events.includes(v)||e.enabled_events.includes('*'))))throw Error('Ve Stripe chybí aktivní webhook s oběma událostmi pro dokončení platby.');
  return{...check,verified:true,accountId:account.id};
 }catch(e){return{...check,verified:false,error:e.message||'Ověření Stripe selhalo.'};}
}
