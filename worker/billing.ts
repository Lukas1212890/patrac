import {env} from 'cloudflare:workers';
import {creatorIdentity} from './lib/creator-server';
import {createBilling,verifyStripeSignature,billingEnvironment} from './lib/billing.mjs';
import {GameError} from './lib/patrac-engine.mjs';
async function rawBody(request:Request,limit:number){
 const reader=request.body?.getReader();if(!reader)throw new GameError('Chybí údaje.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new GameError('Příliš velký požadavek.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return new TextDecoder().decode(bytes);
}
export async function billingRequest(request:Request){
 const path=new URL(request.url).pathname,api=createBilling({db:env.DB,env});
 if(path==='/api/billing/webhook'&&request.method==='POST'){
  const raw=await rawBody(request,262144);await verifyStripeSignature(raw,request.headers.get('stripe-signature'),env.STRIPE_WEBHOOK_SECRET);
  let event;try{event=JSON.parse(raw);}catch{throw new GameError('Neplatná událost.');}
  if(event.livemode!==(billingEnvironment(env)==='live'))throw new GameError('Nesouhlasí prostředí platby.');
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))return Response.json(await api.fulfill(event.data?.object?.id));
  return Response.json({received:true});
 }
 const user=await creatorIdentity(request,true);
 if(path==='/api/billing'&&request.method==='GET')return Response.json(await api.state(user!.id));
 if(path==='/api/billing/checkout'&&request.method==='POST'){
  if(!request.headers.get('origin'))throw new GameError('Chybí původ požadavku.',403);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new GameError('Očekáváme JSON.',415);
  let input;try{input=JSON.parse(await rawBody(request,2048));}catch(e){if(e instanceof GameError)throw e;throw new GameError('Neplatné údaje.');}
  return Response.json(await api.checkout(user,input||{}));
 }
 return Response.json({error:'Nenalezeno.'},{status:404});
}
