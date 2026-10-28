import { storeHintPhotos, removeReplacedPhotos } from './photoStorage.mjs';
import {communityReady,validatePublicInfo,requirePublicAccess} from './publicExpeditions.mjs';
import { allowedOrigin } from '../origin.mjs';
import { creatorIdentity } from './creator-server';
import { requirePaidAccess } from './billing.mjs';
import {creatorLimits} from './creatorLimits.mjs';
import { expeditionCount, reserveExpedition, removeExpedition } from './expeditionLifecycle.mjs';
import { env } from 'cloudflare:workers';
import { GameError, validateExpedition, newTeam, applyAction, teamProjection, stationTimings, score } from './patrac-engine.mjs';
type Row = { code: string; owner_hash: string; payload: string; version: number };
const headers = { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization, X-Patrac-Account', 'X-Content-Type-Options': 'nosniff' };
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, '0')).join('');
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), v => v.toString(16).padStart(2, '0')).join(''); }
const db = () => { if (!env.DB) throw new GameError('Úložiště výprav není dostupné.', 503); return env.DB; };
export async function body(request: Request, limit=14000000) {
  if (request.headers.get('origin') && !allowedOrigin(request.headers.get('origin')!, env.PATRAC_ALLOWED_ORIGINS)) throw new GameError('Nepovolený původ požadavku.', 403);
  if (!request.headers.get('content-type')?.includes('application/json')) throw new GameError('Očekáváme JSON.', 415);
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  if (!reader) throw new GameError('Chybí data.');
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new GameError('Výprava je příliš velká. Zmenšete fotografie.', 413); } chunks.push(value); }
  const all = new Uint8Array(size); let at = 0; for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(all)); } catch { throw new GameError('Neplatná data.'); }
}
export function errorResponse(error: any) {
  if (error instanceof GameError) return json({ error: error.message }, error.status);
  console.error('Patrac request failed', error?.name, String(error?.message || '').slice(0, 150));
  return json({ error: 'Požadavek se nepodařilo uložit. Zkuste to znovu.' }, 500);
}
async function storePhotos(config: any, code: string, previous?: any) {
  if (!env.BUCKET && config.stations.some((s: any) => s.hints.some((h: any) => h.type === 'photo'))) throw new GameError('Úložiště fotografií není dostupné.', 503);
  return storeHintPhotos(config, code, env.BUCKET, previous);
}
export async function revealPhoto(hint: any) {
  if (hint.type !== 'photo' || !hint.photoKey) return hint;
  const object = await env.BUCKET?.get(hint.photoKey);
  if (!object) throw new GameError('Fotografii se nepodařilo načíst. Zkuste obnovit spojení.', 503);
  const bytes = new Uint8Array(await object.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { ...hint, content: `data:${object.httpMetadata?.contentType || 'image/jpeg'};base64,${btoa(binary)}` };
}
async function getGame(code: string) {
  if (!/^[A-Z2-9]{7}$/.test(code)) throw new GameError('Neplatný kód výpravy.', 404);
  const row = await db().prepare('SELECT * FROM patrac_expeditions WHERE code = ?').bind(code).first<Row>();
  if (!row) throw new GameError('Výprava s tímto kódem nebyla nalezena.', 404);
  return { row, game: JSON.parse(row.payload) };
}
async function identity(request: Request, row: Row): Promise<any> {
  const account = await creatorIdentity(request,true);
  if (account) {
    const owned = await db().prepare('SELECT creator_id FROM patrac_creator_games WHERE code = ? AND creator_id = ?').bind(row.code, account.id).first();
    if (owned) return { role: 'owner', accountId: account.id };
    const existingTeam=await db().prepare('SELECT * FROM patrac_teams WHERE code=? AND user_id=?').bind(row.code,account.id).first<any>();
    if(existingTeam)return {role:'team',teamRow:existingTeam,team:{...JSON.parse(existingTeam.payload),name:account.nickname}};
  }
  return { role: 'guest' };
}
export async function createExpedition(request: Request) {
  const account = await creatorIdentity(request, true);
  await requirePaidAccess(env, account!.id);
  const input = await body(request), visibility=input.visibility||'private';
  if(!['private','public'].includes(visibility))throw new GameError('Vyberte soukromou nebo veřejnou výpravu.');
  if(visibility==='public')await requirePublicAccess(db(),env,account!.id);
  if(visibility==='public'&&!await communityReady(db()))throw new GameError('Veřejné výpravy se právě připravují.',503);
  const limits=await creatorLimits(db(),account!.id),limit=visibility==='public'?limits.public:limits.private;
  const limitMessage=(n:number)=>n===0?'Tvorba nových '+(visibility==='public'?'veřejných':'soukromých')+' výprav je pro tento účet vypnutá.':'Limit '+(visibility==='public'?'veřejných':'soukromých')+' výprav na tomto účtu je '+n+'. Pro další nejprve některou smažte.';
  if (await expeditionCount(db(), account!.id,visibility) >= limit) throw new GameError(limitMessage(limit),409);
  const config = {...validateExpedition(input),visibility,...(visibility==='public'?{publicInfo:validatePublicInfo(input.publicInfo),published:false}:{})};
  if(visibility==='public'&&config.mode!=='race')throw new GameError('Veřejné výpravy se hrají výhradně na čas.');
  const ownerToken = token(), ownerHash = await hash(ownerToken);
  const game = { ...config, status: 'waiting', startedAt: null, createdAt: Date.now() };
  for (let attempt = 0; attempt < 8; attempt++) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(crypto.getRandomValues(new Uint8Array(7)), v => alphabet[v % alphabet.length]).join('');
    // Keep photos in this application's private bucket, never in a shared Stopař store.
    const stored = await storePhotos(structuredClone(game), code);
    const results = await reserveExpedition(db(), {code, ownerHash, payload:JSON.stringify(stored), userId:account!.id, now:Date.now()});
    if (results[1].meta.changes) return json({ code, ownerToken }, 201);
    try { await removeReplacedPhotos(stored,{stations:[]},code,env.BUCKET); } catch { console.warn('Patrac rejected creation photo cleanup failed'); }
    const currentLimits=await creatorLimits(db(),account!.id),currentLimit=visibility==='public'?currentLimits.public:currentLimits.private;
    if (await expeditionCount(db(),account!.id,visibility)>=currentLimit) throw new GameError(limitMessage(currentLimit),409);
  }
  throw new GameError('Kód se nepodařilo vytvořit. Zkuste to znovu.', 503);
}
export async function viewExpedition(request: Request, code: string) {
  const { row, game } = await getGame(code), who = await identity(request, row), now = Date.now();
  if (game.status === 'deleting' && who.role !== 'owner') throw new GameError('Organizátor tuto výpravu odstranil.',410);
  const meta = { code, name: game.name, mode: game.mode, status: game.status, startedAt: game.startedAt, totalStations: game.stations.length, visibility:game.visibility||'private' };
  if (who.role === 'owner') {
    const publicLocked=game.visibility==='public'?!!await db().prepare('SELECT id FROM patrac_public_attempts WHERE code=? LIMIT 1').bind(code).first():false;
    const playerNames=game.visibility==='public'?"SELECT json_set(t.payload,'$.name',COALESCE(u.name,json_extract(t.payload,'$.name'))) AS payload FROM patrac_teams t LEFT JOIN patrac_public_attempts a ON a.team_id=t.id LEFT JOIN patrac_auth_user u ON u.id=a.user_id WHERE t.code=?":"SELECT json_set(t.payload,'$.name',COALESCE(u.name,json_extract(t.payload,'$.name'))) AS payload FROM patrac_teams t LEFT JOIN patrac_auth_user u ON u.id=t.user_id WHERE t.code = ?";
    const rows=await db().prepare(playerNames).bind(code).all<any>();
    const teams = rows.results.map(r => JSON.parse(r.payload)).map(t => ({ ...t, ...score(game, t, now), timings: stationTimings(game, t) }));
    teams.sort((a, b) => (a.finishedAt ? 0 : 1) - (b.finishedAt ? 0 : 1) || (a.finishedAt && b.finishedAt ? (game.mode === 'race' ? a.totalMs - b.totalMs : a.finishedAt - b.finishedAt) : b.index - a.index) || a.joinedAt - b.joinedAt);
    const expanded = structuredClone(game);
    if (new URL(request.url).searchParams.get('photos') === '1') {
      for (const station of expanded.stations) station.hints = await Promise.all(station.hints.map(revealPhoto));
    }
    return json({ role: 'owner', game: { ...expanded, ...meta }, teams, publicLocked, now, version: row.version });
  }
  if (game.visibility==='public') return json({role:'guest',game:meta,now});
  if (who.role === 'team') {
    if(new URL(request.url).searchParams.get('summary')==='1')return json({role:'team',game:meta,team:{name:who.team.name,index:who.team.index,finishedAt:who.team.finishedAt},now});
    const counts = await db().prepare("SELECT COUNT(*) as total, SUM(CASE WHEN json_extract(payload, '$.finishedAt') IS NOT NULL THEN 1 ELSE 0 END) as finished FROM patrac_teams WHERE code = ?").bind(code).first();
    const projection = teamProjection(game, who.team, now);
    if (projection.station?.hints) projection.station.hints = await Promise.all(projection.station.hints.map(async (hint: any) => {
      const paid = who.team.events.some((e: any) => e.type === 'hint' && e.index === who.team.index && e.hintId === hint.id);
      if (!paid || hint.type !== 'photo') return hint;
      const original = game.stations[who.team.index].hints.find((h: any) => h.id === hint.id);
      return { ...hint, content: (await revealPhoto(original)).content };
    }));
    return json({ role: 'team', game: { ...meta, startedAt: who.team.startedAt ?? meta.startedAt }, team: projection, counts, now });
  }
  return json({ role: 'guest', game: meta, now });
}
export async function changeExpedition(request: Request, code: string) {
  const input = await body(request); const { row, game } = await getGame(code);
  if (input.action === 'delete') {
    const account = await creatorIdentity(request,true);
    return json(await removeExpedition(db(),env.BUCKET,{code,userId:account!.id,version:input.version,confirmation:input.confirmation}));
  }
  if (game.status === 'deleting') throw new GameError('Výprava se právě maže.',410);
  if (game.visibility==='public'&&['join','arrive','hint','answer'].includes(input.action))throw new GameError('Veřejnou výpravu zahajte přihlášeným účtem z mapy.',403);
  if (input.action === 'join') {
    const account=await creatorIdentity(request,true);
    if(await db().prepare('SELECT code FROM patrac_creator_games WHERE code=? AND creator_id=?').bind(code,account!.id).first())return json({ok:true,role:'owner'});
    const existing=await db().prepare('SELECT id FROM patrac_teams WHERE code=? AND user_id=?').bind(code,account!.id).first();
    if(existing)return json({ok:true});
    // Old keys can transfer an unclaimed private play once, never another user's play.
    if(/^[a-f0-9]{64}$/.test(input.teamToken||'')){
      const claimed=await db().prepare('UPDATE patrac_teams SET user_id=? WHERE code=? AND token_hash=? AND user_id IS NULL').bind(account!.id,code,await hash(input.teamToken)).run();
      if(claimed.meta.changes)return json({ok:true});
    }
    if (!['waiting','running'].includes(game.status)) throw new GameError('Výprava není dostupná pro nové hráče.',409);
    const team={...newTeam(crypto.randomUUID(),account!.nickname,Date.now()),...(game.status==='running'?{startedAt:Date.now()}:{})};
    const result=await db().prepare("INSERT OR IGNORE INTO patrac_teams(id,code,token_hash,name_key,payload,version,user_id) SELECT ?,?,?,?,?,0,? WHERE (SELECT json_extract(payload,'$.status') FROM patrac_expeditions WHERE code=?) IN ('waiting','running') AND (SELECT COUNT(*) FROM patrac_teams WHERE code=? AND json_extract(payload,'$.finishedAt') IS NULL)<30")
      .bind(team.id,code,await hash(token()),'account:'+account!.id,JSON.stringify(team),account!.id,code,code).run();
    if(!result.meta.changes&&!await db().prepare('SELECT id FROM patrac_teams WHERE code=? AND user_id=?').bind(code,account!.id).first())throw new GameError('Výprava je plná (30 aktivních hráčů).',409);
    return json({ok:true},201);
  }
  const who = await identity(request, row);
  if (who.role === 'owner') {
    if(game.visibility==='public'){
      if(!await communityReady(db()))throw new GameError('Veřejné výpravy se připravují.',503);
      if(input.action==='hide'){
        const changed=await db().prepare("UPDATE patrac_expeditions SET payload=json_set(payload,'$.published',json('false')),version=version+1 WHERE code=? AND version=?").bind(code,row.version).run();if(!changed.meta.changes)throw new GameError('Výprava se mezitím změnila.',409);return json({ok:true});
      }
      await requirePublicAccess(db(),env,who.accountId);
      if(input.action==='publish'){
        validatePublicInfo(game.publicInfo);validateExpedition(game);if(game.mode!=='race')throw new GameError('Veřejná výprava musí být na čas.');
        const changed=await db().prepare("UPDATE patrac_expeditions SET payload=json_set(payload,'$.published',json('true'),'$.status','running'),version=version+1 WHERE code=? AND version=?").bind(code,row.version).run();
        if(!changed.meta.changes)throw new GameError('Výprava se mezitím změnila.',409);return json({ok:true});
      }
      if(input.action!=='save')throw new GameError('Veřejnou výpravu zahajuje každý hráč samostatně.');
      if(input.version!==row.version)throw new GameError('Výprava se mezitím změnila. Obnovte ji.',409);
      if(await db().prepare('SELECT id FROM patrac_public_attempts WHERE code=? LIMIT 1').bind(code).first())throw new GameError('Po prvním zahájeném pokusu je veřejná trasa uzamčená kvůli férovému žebříčku.',409);
      const validated=validateExpedition(input.game);if(validated.mode!=='race')throw new GameError('Veřejná výprava musí být na čas.');
      const next=await storePhotos({...game,...validated,visibility:'public',publicInfo:validatePublicInfo(input.game.publicInfo)},code,game);
      const changed=await db().prepare('UPDATE patrac_expeditions SET payload=?,version=version+1 WHERE code=? AND version=? AND NOT EXISTS(SELECT 1 FROM patrac_public_attempts WHERE code=?)').bind(JSON.stringify(next),code,row.version,code).run();
      if(!changed.meta.changes){try{await removeReplacedPhotos(next,game,code,env.BUCKET);}catch{}throw new GameError('Mezitím někdo zahájil pokus nebo změnil trasu. Obnovte výpravu.',409);}
      try{await removeReplacedPhotos(game,next,code,env.BUCKET);}catch{}return json({ok:true});
    }
    await requirePaidAccess(env, who.accountId);
    if (game.status !== 'waiting') throw new GameError('Pravidla a trasu po startu nelze měnit.', 409);
    let next;
    if (input.action === 'save') {
      if (input.version !== row.version) throw new GameError('Výpravu mezitím změnilo jiné okno. Obnovte ji.', 409);
      next = await storePhotos({ ...game, ...validateExpedition(input.game) }, code, game);
    } else if (input.action === 'start') {
      const count = await db().prepare('SELECT COUNT(*) as n FROM patrac_teams WHERE code = ?').bind(code).first<any>();
      if (count.n < 1) throw new GameError('Nejdříve připojte alespoň jeden tým.');
      next = { ...game, status: 'running', startedAt: Date.now() };
    } else throw new GameError('Neznámá akce autora.');
    const sql = "UPDATE patrac_expeditions SET payload = ?, version = version + 1 WHERE code = ? AND version = ? AND json_extract(payload, '$.status') = 'waiting'";
    const values = [JSON.stringify(next), code, row.version];
    const result = await db().prepare(sql).bind(...values).run();
    if (!result.meta.changes) {
      if(input.action==='save')try { await removeReplacedPhotos(next,game,code,env.BUCKET); } catch { console.warn('Patrac rejected save photo cleanup failed'); }
      throw new GameError('Průběh se změnil. Obnovte výpravu.',409);
    }
    if (input.action === 'save') {
      try { await removeReplacedPhotos(game, next, code, env.BUCKET); } catch { console.warn('Patrac replaced photo cleanup failed'); }
    }
    return json({ ok: true });
  }
  if (who.role !== 'team') throw new GameError('Chybí přístupový klíč výpravy.', 403);
  // Compare-and-swap makes repeated requests and simultaneous hint taps safe.
  for (let attempt = 0; attempt < 5; attempt++) {
    const teamRow = attempt === 0 ? who.teamRow : await db().prepare('SELECT * FROM patrac_teams WHERE id = ?').bind(who.team.id).first<any>();
    const state = JSON.parse(teamRow.payload), next = applyAction(game, state, input, Date.now());
    const wrong = next.wrongAnswer; delete next.wrongAnswer;
    const result = await db().prepare('UPDATE patrac_teams SET payload = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(next), teamRow.id, teamRow.version).run();
    if (result.meta.changes) return json({ ok: true, wrongAnswer: Boolean(wrong) });
  }
  throw new GameError('Tým právě ukládá jinou akci. Obnovte průběh.', 409);
}
