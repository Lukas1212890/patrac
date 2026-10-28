'use client';
import { apiUrl } from '../lib/apiUrl.mjs';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Compass, ArrowLeft, ArrowRight, Plus, Users, Flag, Clock3, Trophy, LockKeyhole, Lightbulb, Image as ImageIcon, Navigation, Map as MapIcon, RefreshCw, Download, Copy, Check, ChevronRight, LocateFixed, HelpCircle, ShieldCheck, UserRound } from 'lucide-react';
import PatracEditor from './PatracEditor';
import CreatorAccount from './CreatorAccount';
import useCreatorAccount from './useCreatorAccount';
import { creatorAccessToken, creatorRequest } from '../lib/creator-client';
import TravelScreen from './TravelScreen';
import usePatracPosition from './usePatracPosition';
import { distanceTo } from '../lib/navigationMath';
import { draftOperation } from '../lib/draftStorage';
import { phoneHeading } from '../lib/compassTarget.mjs';
import { requestCompassAccess } from '../lib/compassPermission.mjs';
import { installHomeGestureLock } from '../lib/homeGestureLock.mjs';

const SESSIONS = 'patrac-sessions-v1';
const makeToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, '0')).join('');
export const time = ms => { const sec = Math.floor(Math.max(0, ms || 0) / 1000); return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(v => String(v).padStart(2, '0')).join(':'); };
function remembered() { try { const entries = JSON.parse(localStorage.getItem(SESSIONS)); return Array.isArray(entries) ? entries : []; } catch { return []; } }
function remember(session) { const entries = remembered().filter(s => !(s.code === session.code && s.role === session.role)); localStorage.setItem(SESSIONS, JSON.stringify([session, ...entries].slice(0, 40))); }
function download(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function request(path, token, data) {
  const account = await creatorAccessToken();
  const response = await fetch(apiUrl('/api/expeditions' + path), { method: data ? 'POST' : 'GET', cache: 'no-store', headers: { ...(account ? { 'X-Patrac-Account': account } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000) });
  let value; try { value = await response.json(); } catch { throw Error('Server nevrátil platnou odpověď. Zkuste to znovu.'); }
  if (!response.ok) throw Error(value.error || 'Požadavek se nepodařilo dokončit.'); return value;
}
function Brand({ home }) { return <button className="p-brand" onClick={home} aria-label="Pátrač – úvod"><Compass aria-hidden="true"/><span>PÁTRAČ<small>ZE SVĚTA STOPÍKA</small></span></button>; }
function Progress({ index, total }) { return <div className="p-progress" role="progressbar" aria-label="Vyřešená stanoviště" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}><span style={{ width: (index / total * 100) + '%' }}/></div>; }

export default function PatracApp() {
  const account = useCreatorAccount();
  const [accountGames, setAccountGames] = useState([]);
  useEffect(() => {
    if (!account.user) { setAccountGames([]); return; }
    let active = true; creatorRequest().then(result => { if (active) setAccountGames(result.games); }).catch(() => {});
    return () => { active = false; };
  }, [account.user?.id]);
  useEffect(() => { if (account.recovery) setView('account'); }, [account.recovery]);
  const [view, setView] = useState('home'), [session, setSession] = useState(null), [data, setData] = useState(null), [saved, setSaved] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [online, setOnline] = useState(true), [clock, setClock] = useState(Date.now()), [editInitial, setEditInitial] = useState(null), [code, setCode] = useState(''), [teamName, setTeamName] = useState(''), [joiningToken, setJoiningToken] = useState(null), [help, setHelp] = useState(false), [resumeOpen, setResumeOpen] = useState(false);
  const currentSession = useRef(null), offset = useRef(0), inFlight = useRef(false);
  useEffect(() => { if (view === 'home') return installHomeGestureLock(window); }, [view]);
  useEffect(() => { setSaved(remembered().filter(s => !s.pending)); const params = new URL(location.href).searchParams; if (params.get('code')) { setCode(params.get('code').toUpperCase()); setView('join'); } setOnline(navigator.onLine); const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, []);
  const enter = useCallback(async s => {
    if (s.role === 'owner') {
      if (!account.user) { setView('account'); return; }
      if (s.token) { try { await creatorRequest({ action: 'claim', games: [{ code: s.code, token: s.token }] }); } catch (e) { setError(e.message); return; } }
    }
    setResumeOpen(false); remember(s); currentSession.current = s; setSession(s); setData(null); setError(''); setView(s.role === 'owner' ? 'owner' : 'player'); setSaved(remembered().filter(s => !s.pending)); }, [account.user?.id]);
  useEffect(() => { if (!account.loading && !account.user && session?.role === 'owner') home(); }, [account.user?.id, account.loading, session?.role]);
  const refresh = useCallback(async () => {
    const s = currentSession.current; if (!s || !navigator.onLine) return;
    try { const value = await request('/' + s.code, s.token); if (currentSession.current !== s) return; if (value.role !== s.role) throw Error('Přístupový klíč není platný. Obnovte přístup ze zálohy.'); offset.current = value.now - Date.now(); setData(old => !old || value.now >= old.now ? value : old); setError(''); } catch (e) { setError(e.name === 'TimeoutError' ? 'Server neodpovídá. Průběh zůstává uložený; zkuste obnovit spojení.' : e.message); }
  }, []);
  useEffect(() => { if (!session) return; refresh(); const interval = setInterval(() => { if (!document.hidden) refresh(); }, 5000); const resume = () => { if (!document.hidden) refresh(); }; window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume); window.addEventListener('pageshow', resume); return () => { clearInterval(interval); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); window.removeEventListener('pageshow', resume); }; }, [session?.code, session?.token, refresh]);
  function home() { currentSession.current = null; setSession(null); setData(null); setError(''); setView('home'); setResumeOpen(false); history.replaceState(null, '', '/'); }
  async function action(input) {
    if (inFlight.current || !currentSession.current) return;
    if (!navigator.onLine) { setError('Jste offline. Po obnovení spojení můžete pokračovat. Čas stále běží.'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try { const result = await request('/' + session.code, session.token, input); await refresh(); if (result.wrongAnswer) setError('Tohle řešení nesedí. Zkuste to znovu za 5 sekund.'); return result; } catch (e) { setError(e.message); } finally { inFlight.current = false; setBusy(false); }
  }
  async function save(draft) {
    setBusy(true); try {
      if (editInitial && session?.role === 'owner') { await request('/' + session.code, session.token, { action: 'save', game: draft, version: data.version }); await refresh(); setView('owner'); }
      else { const result = await request('', null, draft); await enter({ code: result.code, token: result.ownerToken, name: draft.name, role: 'owner' });
        const profile = await creatorRequest(); setAccountGames(profile.games); await draftOperation('delete').catch(() => {}); }
    } finally { setBusy(false); }
  }
  async function join(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { const normalized = code.trim().toUpperCase(), previous = remembered().find(s => s.code === normalized && s.role === 'team'); if (previous && !previous.pending) { enter(previous); return; }
      const token = previous?.token || joiningToken || makeToken(); setJoiningToken(token);
      // Persist a pending key before sending: a lost response must not create a second team.
      const s = { code: normalized, token, role: 'team', name: teamName.trim() }; remember({ ...s, pending: true });
      await request('/' + normalized, null, { action: 'join', teamToken: token, name: teamName.trim() }); enter(s);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function restore(file) { if (!file) return; try { const value = JSON.parse(await file.text()); if (value.app !== 'patrac' || !/^[a-f0-9]{64}$/.test(value.session?.token || '') || !['owner', 'team'].includes(value.session?.role)) throw Error(); await enter(value.session); } catch { setError('Tento soubor není platná záloha přístupu Pátrače.'); } }
  const availableGames = [...accountGames, ...saved.filter(s => s.role === 'team' || account.user)].filter((s, i, all) => all.findIndex(other => other.code === s.code && other.role === s.role) === i);
  const now = clock + offset.current;
  return <div className={'p-app p-view-' + view + (!account.user ? ' p-guest' : '')}>
    <header className="p-header"><Brand home={home}/><div className="p-header-actions"><span className="p-desktop-label">Dobrodružství začíná venku.</span><button className="p-icon-button" aria-label="Jak se hraje" onClick={() => setHelp(true)}><HelpCircle size={21}/></button><button className="p-icon-button" aria-label={account.user ? "Můj profil" : "Přihlášení pro tvůrce"} onClick={() => setView('account')}><UserRound size={20}/></button>{session && <button className="p-icon-button" aria-label="Obnovit průběh" onClick={refresh}><RefreshCw size={19}/></button>}</div></header>
    {!online && <div className="p-connection" role="status">Jste offline. Čas běží dál. Hra se připojí, jakmile bude signál.</div>}
    {error && <div className="p-alert p-global-alert" role="alert">{error}</div>}
    {view === 'home' && <main className="p-home"><div className="p-home-copy"><h1>Dobrodružství začíná první stopou.</h1><div className="p-home-illustration" role="img" aria-label="Fantasy cesta přes most k pokladu"/><p>Najděte místo. Vyřešte šifru.<br/>Objevte poklad.</p><div className="p-home-actions"><button className="p-primary" onClick={() => { setView('join'); setError(''); }}><Compass size={21}/> {account.user ? 'Připojit se k výpravě' : 'Hrát hru'}</button>{account.user && <button className="p-secondary" onClick={() => { setEditInitial(null); setView('editor'); }}><Plus size={20}/> Vytvořit výpravu</button>}{(account.user || availableGames.length > 0) && <button className="p-secondary p-resume-button" onClick={() => availableGames.length === 1 ? enter(availableGames[0]) : setResumeOpen(true)}><RefreshCw size={19}/> Pokračovat ve hře <ChevronRight size={18}/></button>}{!account.user && <button className="p-text-button p-creator-entry" onClick={() => setView('account')}>Přihlášení pro tvůrce</button>}</div></div></main>}
    {resumeOpen && <SavedGames sessions={availableGames} onEnter={enter} onRestore={restore} onClose={() => setResumeOpen(false)}/>}
    {view === 'account' && <CreatorAccount user={account.user} recovery={account.recovery} onBack={home} onSignedIn={home} onSignedOut={home} onRecoveryDone={account.finishRecovery} savedOwners={saved.filter(s => s.role === 'owner' && s.token)} onEnter={enter}/>}
    {view === 'join' && <main className="p-narrow"><button className="p-back" onClick={home}><ArrowLeft size={18}/> Zpět</button><div className="p-panel p-join"><Compass className="p-big-icon"/><span className="p-kicker">DOBRODRUŽSTVÍ VOLÁ</span><h1>Připravte svůj tým.</h1><p>Zadejte kód od organizátora. Jeden tým hraje na jednom telefonu.</p><form onSubmit={join}><label className="p-label">Kód výpravy<input className="p-code-input" value={code} maxLength={7} required autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="LES742A" onChange={e => { setCode(e.target.value.toUpperCase()); setJoiningToken(null); }}/></label><label className="p-label">Název týmu<input value={teamName} required maxLength={40} placeholder="Třeba Vlci" onChange={e => setTeamName(e.target.value)}/></label><button className="p-primary" disabled={busy || !online}>{busy ? 'Připojuji…' : 'Připojit tým'}<ArrowRight size={18}/></button></form></div></main>}
    {view === 'editor' && account.user && <PatracEditor initial={editInitial} onSave={save} saving={busy} onBack={() => editInitial ? setView('owner') : home()}/>}
    {(view === 'owner' || view === 'player') && !data && <main className="p-narrow p-panel"><Compass className="p-big-icon"/><h1>Hledáme vaši výpravu…</h1><button className="p-secondary" onClick={refresh}>Obnovit</button></main>}
    {view === 'owner' && data && <Owner data={data} now={now} busy={busy} online={online} onAction={action} onEdit={async () => { setBusy(true); try { const full = await request('/' + session.code + '?photos=1', session.token); setEditInitial(full.game); setView('editor'); } catch (e) { setError(e.message); } finally { setBusy(false); } }} onBackup={() => download({ app: 'patrac', session }, `patrac-autor-${session.code}.json`)}/>}
    {view === 'player' && data && <Player data={data} now={now} busy={busy} online={online} onAction={action} onBackup={() => download({ app: 'patrac', session }, `patrac-tym-${session.code}.json`)}/>}
    {view === 'demo' && <Demo onBack={home}/>}
    {help && <div className="p-modal-backdrop"><section className="p-modal" role="dialog" aria-modal="true" aria-labelledby="p-help-title"><span className="p-kicker">JAK SE HRAJE</span><h2 id="p-help-title">Od první stopy až k pokladu.</h2><ol><li>Organizátor vybere místa a připraví hádanky.</li><li>Týmy se připojí kódem a čekají na společný start.</li><li>GPS na místě odemkne hádanku. Správná odpověď odhalí další cíl.</li><li>V závodu se k času přičítají použité nápovědy. V honu za pokladem nápovědy nejsou.</li></ol><p className="p-small">Při externí navigaci se na místě vraťte do Pátrače. Pro ověření příchodu potřebujete polohu a připojení. Za pohybu sledujte okolí a držte se přístupných cest.</p><button className="p-primary" onClick={() => setHelp(false)}>Rozumím, jdeme na to</button></section></div>}
  </div>;
}
function MapPinIcon() { return <LocateFixed size={17}/>; }

function Owner({ data, now, busy, online, onAction, onEdit, onBackup }) {
  const { game, teams } = data; const [selected, setSelected] = useState(null), [copied, setCopied] = useState(false), [confirmStart, setConfirmStart] = useState(false);
  const team = teams.find(t => t.id === selected), allDone = teams.length > 0 && teams.every(t => t.finishedAt);
  async function copy() { try { await navigator.clipboard.writeText(location.origin + '/?code=' + game.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { alert('Kód výpravy: ' + game.code); } }
  return <main className="p-content"><div className="p-section-heading"><span className="p-kicker">PŘEHLED ORGANIZÁTORA</span><h1>{game.name}</h1><div className="p-row p-wrap"><span className="p-badge"><Flag size={15}/>{game.mode === 'race' ? 'Závod na čas' : 'Hon za pokladem'}</span><span className="p-badge"><Users size={15}/>{teams.length} týmů</span><span className="p-badge"><Clock3 size={15}/>{game.startedAt ? time(now - game.startedAt) : 'Čekáme na start'}</span></div></div>
    <div className="p-owner-grid"><section><div className="p-panel p-invite"><div><span className="p-kicker">KÓD VÝPRAVY</span><div className="p-game-code">{game.code}</div></div><button className="p-secondary" onClick={copy}>{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? 'Zkopírováno' : 'Pozvat týmy'}</button></div>
      {game.status === 'waiting' && <div className="p-panel p-start-panel"><h2>Všichni připraveni?</h2><p>Připojené týmy odstartují ve stejný okamžik. Po startu se trasa a pravidla uzamknou.</p><button className="p-primary" disabled={busy || !online || teams.length === 0} onClick={() => setConfirmStart(true)}><Flag size={19}/> Odstartovat výpravu</button>{teams.length === 0 && <p className="p-small">Nejdříve připojte alespoň jeden tým.</p>}{teams.length === 0 && <button className="p-text-button" onClick={onEdit}>Upravit trasu a hádanky <ChevronRight size={16}/></button>}</div>}
      <div className="p-row p-between p-list-heading"><h2>{allDone ? 'Konečné výsledky' : 'Průběh týmů'}</h2><span className="p-small">Aktualizace po 5 s</span></div>{teams.length === 0 ? <div className="p-empty"><Users/><p>Tady se objeví první dobrodruzi.</p></div> : teams.map((t, i) => <button key={t.id} className={'p-panel p-team-card ' + (selected === t.id ? 'active' : '')} onClick={() => setSelected(selected === t.id ? null : t.id)}><span className="p-crest">{t.finishedAt ? <Trophy/> : <Users/>}</span><div className="p-team-info"><div className="p-row p-between"><strong>{allDone ? `${i + 1}. ` : ''}{t.name}</strong><span>{t.index} / {game.totalStations}</span></div><Progress index={t.index} total={game.totalStations}/><small>{t.finishedAt ? 'V cíli' : game.status === 'waiting' ? 'Připraven na start' : t.arrivedAt ? 'Luští hádanku' : 'Na cestě'} · Nápovědy {t.events.filter(e => e.type === 'hint').length}</small></div><div className="p-team-time"><strong>{time((t.finishedAt || now) - (game.startedAt || now) + (game.mode === 'race' ? t.penaltyMs : 0))}</strong>{t.penaltyMs > 0 && <small>+{t.penaltyMs / 60000} min</small>}</div><ChevronRight size={17}/></button>)}
      {!allDone && game.status === 'running' && game.mode === 'race' && <p className="p-small">Vítěze určí až výsledné časy všech týmů včetně penalizací.</p>}
    </section><aside><section className="p-panel"><span className="p-kicker">{team ? 'DETAIL TÝMU' : 'TRASA VÝPRAVY'}</span><h2>{team ? team.name : `${game.totalStations} zastavení k pokladu`}</h2>{team ? <><div className="p-score"><span>Výsledný čas</span><strong>{time((team.finishedAt || now) - (game.startedAt || now) + (game.mode === 'race' ? team.penaltyMs : 0))}</strong><small>Hra {time((team.finishedAt || now) - (game.startedAt || now))} + nápovědy {time(team.penaltyMs)}</small></div>{team.timings.map(t => <div className="p-timeline" key={t.index}><strong>{t.index + 1}. {t.name}</strong><small>Přesun {t.travelMs === null ? '—' : time(t.travelMs)} · Luštění {t.solveMs === null ? 'probíhá' : time(t.solveMs)}</small>{t.arrivedAt && <small>Příchod {new Date(t.arrivedAt).toLocaleTimeString('cs-CZ')}</small>}{t.hints.map(h => <span className="p-hint-log" key={h.hintId}>{h.hintType === 'photo' ? 'Fotografická' : 'Textová'} nápověda +{h.penaltyMs / 60000} min · {new Date(h.at).toLocaleTimeString('cs-CZ')}</span>)}</div>)}</> : game.stations.map((s, i) => <div className="p-route-summary" key={s.id}><span className="p-station-number">{i + 1}</span><div><strong>{s.name}</strong><small>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</small></div></div>)}</section>
      <section className="p-panel p-backup"><ShieldCheck size={22}/><h3>Výprava patří vašemu účtu</h3><p className="p-small">Přihlaste se stejným účtem Pátrače na telefonu nebo počítači. Výpravu najdete v profilu mezi vlastními výpravami.</p></section></aside></div>
    {confirmStart && <div className="p-modal-backdrop"><section className="p-modal" role="dialog" aria-modal="true" aria-labelledby="p-start-title"><h2 id="p-start-title">Odstartovat {teams.length} týmů?</h2><p>Spustí se společný čas. Další týmy už nepůjde připojit a pravidla se uzamknou.</p><button className="p-primary" disabled={busy} onClick={async () => { await onAction({ action: 'start' }); setConfirmStart(false); }}>Ano, odstartovat</button><button className="p-secondary" onClick={() => setConfirmStart(false)}>Ještě počkat</button></section></div>}
  </main>;
}

function Player({ data, now, busy, online, onAction, onBackup }) {
  const { game, team, counts } = data; const running = game.status === 'running' && !team.finishedAt;
  const { position, error, retry } = usePatracPosition(running), [answer, setAnswer] = useState(''), [hint, setHint] = useState(null), [heading, setHeading] = useState(null), [orientationError, setOrientationError] = useState(''), [compassPermission, setCompassPermission] = useState('unknown');
  const attempted = useRef({ key: '', at: 0 }), station = team.station;
  useEffect(() => { setAnswer(''); setHint(null); attempted.current = { key: '', at: 0 }; }, [team.index]);
  useEffect(() => { const orient = e => { const h = phoneHeading(e, window.screen.orientation?.angle ?? window.orientation ?? 0); if (h !== null) setHeading(h); }; window.addEventListener('deviceorientationabsolute', orient, true); window.addEventListener('deviceorientation', orient, true); return () => { window.removeEventListener('deviceorientationabsolute', orient, true); window.removeEventListener('deviceorientation', orient, true); }; }, []);
  async function enableCompass() {
    // Start the native permission request synchronously inside the button tap.
    const access = requestCompassAccess(window);
    setCompassPermission('requesting'); setOrientationError('');
    const result = await access; setCompassPermission(result);
    if (result === 'denied') setOrientationError('Přístup k pohybu a orientaci není povolený. Povolte ho pro Pátrače v nastavení prohlížeče.');
    if (result === 'unsupported') setOrientationError('Tento prohlížeč neposkytuje kompas. Můžete použít mapovou navigaci.');
  }
  const distance = position && station ? distanceTo(position, station) : null;
  useEffect(() => {
    if (!position || !station || team.arrivedAt || busy || !online || (position.samples < 2 && position.acc > 10) || position.acc > Math.min(30, station.radius) || distance > station.radius || Date.now() - position.timestamp > 20000) return;
    const key = `${team.index}:${position.timestamp}`; if (attempted.current.key === key || Date.now() - attempted.current.at < 4000) return;
    const fix = position.arrivalFix || position;
    attempted.current = { key, at: Date.now() }; onAction({ action: 'arrive', index: team.index, position: { ...fix, timestamp: fix.timestamp + (now - Date.now()) } });
  }, [position, team.index, team.arrivedAt, busy, online, station, distance]);
  if (game.status === 'waiting') return <main className="p-narrow"><div className="p-panel p-lobby"><div className="p-crest large"><Users/></div><span className="p-kicker">TÝM {team.name}</span><h1>Vaše výprava brzy začne.</h1><p>Organizátor odstartuje všechny týmy současně. Nechte tuto obrazovku otevřenou.</p><div className="p-lobby-pulse"><span/> Čekáme na start</div><p className="p-small">Připojeno týmů: {counts?.total || 1} · Kód {game.code}</p><button className="p-text-button" onClick={onBackup}><Download size={16}/> Zálohovat přístup týmu</button></div></main>;
  const elapsed = (team.finishedAt || now) - game.startedAt, total = elapsed + (game.mode === 'race' ? team.penaltyMs : 0);
  if (team.finishedAt) return <main className="p-narrow"><div className="p-panel p-finish"><Trophy className="p-big-icon"/><span className="p-kicker">VÝPRAVA DOKONČENA</span><h1>{team.name}, jste v cíli!</h1><p>{game.mode === 'race' ? 'Vaše šifry jsou vyřešené. Pořadí vyhodnotí organizátor podle výsledných časů všech týmů.' : 'Poklad je nalezený. Organizátor vidí pořadí týmů podle dokončení.'}</p><div className="p-score"><span>Výsledný čas</span><strong>{time(total)}</strong><small>Čas hry {time(elapsed)}{game.mode === 'race' ? ' + nápovědy ' + time(team.penaltyMs) : ''}</small></div><p className="p-small">Dokončeno týmů {counts?.finished || 1} z {counts?.total || 1}</p><button className="p-secondary" onClick={onBackup}><Download size={17}/> Zálohovat přístup</button></div></main>;
  if (!team.arrivedAt && station) return <TravelScreen game={game} team={team} position={position} heading={heading} error={error} orientationError={orientationError} compassPermission={compassPermission} elapsed={elapsed} total={total} onEnableCompass={enableCompass} onRetry={retry}/>;
  return <main className="p-content p-player"><div className="p-player-top"><span className="p-badge"><Users size={16}/> {team.name}</span><span className="p-badge p-clock"><Clock3 size={16}/>{time(elapsed)}</span></div><div className="p-player-heading"><span className="p-kicker">{game.name}</span><Progress index={team.index} total={game.totalStations}/><p className="p-small">Stanoviště {team.index + 1} / {game.totalStations}</p><h1>{station?.name}</h1></div>
    {team.arrivedAt && station && <section className="p-panel p-riddle"><span className="p-arrived"><LocateFixed size={17}/> Jste na místě</span><div className="p-parchment"><Compass size={30}/><p>{station.question}</p></div><form onSubmit={async e => { e.preventDefault(); const result = await onAction({ action: 'answer', index: team.index, answer }); if (result?.ok && !result.wrongAnswer) setAnswer(''); }}><label className="p-label">Vaše odpověď<input autoComplete="off" value={answer} required maxLength={1000} onChange={e => setAnswer(e.target.value)} placeholder="Napište řešení…"/></label><button className="p-primary" disabled={busy || !online}><LockKeyhole size={18}/>{busy ? 'Ověřuji…' : team.index === game.totalStations - 1 ? 'Potvrdit poslední odpověď' : 'Odemknout další souřadnice'}</button></form>
      {game.mode === 'race' && station.hints?.length > 0 && <div className="p-hints"><h3>Potřebujete postrčit?</h3>{station.hints.map(h => <div className="p-hint-item" key={h.id}>{h.content ? h.type === 'photo' ? <img className="p-hint-photo" src={h.content} alt="Odemčená fotografická nápověda"/> : <p className="p-revealed-hint">{h.content}</p> : <button className="p-secondary" disabled={busy || !online} onClick={() => setHint(h)}>{h.type === 'photo' ? <ImageIcon size={20}/> : <Lightbulb size={20}/>} {h.type === 'photo' ? 'Fotografická' : 'Textová'} nápověda <span className="p-gold">+{h.minutes} min</span></button>}</div>)}</div>}{game.mode === 'treasure' && <p className="p-small">Hon za pokladem · hrajete bez nápověd.</p>}
    </section>}
    <div className="p-player-score"><Clock3 size={17}/><span>Čas hry {time(elapsed)}</span>{game.mode === 'race' && <><span>Penalizace +{time(team.penaltyMs)}</span><strong>Výsledek {time(total)}</strong></>}</div>
    {hint && <div className="p-modal-backdrop"><section className="p-modal" role="dialog" aria-modal="true" aria-labelledby="p-hint-title"><Lightbulb className="p-big-icon"/><h2 id="p-hint-title">Otevřít nápovědu?</h2><p>K výslednému času se přičte <strong>{hint.minutes} min</strong>. Hra bude pokračovat okamžitě. Tuto nápovědu pak můžete číst opakovaně bez další penalizace.</p><button className="p-primary" disabled={busy} onClick={async () => { await onAction({ action: 'hint', index: team.index, hintId: hint.id }); setHint(null); }}>Otevřít nápovědu +{hint.minutes} min</button><button className="p-secondary" onClick={() => setHint(null)}>Ještě zkusíme luštit</button></section></div>}
  </main>;
}

function Demo({ onBack }) {
  const [step, setStep] = useState(0), [answer, setAnswer] = useState(''), [message, setMessage] = useState(''), [hint, setHint] = useState(false);
  if (step === 0) return <TravelScreen simulated game={{name:'Tajemství starého dubu',mode:'race',totalStations:3}} team={{name:'Ukázkový tým',index:0,penaltyMs:0,station:{name:'Starý dub',lat:49.3,lng:17.39,radius:25}}} position={{lat:49.29925,lng:17.389,acc:5}} heading={42} elapsed={1122000} total={1122000} onEnableCompass={() => {}} onRetry={() => {}} onDemoArrival={() => setStep(1)}/>;
  return <main className="p-narrow"><button className="p-back" onClick={onBack}><ArrowLeft size={18}/> Zpět</button><div className="p-demo-badge">UKÁZKA · POLOHA A ČAS JSOU SIMULOVANÉ</div><section className="p-panel p-demo"><span className="p-kicker">TAJEMSTVÍ STARÉHO DUBU</span><h1>{step === 0 ? 'Vyrazte za první stopou.' : step === 1 ? 'Jste na místě.' : 'První šifra je vaše!'}</h1>{step === 1 ? <><div className="p-parchment"><p>Na slunci tě provázím, ve tmě zmizím. Co jsem?</p></div><form onSubmit={e => { e.preventDefault(); if (['stín', 'stin'].includes(answer.toLowerCase().trim())) setStep(2); else setMessage('Ještě ne. Zkuste to znovu.'); }}><label className="p-label">Vaše odpověď<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Napište řešení…"/></label><button className="p-primary">Odemknout další stopu</button></form><button className="p-secondary" onClick={() => setHint(true)}><Lightbulb size={18}/> Nápověda +2 min</button>{hint && <p className="p-revealed-hint">Podívejte se na zem za sebe. Odpověď je stín.</p>}{message && <p role="status">{message}</p>}</> : <><Trophy className="p-big-icon"/><p>V opravdové výpravě by se teď otevřely souřadnice dalšího místa. Organizátor uvidí vyřešenou šifru i případnou nápovědu.</p><button className="p-primary" onClick={onBack}>Pustit se do vlastní výpravy <ArrowRight size={18}/></button></>}</section></main>;
}

function SavedGames({ sessions, onEnter, onRestore, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => previous?.focus?.();
  }, []);
  function keys(event) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const nodes = Array.from(dialog.current.querySelectorAll('button,input')).filter(el => !el.disabled);
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <div className="p-modal-backdrop" onClick={onClose}><section ref={dialog} className="p-modal p-saved-modal" role="dialog" aria-modal="true" aria-labelledby="p-saved-title" onKeyDown={keys} onClick={e => e.stopPropagation()}><h2 id="p-saved-title">Pokračovat ve hře</h2><p>{sessions.length ? 'Vyberte tým nebo výpravu, kterou spravujete.' : 'V tomto zařízení zatím není uložená žádná hra. Připojte se k výpravě, vytvořte vlastní nebo obnovte přístup ze zálohy.'}</p><div className="p-saved-list">{sessions.map(s => <button className="p-saved-game" key={s.code + s.role} onClick={() => onEnter(s)}><span className="p-crest">{s.role === 'owner' ? <Flag/> : <Users/>}</span><span><strong>{s.name}</strong><small>{s.role === 'owner' ? 'Správa vytvořené hry' : 'Můj tým'} · {s.code}</small></span><ChevronRight size={18}/></button>)}</div><label className="p-secondary p-upload">Obnovit přístup ze zálohy<input aria-label="Obnovit přístup ze zálohy" type="file" accept="application/json,.json" onChange={e => onRestore(e.target.files[0])}/></label><button className="p-text-button p-saved-close" onClick={onClose}>Zavřít</button></section></div>;
}
