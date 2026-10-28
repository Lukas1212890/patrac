import {env} from 'cloudflare:workers';
import {creatorIdentity} from './lib/creator-server';
import {createPublicService} from './lib/publicExpeditions.mjs';
import {body,revealPhoto} from './lib/patrac-server';
import {GameError} from './lib/patrac-engine.mjs';
export async function publicRequest(request:Request){
 const url=new URL(request.url),api=createPublicService({db:env.DB,env,revealPhoto});
 if(url.pathname==='/api/public/expeditions'&&request.method==='GET')return Response.json(await api.listing(url.searchParams.get('bounds')));
 const user=await creatorIdentity(request,false);
 if(url.pathname==='/api/public/attempts'&&request.method==='GET')return Response.json(await api.history(user));
 const match=/^\/api\/public\/expeditions\/([A-Za-z2-9]{7})(?:\/(start|play))?$/.exec(url.pathname);
 if(!match)return Response.json({error:'Nenalezeno.'},{status:404});
 const code=match[1].toUpperCase(),action=match[2];
 if(!action&&request.method==='GET')return Response.json(await api.detail(code,user));
 if(action==='play'&&request.method==='GET')return Response.json(await api.play(code,user,undefined));
 if(request.method==='POST'){
  if(!request.headers.get('origin'))throw new GameError('Chybí původ požadavku.',403);
  if(Number(request.headers.get('content-length')||0)>4096)throw new GameError('Požadavek je příliš velký.',413);
  const input=await body(request,4096);
  if(action==='start')return Response.json(await api.start(code,user,input.confirm));
  if(action==='play')return Response.json(await api.play(code,user,input));
 }
 return Response.json({error:'Nenalezeno.'},{status:404});
}
