import {billingEnvironment} from './lib/billing.mjs';
import {accountAuth} from './auth';
import {availableNickname} from './lib/nicknames.mjs';
import { env } from 'cloudflare:workers';
import {creatorNotices} from './lib/creatorNotices.mjs';
import {creatorLimits,limitsReady,limitSQL} from './lib/creatorLimits.mjs';
import { creatorIdentity } from './lib/creator-server';
import { json, body, errorResponse } from './lib/patrac-server';
import { EXPEDITION_LIMIT, expeditionCount, expeditionCountSQL } from './lib/expeditionLifecycle.mjs';
import { GameError } from './lib/patrac-engine.mjs';

async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), v => v.toString(16).padStart(2, '0')).join(''); }
export async function GET(request: Request) {
  try {
    const who = await creatorIdentity(request, true);
    const rows = await env.DB!.prepare('SELECT e.code, e.payload FROM patrac_expeditions e JOIN patrac_creator_games c ON c.code = e.code WHERE c.creator_id = ? ORDER BY c.linked_at DESC').bind(who!.id).all<any>();
    const ratings=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_public_reviews'").first()?await env.DB.prepare("SELECT r.code,COUNT(*) AS count,ROUND(AVG(r.stars),1) AS average,SUM(CASE WHEN length(trim(r.comment))>0 THEN 1 ELSE 0 END) AS comments FROM patrac_public_reviews r JOIN patrac_creator_games c ON c.code=r.code WHERE c.creator_id=? AND r.environment=? GROUP BY r.code").bind(who!.id,billingEnvironment(env)).all<any>():{results:[]};
    const byCode=new Map(ratings.results.map(r=>[r.code,{count:r.count,average:r.average,comments:r.comments}]));
    const limits=await creatorLimits(env.DB,who!.id);
    const played=await env.DB!.prepare("SELECT e.code,e.payload,t.payload AS player FROM patrac_teams t JOIN patrac_expeditions e ON e.code=t.code WHERE t.user_id=? AND COALESCE(json_extract(e.payload,'$.visibility'),'private')='private' ORDER BY t.rowid DESC").bind(who!.id).all<any>();
    return json({privateGames:played.results.map(r=>({role:'team',code:r.code,name:who!.nickname,gameName:JSON.parse(r.payload).name,finishedAt:JSON.parse(r.player).finishedAt,abandonedAt:JSON.parse(r.player).abandonedAt,userId:who!.id})), user: who, expeditionLimit:limits.private, expeditionCount:rows.results.filter(r=>JSON.parse(r.payload).visibility!=='public').length, publicExpeditionLimit:limits.public, publicExpeditionCount:rows.results.filter(r=>JSON.parse(r.payload).visibility==='public').length, games: rows.results.map(r => { const game = JSON.parse(r.payload); return { code: r.code, name: game.name, role: 'owner', status: game.status, visibility:game.visibility||'private', rating:byCode.get(r.code)||{count:0,average:null,comments:0}, published:!!game.published, totalStations: game.stations.length }; }) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    const who = await creatorIdentity(request, true), input = await body(request);
    if(input.action==='nickname'){
      if(input.acknowledge!==true||input.oldName!==who!.nickname)throw new GameError('Potvrďte uvolnění své současné přezdívky.',409);
      if(typeof input.password!=='string'||input.password.length>128)throw new GameError('Potvrďte přihlášení heslem.',401);
      const stamp=Date.now(),key='nickname:'+who!.id;
      await env.DB!.prepare('INSERT INTO patrac_auth_rate_limit(id,key,count,lastRequest) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN lastRequest<? THEN 1 ELSE count+1 END,lastRequest=CASE WHEN lastRequest<? THEN excluded.lastRequest ELSE lastRequest END').bind(key,key,stamp,stamp-300000,stamp-300000).run();
      const attempts:any=await env.DB!.prepare('SELECT count FROM patrac_auth_rate_limit WHERE key=?').bind(key).first();
      if(attempts.count>5)throw new GameError('Příliš mnoho pokusů. Změnu přezdívky zkuste za pět minut.',429);
      try{await accountAuth().api.verifyPassword({headers:new Headers({Authorization:'Bearer '+request.headers.get('x-patrac-account')}),body:{password:input.password}});}catch{throw new GameError('Heslo nesouhlasí. Přihlaste se znovu a opakujte změnu.',401);}
      let next;try{next=await availableNickname(env.DB,input.name,who!.id);}catch(e:any){throw new GameError(e.message,409);}
      try{const changed=await env.DB!.prepare('UPDATE patrac_auth_user SET name=?,nicknameKey=?,updatedAt=? WHERE id=? AND name=?').bind(next.name,next.nicknameKey,Date.now(),who!.id,input.oldName).run();if(!changed.meta.changes)throw new GameError('Přezdívka se mezitím změnila. Obnovte profil.',409);}catch(e:any){if(e instanceof GameError)throw e;if(/UNIQUE/.test(e.message))throw new GameError('Tato přezdívka je už obsazená. Zvolte jinou.',409);throw e;}
      return json({ok:true});
    }
    if (input.action !== 'claim' || !Array.isArray(input.games) || input.games.length > 40) throw new GameError('Neplatná žádost o přiřazení výprav.');
    let linked = 0, limitReached = false;const custom=await limitsReady(env.DB),cap=custom?limitSQL('private'):'?';
    for (const item of input.games) {
      if (!/^[A-Z2-9]{7}$/.test(item.code || '') || !/^[a-f0-9]{64}$/.test(item.token || '')) continue;
      // Possession of an old author key can migrate an unclaimed game once only.
      const result = await env.DB!.prepare(`INSERT OR IGNORE INTO patrac_creator_games (code, creator_id, linked_at) SELECT code, ?, ? FROM patrac_expeditions WHERE code = ? AND owner_hash = ? AND COALESCE(json_extract(payload,'$.visibility'),'private')='private' AND (${expeditionCountSQL}) < ${cap}`).bind(who!.id, Date.now(), item.code, await digest(item.token), who!.id, custom?who!.id:EXPEDITION_LIMIT).run();
      linked += result.meta.changes;
      if (!result.meta.changes && await expeditionCount(env.DB!,who!.id)>=(await creatorLimits(env.DB,who!.id)).private) limitReached=true;
    }
    return json({ ok: true, linked, limitReached,expeditionLimit:(await creatorLimits(env.DB,who!.id)).private });
  } catch (e) { return errorResponse(e); }
}

export async function notices(request:Request){
 const who=await creatorIdentity(request,true);
 const result=await creatorNotices(env.DB,who!.id,billingEnvironment(env));
 // Older open clients render every event as deletion. Never send them other event types.
 const format=new URL(request.url).searchParams.get('format');
 return json({format:format==='3'?3:format==='2'?2:1,notices:format==='3'?result.notices:format==='2'?result.notices.filter(n=>!['review','review-reply'].includes(n.type)):result.notices.filter(n=>n.type==='delete-expedition')});
}
