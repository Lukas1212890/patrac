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
    const limits=await creatorLimits(env.DB,who!.id);
    return json({ user: who, expeditionLimit:limits.private, expeditionCount:rows.results.filter(r=>JSON.parse(r.payload).visibility!=='public').length, publicExpeditionLimit:limits.public, publicExpeditionCount:rows.results.filter(r=>JSON.parse(r.payload).visibility==='public').length, games: rows.results.map(r => { const game = JSON.parse(r.payload); return { code: r.code, name: game.name, role: 'owner', status: game.status, visibility:game.visibility||'private', published:!!game.published, totalStations: game.stations.length }; }) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try {
    const who = await creatorIdentity(request, true), input = await body(request);
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

export async function notices(request:Request){const who=await creatorIdentity(request,true);return json(await creatorNotices(env.DB,who!.id));}
