'use client';
import {attemptStartedAt} from '../../shared/playLimits.mjs';
import SafetyNotice from './SafetyNotice';
import {nextWrongAnswerMessage} from '../lib/wrongAnswerMessages.mjs';
import HowToPlay from './HowToPlay';
import PublicationSuccess from './PublicationSuccess';
import ExpeditionStoryGate from './ExpeditionStoryGate';
import DeletionCountdown from './DeletionCountdown';
import { apiUrl } from '../lib/apiUrl.mjs';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Compass, ArrowLeft, ArrowRight, Plus, Users, Flag, Clock3, Trophy, LockKeyhole, Lightbulb, Image as ImageIcon, Navigation, MapPin, Map as MapIcon, RefreshCw, Download, Copy, Check, ChevronRight, LocateFixed, HelpCircle, ShieldCheck, UserRound, Trash2, Globe2, Map as MapTab, Footprints, Menu } from 'lucide-react';
import ExpeditionMenu from './ExpeditionMenu';
import OwnerReviews from './OwnerReviews';
import CreatorStats from './CreatorStats';
import ProfileButton from './ProfileButton';
import {profileNavigationURL} from '../../shared/profileNavigation.mjs';
import RouteEstimateNote from './RouteEstimateNote';
import {formatRouteDistance} from '../../shared/routeEstimate.mjs';
import CommunityMap from './CommunityMap';
import PublicExpeditionDetail, {StartConfirmation} from './PublicExpeditionDetail';
import CreatorHub from './CreatorHub';
import PlayLibrary from './PlayLibrary';
import CommunityRankings from './CommunityRankings';
import CreatorRewardNotice from './CreatorRewardNotice';
import CreatorNotices from './CreatorNotices';
import useCreatorNotices from './useCreatorNotices';
import {publicRequest} from '../lib/public-client';
import {checkPrivateHistory,mergePrivateHistory} from '../lib/privateHistory.mjs';
import PatracEditor from './PatracEditor';
import DeleteExpeditionDialog from './DeleteExpeditionDialog';
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
export const time = ms => { const sec = Math.floor(Math.max(0, ms || 0) / 1000); return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(v => String(v).padStart(2, '0')).join(':'); };
function remembered() { try { const entries = JSON.parse(localStorage.getItem(SESSIONS)); return Array.isArray(entries) ? entries : []; } catch { return []; } }
function remember(session) { const entries = remembered().filter(s => !(s.code === session.code && s.role === session.role)); localStorage.setItem(SESSIONS, JSON.stringify([session, ...entries].slice(0, 40))); }
function download(value, name) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function request(path, token, data, signal) {
  const account = await creatorAccessToken();
  const response = await fetch(apiUrl('/api/expeditions' + path), { method: data ? 'POST' : 'GET', cache: 'no-store', headers: { ...(account ? { 'X-Patrac-Account': account } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}), signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  let value; try { value = await response.json(); } catch { throw Error('Server nevrátil platnou odpověď. Zkuste to znovu.'); }
  if (!response.ok) throw Object.assign(Error(value.error || 'Požadavek se nepodařilo dokončit.'), {status:response.status}); return value;
}
function Brand({ home }) { return <button className="p-brand" onClick={home} aria-label="Pátrač – úvod"><Compass aria-hidden="true"/><span>PÁTRAČ<small>ZE SVĚTA STOPÍKA</small></span></button>; }
function Progress({ index, total }) { return <div className="p-progress" role="progressbar" aria-label="Vyřešená stanoviště" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}><span style={{ width: (index / total * 100) + '%' }}/></div>; }

export default function PatracApp() {
  const account = useCreatorAccount();
  const notificationState=useCreatorNotices(account.user?.id);
  const notices=notificationState.unreadNotices;
  const [accountGames, setAccountGames] = useState([]);
  useEffect(() => {
    if (!account.user) { setAccountGames([]); return; }
    let active = true; creatorRequest().then(result => { if (active) setAccountGames(result.games); }).catch(() => {});
    return () => { active = false; };
  }, [account.user?.id]);
  useEffect(() => { if (account.recovery) setView('account'); }, [account.recovery]);
  const [menuOpen,setMenuOpen]=useState(false);
  const [preparation,setPreparation]=useState(null);
  const [view, setView] = useState('home'), [publicCode,setPublicCode]=useState(null), [publicBack,setPublicBack]=useState('home'), [rankingTab,setRankingTab]=useState('expeditions'), [rewardNotice,setRewardNotice]=useState(false), [creationVisibility,setCreationVisibility]=useState('private'), [session, setSession] = useState(null), [data, setData] = useState(null), [saved, setSaved] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [online, setOnline] = useState(true), [clock, setClock] = useState(Date.now()), [editInitial, setEditInitial] = useState(null), [editVersion, setEditVersion] = useState(null), [code, setCode] = useState(''), [help, setHelp] = useState(false), [resumeOpen, setResumeOpen] = useState(false);
  useEffect(()=>{if(view==='public-prepare'&&!account.loading&&!account.user)home();},[view,account.loading,account.user?.id]);
  useEffect(()=>{if(view==='account'&&account.user)notificationState.refresh();},[view,account.user?.id,notificationState.refresh]);
  const currentSession = useRef(null), offset = useRef(0), inFlight = useRef(false);
  const validatePrivateHistory=useCallback(async signal=>{
    const entries=remembered().filter(s=>s.role!=='team'||(account.user&&(!s.userId||s.userId===account.user.id)));
    if(!navigator.onLine)return{unverified:entries.some(s=>s.role==='team'&&!s.pending)};
    const result=await checkPrivateHistory(entries,(s,abort)=>request('/'+s.code+'?summary=1',s.token,undefined,abort),signal);
    if(signal?.aborted)return result;
    const remaining=mergePrivateHistory(remembered(),result.checked);
    try{localStorage.setItem(SESSIONS,JSON.stringify(remaining));}catch{}
    setSaved(remaining.filter(s=>!s.pending));return result;
  },[account.user?.id]);
  function forgetUnavailable(s){
    if(s.role==='public')return;
    const remaining=mergePrivateHistory(remembered(),[{session:s,removed:true}]);
    try{localStorage.setItem(SESSIONS,JSON.stringify(remaining));}catch{}
    setSaved(remaining.filter(s=>!s.pending));
  }

  useEffect(() => { if (view === 'home') return installHomeGestureLock(window); }, [view]);
  useEffect(() => { setSaved(remembered().filter(s => !s.pending)); const params = new URL(location.href).searchParams; if (params.get('public')&&/^[A-Z2-9]{7}$/.test(params.get('public').toUpperCase())) { setPublicCode(params.get('public').toUpperCase());setView('public-detail'); } if (params.get('billing')||params.get('account')==='profile') setView('account'); if (params.get('code')) { setCode(params.get('code').toUpperCase()); setView('join'); } setOnline(navigator.onLine); const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, []);
  const enter = useCallback(async s => {
    if (!account.user) { setView('account'); return; }
    if (s.role === 'owner') {
      if (!account.user) { setView('account'); return; }
      if (s.token) { try { await creatorRequest({ action: 'claim', games: [{ code: s.code, token: s.token }] }); } catch (e) { setError(e.message); return; } }
    }
    if(s.role==='team'){
      if(s.userId&&s.userId!==account.user.id){setError('Tato rozehraná hra patří jinému účtu.');return;}
      try{const result=await request('/'+s.code,null,{action:'join',...(s.token?{teamToken:s.token}:{})});s={...s,role:result.role==='owner'?'owner':'team',token:undefined,userId:account.user.id,name:account.user.name};}catch(e){setError(e.message);return;}
    }
    s={...s,userId:account.user.id};setResumeOpen(false); if(s.role!=='public')remember(s); currentSession.current = s; setSession(s); setData(null); setError(''); setView(s.role === 'owner' ? 'owner' : 'player'); setSaved(remembered().filter(s => !s.pending)); }, [account.user?.id,account.user?.name]);
  useEffect(() => { if(!account.loading&&session&&(!account.user||(session.userId&&session.userId!==account.user.id)))home(); }, [account.user?.id, account.loading, session?.role]);
  const openedReviewLink=useRef(null);
  useEffect(()=>{const code=new URL(location.href).searchParams.get('reviews');if(account.user&&code&&/^[A-Z2-9]{7}$/.test(code)&&openedReviewLink.current!==code+account.user.id){openedReviewLink.current=code+account.user.id;enter({role:'owner',code});}},[account.user?.id,enter]);
  const refresh = useCallback(async () => {
    const s = currentSession.current; if (!s || !navigator.onLine) return;
    try { const value = s.role==='public'?await publicRequest('/expeditions/'+s.code+'/play'):await request('/' + s.code, s.token); if (currentSession.current !== s) return; if (value.role !== (s.role==='public'?'team':s.role)) throw Error('Přístupový klíč není platný. Obnovte přístup ze zálohy.'); offset.current = value.now - Date.now(); setData(old => !old || value.now >= old.now ? value : old); setError(''); } catch (e) { if(currentSession.current!==s)return; if([401,402].includes(e.status)){currentSession.current=null;setSession(null);setData(null);setView('account');} if ([404,410].includes(e.status)) { if(s.role==='owner')window.dispatchEvent(new Event('patrac-notices-refresh')); forgetUnavailable(s); currentSession.current=null;setSession(null);setData(null);setView('removed'); } setError(e.name === 'TimeoutError' ? 'Server neodpovídá. Průběh zůstává uložený; zkuste obnovit spojení.' : e.message); }
  }, []);
  useEffect(() => { if (!session) return; refresh(); const interval = setInterval(() => { if (!document.hidden) refresh(); }, 5000); const resume = () => { if (!document.hidden) refresh(); }; window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume); window.addEventListener('pageshow', resume); return () => { clearInterval(interval); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); window.removeEventListener('pageshow', resume); }; }, [session?.code, session?.token, refresh]);
  function home() { setMenuOpen(false); setRewardNotice(false); currentSession.current = null; setSession(null); setData(null); setError(''); setView('home'); setResumeOpen(false); history.replaceState(null, '', '/'); }
  function openProfile(section='menu'){setMenuOpen(false);setView('account');history.replaceState(null,'',profileNavigationURL(section,location.href));window.dispatchEvent(new CustomEvent('patrac-profile-navigate',{detail:section}));}
  function navigate(next){setMenuOpen(false);setRewardNotice(false);currentSession.current=null;setSession(null);setData(null);setError('');setView(next);setResumeOpen(false);history.replaceState(null,'','/');}
  function showPublic(code){setPublicBack(view==='rankings'?'rankings':'home');navigate('public-detail');setPublicCode(code);history.replaceState(null,'','/?public='+code);}
  async function action(input) {
    if (inFlight.current || !currentSession.current) return;
    if (!navigator.onLine) { setError('Jste offline. Po obnovení spojení můžete pokračovat. Čas stále běží.'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try { const result = session.role==='public'?await publicRequest('/expeditions/'+session.code+'/play',input):await request('/' + session.code, session.token, input); await refresh(); return result; } catch (e) { setError(e.message); } finally { inFlight.current = false; setBusy(false); }
  }
  async function deleteCurrentExpedition(confirmation) {
    const target = currentSession.current;
    if (inFlight.current || !target || target.role !== 'owner') return;
    inFlight.current=true; setBusy(true); setError('');
    try {
      try { await request('/'+target.code,target.token,{action:'delete',confirmation,version:data.version}); }
      catch(e) { if(e.status!==404)throw e; }
      const remaining=remembered().filter(item=>item.code!==target.code);
      try { localStorage.setItem(SESSIONS,JSON.stringify(remaining)); } catch {}
      setSaved(remaining.filter(item=>!item.pending));setAccountGames(items=>items.filter(item=>item.code!==target.code));
      home();setView('library');
    } catch(e) { await refresh(); throw e; }
    finally { inFlight.current=false;setBusy(false); }
  }
  async function openEditor(visibility='private') {
    if (busy) return;
    if(!account.user){setView('account');return;}
    setBusy(true); setError('');
    try {
      const profile = await creatorRequest(); setAccountGames(profile.games);
      const limit=visibility==='public'?(profile.publicExpeditionLimit??2):(profile.expeditionLimit??3);
      if ((visibility==='public'?profile.publicExpeditionCount:profile.expeditionCount) >= limit) { setView('creator'); setError(limit===0?'Tvorba nových výprav tohoto typu je pro váš účet vypnutá.':'Dosáhli jste limitu ('+limit+') pro '+(visibility==='public'?'veřejné':'soukromé')+' výpravy. Pro další některou z této skupiny smažte.'); return; }
      const token = await creatorAccessToken();
      const response = await fetch(apiUrl('/api/billing'), { cache: 'no-store', headers: { 'X-Patrac-Account': token || '' }, signal: AbortSignal.timeout(15000) });
      const access = await response.json();
      if (!response.ok) throw Error(access.error || 'Přístup se nepodařilo ověřit.');
      if (access.enabled && !access.active) { openProfile('billing'); return; }
      setCreationVisibility(visibility); setEditInitial(null); setEditVersion(null); setView('editor');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function save(draft) {
    setBusy(true); try {
      if (editInitial && session?.role === 'owner') { await request('/' + session.code, session.token, { action: 'save', game: draft, version: editVersion }); await refresh(); setView('owner'); }
      else { const result = await request('', null, draft); await enter({ code: result.code, token: result.ownerToken, name: draft.name, role: 'owner' });
        const profile = await creatorRequest(); setAccountGames(profile.games); await draftOperation('delete',undefined,draft.visibility==='public'?'public-current':'current').catch(() => {}); }
    } finally { setBusy(false); }
  }
  async function join(e) {
    e.preventDefault(); setBusy(true); setError('');
    if(!account.user){setBusy(false);setView('account');return;}
    try { const normalized=code.trim().toUpperCase();
      const previous=remembered().find(s=>s.code===normalized&&s.role==='team'&&(!s.userId||s.userId===account.user.id));
      await enter(previous||{code:normalized,role:'team',name:account.user.name,userId:account.user.id});
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function restore(file) { if (!file) return; try { const value = JSON.parse(await file.text()); if (value.app !== 'patrac' || !/^[a-f0-9]{64}$/.test(value.session?.token || '') || !['owner', 'team'].includes(value.session?.role)) throw Error(); await enter(value.session); } catch { setError('Tento soubor není platná záloha přístupu Pátrače.'); } }
  const availableGames = [...accountGames, ...saved.filter(s => account.user&&(!s.userId||s.userId===account.user.id))].filter((s, i, all) => all.findIndex(other => other.code === s.code && other.role === s.role) === i);
  const now = clock + offset.current;
  return <div className={'p-app p-view-' + view + (!account.user ? ' p-guest' : '')}>
    <header className="p-header"><Brand home={home}/><div className="p-header-actions"><span className="p-desktop-label">Dobrodružství začíná venku.</span><button className="p-icon-button" aria-label="Jak se hraje" onClick={() => setHelp(true)}><HelpCircle size={21}/></button><ProfileButton user={account.user} unreadCount={notificationState.unreadCount} onClick={()=>openProfile('menu')}/>{(session || view==='public-prepare') && <button className="p-icon-button" aria-label="Menu výpravy" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Menu size={21}/></button>}</div></header>
    {account.user&&view!=='account'&&<CreatorNotices key={account.user.id} userId={account.user.id} notices={notices} onRead={notificationState.markRead} saving={notificationState.saving} error={notificationState.error} onOpenProfile={()=>openProfile('notifications')}/>}
    {!online && <div className="p-connection" role="status">Jste offline. Čas běží dál. Hra se připojí, jakmile bude signál.</div>}
    {error && <div className="p-alert p-global-alert" role="alert">{error}</div>}
    {view === 'home' && <CommunityMap key={account.user?.id||'guest'} userId={account.user?.id} onSelect={showPublic} onJoin={()=>navigate('join')}/>}
    {view==='public-detail'&&publicCode&&<PublicExpeditionDetail code={publicCode} user={account.user} onBack={()=>navigate(publicBack)} backLabel={publicBack==='rankings'?'Zpět na žebříčky':'Zpět na mapu'} onAccount={()=>openProfile(account.user?'billing':'menu')} onStarted={enter} onPrepare={expedition=>{setPreparation(expedition);setView('public-prepare');}}/>}
    {view==='public-prepare'&&preparation&&account.user&&<PublicPreparation key={preparation.code+account.user.id} expedition={preparation} user={account.user} online={online} onStarted={enter} onBack={()=>setView('public-detail')}/>}
    {view==='library'&&<PlayLibrary user={account.user} saved={saved.filter(s=>s.role==='team'&&(!s.userId||s.userId===account.user?.id))} savedOwners={saved.filter(s=>s.role==='owner'&&s.token)} onValidate={validatePrivateHistory} onEnter={enter} onAccount={()=>openProfile(account.user?'billing':'menu')} onRestore={restore}/>}
    {view==='rankings'&&<CommunityRankings user={account.user} tab={rankingTab} onTabChange={setRankingTab} onGames={()=>navigate('library')} onSelect={showPublic} onAccount={()=>openProfile(account.user?'billing':'menu')} onMap={home}/>}
    {view==='creator'&&<CreatorHub user={account.user} onAccount={()=>openProfile(account.user?'billing':'menu')} onCreate={visibility=>visibility==='public'?setRewardNotice(true):openEditor('private')} onGames={()=>navigate('library')}/>}
    {view==='creator'&&rewardNotice&&<CreatorRewardNotice onClose={()=>setRewardNotice(false)} onContinue={()=>{setRewardNotice(false);openEditor('public');}}/>}

    {resumeOpen && <SavedGames sessions={availableGames} onEnter={enter} onRestore={restore} onClose={() => setResumeOpen(false)}/>}
    {view === 'account' && <CreatorAccount notificationState={notificationState} user={account.user} recovery={account.recovery} onBack={home} onSignedIn={home} onSignedOut={home} onRecoveryDone={account.finishRecovery}/>}
    {view === 'removed' && <main className="p-narrow p-panel"><h1>Výprava už není dostupná</h1><p>Organizátor ji odstranil nebo její kód už neplatí.</p><button className="p-primary" onClick={home}>Zpět na úvod</button></main>}
    {view === 'join' && <main className="p-narrow"><button className="p-back" onClick={home}><ArrowLeft size={18}/> Zpět</button><div className="p-panel p-join"><Compass className="p-big-icon"/><span className="p-kicker">DOBRODRUŽSTVÍ VOLÁ</span><h1>Zahájit soukromou výpravu</h1><p>Zadejte kód od organizátora. Hrajete pod svou přezdívkou. Můžete vyrazit sami nebo společně na jeden účet. Předplatné není potřeba.</p><form onSubmit={join}><label className="p-label">Kód výpravy<input className="p-code-input" value={code} maxLength={7} required autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="LES742A" onChange={e => { setCode(e.target.value.toUpperCase()); }}/></label><button className="p-primary" disabled={busy || !online}>{busy ? 'Připojuji…' : account.user?'Zahájit výpravu':'Přihlásit se a hrát'}<ArrowRight size={18}/></button></form></div></main>}
    {view === 'editor' && account.user && <PatracEditor key={editInitial?.code||('new:'+creationVisibility)} defaultVisibility={creationVisibility} initial={editInitial} onSave={save} saving={busy} onBack={() => editInitial ? setView('owner') : navigate('creator')}/>}
    {(view === 'owner' || view === 'player') && !data && <main className="p-narrow p-panel"><Compass className="p-big-icon"/><h1>Hledáme vaši výpravu…</h1><button className="p-secondary" onClick={refresh}>Obnovit</button></main>}
    {view === 'owner' && data && <Owner user={account.user} data={data} now={now} busy={busy} online={online} onAction={action} onDelete={deleteCurrentExpedition} onShowPublic={()=>showPublic(session.code)} onEdit={async () => { setBusy(true); try { const full = await request('/' + session.code + '?photos=1', session.token); setEditInitial(full.game); setEditVersion(full.version); setView('editor'); } catch (e) { setError(e.message); } finally { setBusy(false); } }} onBackup={() => download({ app: 'patrac', session }, `patrac-autor-${session.code}.json`)}/>}
    {view === 'player' && data && <PrivatePlayer data={data} now={now} busy={busy} online={online} onAction={action} onBackup={() => session.role==='public'?showPublic(session.code):navigate('library')}/>}
    {['home','library','creator','account','join','public-detail','removed','rankings'].includes(view)&&<nav className="p-bottom-nav" aria-label="Hlavní navigace">{[['home','Mapa',MapTab],['library','Moje hry',Footprints],['creator','Tvořit',Plus],['rankings','Žebříčky',Trophy]].map(([key,label,Icon])=><button key={key} type="button" className={(view===key||(key===publicBack&&view==='public-detail'))?'active':''} aria-current={(view===key||(key===publicBack&&view==='public-detail'))?'page':undefined} onClick={()=>navigate(key)}><Icon size={22}/><span>{label}</span></button>)}</nav>}
    {view === 'demo' && <Demo onBack={home}/>}
    {menuOpen&&<ExpeditionMenu busy={busy} online={online} canLeaveBeforeStart={view==='player'&&!!data?.team&&!attemptStartedAt(data.game,data.team)&&!data.team.finishedAt&&!data.team.abandonedAt} canAbandon={view==='player'&&!!data?.team&&!!attemptStartedAt(data.game,data.team)&&!data.team.finishedAt&&!data.team.abandonedAt} running={view==='player'&&!!(data?.team?.startedAt??data?.game.startedAt)&&data?.game.status==='running'&&!data?.team?.finishedAt&&!data?.team?.abandonedAt} onClose={()=>setMenuOpen(false)} onNavigate={navigate} onAbandon={async()=>{const result=await action({action:'abandon',confirm:true});if(result?.ok){setMenuOpen(false);navigate('library');}return !!result?.ok;}}/>}
    {help && <HowToPlay onClose={() => setHelp(false)}/>}
  </div>;
}
function MapPinIcon() { return <LocateFixed size={17}/>; }

function Owner({ user, data, now, busy, online, onAction, onEdit, onDelete, onShowPublic, onBackup }) {
  const [publishedNotice,setPublishedNotice]=useState(false),ownerTop=useRef(null);
  const { game, teams } = data; const [selected, setSelected] = useState(null), [copied, setCopied] = useState(false), [confirmDelete,setConfirmDelete]=useState(false);
  useEffect(()=>{ownerTop.current?.scrollIntoView({block:'start',behavior:'instant'});setPublishedNotice(false);},[game.code]);
  const team = teams.find(t => t.id === selected), allDone = teams.length > 0 && teams.every(t => t.finishedAt);
  async function copy() { try { await navigator.clipboard.writeText(location.origin + '/?code=' + game.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { alert('Kód výpravy: ' + game.code); } }
  return <main ref={ownerTop} className="p-content"><div className="p-section-heading"><span className="p-kicker">PŘEHLED ORGANIZÁTORA</span><h1>{game.name}</h1>{game.deleteAt&&<p className="p-alert" role="status"><DeletionCountdown at={game.deleteAt}/></p>}<div className="p-row p-wrap"><span className="p-badge"><Flag size={15}/>Výprava na čas</span><span className="p-badge"><Users size={15}/>{teams.length} {game.visibility==='public'?'hráčů':'hraní'}</span><span className="p-badge"><Clock3 size={15}/>Samostatný čas každého hráče</span></div></div>
      {game.moderation&&<p className="p-alert">Výpravu pozastavil správce: {game.moderation.reason}. Námitky: patrac@stopik.cz</p>}{game.visibility==='public'&&<section className="p-panel p-start-panel">{!game.published&&<SafetyNotice creator/>}<span className="p-kicker">VEŘEJNÁ VÝPRAVA</span><h2>{game.published?'Zveřejněná na mapě':'Výprava je připravená!'}</h2><button className="p-primary" disabled={busy||!online||!!game.moderation||game.status==='deleting'||(game.published&&data.publicLocked)} onClick={async()=>{const publishing=!game.published;const result=await onAction({action:publishing?'publish':'hide'});if(publishing&&result?.ok)setPublishedNotice(true);}}><Globe2 size={18}/>{game.published?'Skrýt z mapy':'Zveřejnit na mapě'}</button><p className="p-small">{game.published?'Hráči už mohou výpravu objevit na mapě.':'Ještě jeden krok: zveřejněte výpravu, aby ji hráči našli na mapě.'}</p><p>Každý předplatitel má jeden pokus. Dokud někdo výpravu hraje, nelze ji upravit, skrýt ani smazat. Po ukončení všech aktivních pokusů se možnosti znovu zpřístupní.</p><button className="p-secondary p-edit-expedition" disabled={busy||!online||data.publicLocked||game.status==='deleting'} onClick={onEdit}>Upravit veřejnou výpravu</button>{data.publicLocked&&<p className="p-small">Výpravu právě hraje {data.activePlayers} hráčů. Po dokončení nebo ukončení posledního pokusu se tlačítka automaticky odemknou.</p>}</section>}
    {game.routeInfo&&<section className="p-panel"><strong>{formatRouteDistance(game.routeInfo)} vzdušnou čarou · přibližně {game.routeInfo.estimatedMinutes} min</strong><RouteEstimateNote info={game.routeInfo}/></section>}
    <CreatorStats game={game} teams={teams} now={now}/>
    {game.visibility==='public'&&<OwnerReviews code={game.code} user={user}/>}
    <div className="p-owner-grid"><section><div className="p-panel p-invite"><div><span className="p-kicker">KÓD VÝPRAVY</span><div className="p-game-code">{game.code}</div></div><button className="p-secondary" disabled={game.visibility==='public'&&!game.published} onClick={game.visibility==='public'?onShowPublic:copy}>{game.visibility==='public'?<Globe2 size={18}/>:copied ? <Check size={18}/> : <Copy size={18}/>} {game.visibility==='public'?(game.published?'Veřejná karta':'Karta po zveřejnění'):copied ? 'Zkopírováno' : 'Pozvat hráče'}</button></div>
      {game.visibility!=='public'&&<section className="p-panel p-start-panel"><h2>Sdílejte kód a můžete hrát</h2><p>Každý přihlášený hráč s kódem si zahájí svůj čas samostatně. Více hráčů může procházet výpravu současně; nikdo nečeká na společný start. Předplatné hráči nepotřebují.</p><button className="p-secondary p-edit-expedition" disabled={busy||!online||data.activePlayers>0||!!game.deleteAt} onClick={onEdit}>Upravit soukromou výpravu</button>{data.activePlayers>0&&<p className="p-small">Výpravu právě někdo hraje. Úpravy budou dostupné po ukončení všech aktivních pokusů.</p>}</section>}

      <div className="p-row p-between p-list-heading"><h2>{allDone ? 'Konečné výsledky' : 'Průběh hráčů'}</h2><span className="p-small">Aktualizace po 5 s</span></div>{teams.length === 0 ? <div className="p-empty"><Users/><p>Tady se objeví první dobrodruzi.</p></div> : teams.map((t, i) => <button key={t.id} className={'p-panel p-team-card ' + (selected === t.id ? 'active' : '')} onClick={() => setSelected(selected === t.id ? null : t.id)}><span className="p-crest">{t.finishedAt ? <Trophy/> : <Users/>}</span><div className="p-team-info"><div className="p-row p-between"><strong>{allDone ? `${i + 1}. ` : ''}{t.name}{t.archived&&<small>Předchozí dokončené hraní</small>}</strong><span>{t.index} / {game.totalStations}</span></div><Progress index={t.index} total={game.totalStations}/><small>{t.abandonedAt ? (t.endReason==='timeout'?'Nedokončeno · limit 48 hodin':'Ukončil bez dokončení') : t.finishedAt ? 'V cíli' : !attemptStartedAt(game,t) ? 'Připraven k zahájení' : t.arrivedAt ? 'Luští hádanku' : 'Na cestě'} · Nápovědy {t.events.filter(e => e.type === 'hint').length} · Řešení {t.events.filter(e => e.type === 'solution').length}</small></div><div className="p-team-time"><strong>{time((t.finishedAt || t.abandonedAt || now) - (attemptStartedAt(game,t)??now) + (game.mode === 'race' ? t.penaltyMs : 0))}</strong>{t.penaltyMs > 0 && <small>+{t.penaltyMs / 60000} min</small>}</div><ChevronRight size={17}/></button>)}

    </section><aside><section className="p-panel"><span className="p-kicker">{team ? 'DETAIL HRÁČE' : 'TRASA VÝPRAVY'}</span><h2>{team ? team.name : `${game.totalStations} zastavení k pokladu`}</h2>{team ? <><div className="p-score"><span>Výsledný čas</span><strong>{time((team.finishedAt || team.abandonedAt || now) - (attemptStartedAt(game,team)??now) + (game.mode === 'race' ? team.penaltyMs : 0))}</strong><small>Hra {time((team.finishedAt || team.abandonedAt || now) - (attemptStartedAt(game,team)??now))} + penalizace {time(team.penaltyMs)}</small></div>{team.timings.map(t => <div className="p-timeline" key={t.index}><strong>{t.index + 1}. {t.name}</strong><small>Přesun {t.travelMs === null ? '—' : time(t.travelMs)} · Luštění {t.solveMs === null ? 'probíhá' : time(t.solveMs)}</small>{t.arrivedAt && <small>Příchod {new Date(t.arrivedAt).toLocaleTimeString('cs-CZ')}</small>}{(t.solutions || []).map(e => <span className="p-hint-log" key={'solution-' + e.at}>Odhalení řešení +{e.penaltyMs / 60000} min · {new Date(e.at).toLocaleTimeString('cs-CZ')}</span>)}{t.hints.map(h => <span className="p-hint-log" key={h.hintId}>{h.hintType === 'photo' ? 'Fotografická' : 'Textová'} nápověda +{h.penaltyMs / 60000} min · {new Date(h.at).toLocaleTimeString('cs-CZ')}</span>)}</div>)}</> : game.stations.map((s, i) => <div className="p-route-summary" key={s.id}><span className="p-station-number">{i + 1}</span><div><strong>{s.name}</strong><small>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</small></div></div>)}</section>
      <section className="p-panel p-backup"><ShieldCheck size={22}/><h3>Výprava patří vašemu účtu</h3><p className="p-small">Přihlaste se stejným účtem Pátrače na telefonu nebo počítači. Výpravu najdete v sekci Moje hry mezi vlastními výpravami.</p></section><section className="p-panel p-delete-game-panel"><h3>Smazání výpravy</h3><p className="p-small">Výprava zůstane 72 hodin hratelná a poté se odstraní včetně fotografií a výsledků. Tím uvolníte místo v limitu {game.visibility==='public'?'veřejných':'soukromých'} výprav svého účtu.</p><button type="button" className="p-secondary p-delete-expedition" disabled={busy || !online || data.activePlayers>0 || !!game.deleteAt} onClick={()=>setConfirmDelete(true)}><Trash2 size={18}/> Smazat celou výpravu</button></section></aside></div>
    {publishedNotice&&<PublicationSuccess name={game.name} onClose={()=>setPublishedNotice(false)}/>}
    {confirmDelete && <DeleteExpeditionDialog game={game} busy={busy} onClose={()=>setConfirmDelete(false)} onDelete={onDelete}/>}

  </main>;
}

function PublicPreparation({expedition,user,online,onStarted,onBack}) {
  const [card,setCard]=useState(expedition),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[available,setAvailable]=useState(false);
  const starting=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=async()=>{if(document.hidden||starting.current)return;try{
      const detail=await publicRequest('/expeditions/'+expedition.code,undefined,controller.signal);
      if(controller.signal.aborted)return;
      if(detail.attempt){onStarted({role:'public',code:expedition.code,name:detail.expedition.name});return;}
      setCard(detail.expedition);setAvailable(detail.access.active&&!detail.isAuthor);setError(detail.access.active?'':'Pro zahájení je potřeba aktivní předplatné.');
    }catch(e){if(!controller.signal.aborted){setAvailable(false);setError(e.message);}}};
    refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[expedition.code,user.id,onStarted]);
  async function start(){
    if(starting.current||!online)return;starting.current=true;setBusy(true);setError('');
    try{await publicRequest('/expeditions/'+card.code+'/start',{confirm:true});await onStarted({role:'public',code:card.code,name:card.name});}
    catch(e){setError(e.message);setConfirm(false);}finally{starting.current=false;setBusy(false);}
  }
  const data={game:{name:card.name,status:'running',mode:'race',totalStations:card.totalStations,visibility:'public'},team:{name:user.name,index:0,penaltyMs:0,station:{name:'Start: '+card.name,lat:card.lat,lng:card.lng,radius:card.startRadius??25}}};
  return <>{error&&<div className="p-alert" role="alert">{error}</div>}<Player data={data} preparing now={0} busy={busy||!available} online={online} onStart={()=>setConfirm(true)} onBackup={onBack}/>{confirm&&<StartConfirmation busy={busy} onStart={start} onClose={()=>setConfirm(false)}/>}</>;
}

function PrivatePlayer(props){
  const [confirm,setConfirm]=useState(false);
  const {game,team}=props.data;
  const preparing=game.visibility!=='public'&&!attemptStartedAt(game,team)&&!team.finishedAt&&!team.abandonedAt;
  return <><Player {...props} onReplay={()=>props.onAction({action:'restart',teamId:team.id})} preparing={preparing} onStart={()=>setConfirm(true)}/>{confirm&&<StartConfirmation privateGame busy={props.busy} onClose={()=>setConfirm(false)} onStart={async()=>{await props.onAction({action:'begin',confirm:true});setConfirm(false);}}/>}</>;
}
function Player({ data, now, busy, online, onAction, onBackup, preparing=false, onStart, onReplay }) {
  const [wrongFeedback,setWrongFeedback]=useState(null), previousWrongMessage=useRef(null);
  const { game, team, counts } = data; const running = game.status === 'running' && !team.finishedAt && !team.abandonedAt;
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
    if (preparing || team.abandonedAt || !position || !station || team.arrivedAt || busy || !online || (position.samples < 2 && position.acc > 10) || position.acc > Math.min(30, station.radius) || distance > station.radius || Date.now() - position.timestamp > 20000) return;
    const key = `${team.index}:${position.timestamp}`; if (attempted.current.key === key || Date.now() - attempted.current.at < 4000) return;
    const fix = position.arrivalFix || position;
    attempted.current = { key, at: Date.now() }; onAction({ action: 'arrive', index: team.index, position: { ...fix, timestamp: fix.timestamp + (now - Date.now()) } });
  }, [preparing, team.abandonedAt, position, team.index, team.arrivedAt, busy, online, station, distance]);

  if (team.abandonedAt) return <main className="p-narrow"><section className="p-panel"><h1>{team.endReason==='timeout'?'Výprava nedokončena':'Pokus byl ukončen'}</h1><p>{team.endReason==='timeout'?'Uplynulo 48 hodin od startu. Pokus byl automaticky ukončen jako nedokončený.':'Tuto výpravu jste ukončili bez dokončení.'} Nelze ji znovu zahájit ani v ní pokračovat.</p><button className="p-primary" onClick={onBackup}>Zpět na přehled</button></section></main>;
  const elapsed = preparing ? 0 : (team.finishedAt || team.abandonedAt || now) - game.startedAt, total = elapsed + (game.mode === 'race' ? team.penaltyMs : 0);
  const storyStorageKey='patrac-story:'+game.code+':'+team.id+':'+(team.startedAt??game.startedAt);
  if (team.finishedAt) return <ExpeditionStoryGate key={'finish:'+team.finishedAt} text={team.finishText} title="Gratulujeme!" finished storageKey={storyStorageKey} eventKey={'finish:'+team.finishedAt}><main className="p-narrow"><div className="p-panel p-finish"><Trophy className="p-big-icon"/><span className="p-kicker">VÝPRAVA DOKONČENA</span><h1>{team.name}, jste v cíli!</h1><p>{game.visibility==='public'?'Váš jediný pokus je dokončený. Výsledný čas včetně penalizací je uložený a můžete se podívat do žebříčku TOP 10.':game.mode === 'race' ? 'Všechny hádanky jsou vyřešené. Váš výsledný čas je uložený a vidí ho i tvůrce výpravy.' : 'Poklad je nalezený. Organizátor vidí pořadí hráčů podle dokončení.'}</p><div className="p-score"><span>Výsledný čas</span><strong>{time(total)}</strong><small>Čas hry {time(elapsed)}{game.mode === 'race' ? ' + penalizace ' + time(team.penaltyMs) : ''}</small></div><p className="p-small">Dokončeno hráčů {counts?.finished || 1} z {counts?.total || 1}</p>{game.visibility!=='public'&&onReplay&&<><button className="p-primary" disabled={busy||!online} onClick={onReplay}>{busy?'Připravuji nové hraní…':'Hrát znovu'}</button><p className="p-small">Dokončený výsledek zůstane v historii. Nové hraní začne od prvního stanoviště; čas spustíte až tlačítkem Zahájit hru.</p></>}<button className="p-secondary" onClick={onBackup}><Download size={17}/> {game.visibility==='public'?'Zobrazit žebříček TOP 10':'Moje hry'}</button></div></main></ExpeditionStoryGate>;
  if (!team.arrivedAt && station) return <TravelScreen game={game} team={team} position={position} heading={heading} error={error} orientationError={orientationError} compassPermission={compassPermission} elapsed={elapsed} total={total} onEnableCompass={enableCompass} onRetry={retry} preparing={preparing} onStart={onStart} startDisabled={busy || !online} onBack={onBackup}/>;
  return <ExpeditionStoryGate key={'arrival:'+team.index+':'+team.arrivedAt} text={station?.arrivalText} title={station?.name||'Další stopa'} storageKey={storyStorageKey} eventKey={'arrival:'+team.index+':'+team.arrivedAt}><main className="p-content p-player"><div className="p-player-top"><span className="p-badge"><Users size={16}/> {team.name}</span><span className="p-badge p-clock"><Clock3 size={16}/>{time(elapsed)}</span></div><div className="p-player-heading"><span className="p-kicker">{game.name}</span><Progress index={team.index} total={game.totalStations}/><p className="p-small">Stanoviště {team.index + 1} / {game.totalStations}</p><h1>{station?.name}</h1></div>
    {team.arrivedAt && station && <section className="p-panel p-riddle"><span className="p-arrived"><LocateFixed size={17}/> Jste na místě</span><div className="p-parchment"><Compass size={30}/><p>{station.question}</p></div><form onSubmit={async e => { e.preventDefault(); setWrongFeedback(null); const index=team.index; const result = await onAction({ action: 'answer', index, answer }); if (result?.wrongAnswer) { const message=nextWrongAnswerMessage(previousWrongMessage.current); previousWrongMessage.current=message; setWrongFeedback({index,message}); } else if (result?.ok) { setAnswer(''); setWrongFeedback(null); } }}><label className="p-label">Vaše odpověď<input autoComplete="off" value={answer} required maxLength={1000} onChange={e => setAnswer(e.target.value)} placeholder="Napište řešení…"/></label>{wrongFeedback?.index===team.index&&<div className="p-alert" role="alert"><strong>{wrongFeedback.message}</strong><div>Další odpověď můžeš zkusit za 5 sekund.</div></div>}<button className="p-primary" disabled={busy || !online}><LockKeyhole size={18}/>{busy ? 'Ověřuji…' : team.index === game.totalStations - 1 ? 'Potvrdit poslední odpověď' : 'Odemknout další souřadnice'}</button></form>
      {game.mode === 'race' && station.hints?.length > 0 && <div className="p-hints"><h3>Potřebujete postrčit?</h3>{station.hints.map(h => <div className="p-hint-item" key={h.id}>{h.content ? h.type === 'photo' ? <img className="p-hint-photo" src={h.content} alt="Odemčená fotografická nápověda"/> : <p className="p-revealed-hint">{h.content}</p> : <button className="p-secondary" disabled={busy || !online} onClick={() => setHint(h)}>{h.type === 'photo' ? <ImageIcon size={20}/> : <Lightbulb size={20}/>} {h.type === 'photo' ? 'Fotografická' : 'Textová'} nápověda <span className="p-gold">+{h.minutes} min</span></button>}</div>)}</div>}{game.mode === 'race' && <div className="p-hints">{station.solution ? <div className="p-revealed-hint"><strong>Řešení</strong><p>{station.solution}</p><small>Zadejte odpověď a pokračujte na další stanoviště.</small></div> : <button className="p-secondary" disabled={busy || !online} onClick={() => setHint({ solution: true, minutes: station.solutionMinutes ?? 30 })}>Zobrazit řešení <span className="p-gold">+{station.solutionMinutes ?? 30} min</span></button>}</div>}
    </section>}
    <div className="p-player-score"><Clock3 size={17}/><span>Čas hry {time(elapsed)}</span>{game.mode === 'race' && <><span>Penalizace +{time(team.penaltyMs)}</span><strong>Výsledek {time(total)}</strong></>}</div>
    {hint && <div className="p-modal-backdrop"><section className="p-modal" role="dialog" aria-modal="true" aria-labelledby="p-hint-title"><Lightbulb className="p-big-icon"/><h2 id="p-hint-title">{hint.solution ? 'Zobrazit řešení?' : 'Otevřít nápovědu?'}</h2><p>K výslednému času se přičte <strong>{hint.minutes} min</strong>. Hra bude pokračovat okamžitě. Odhalený obsah můžete číst opakovaně bez další penalizace. Případné další nápovědy a řešení se přičítají zvlášť.</p><button className="p-primary" disabled={busy} onClick={async () => { await onAction({ action: hint.solution ? 'solution' : 'hint', index: team.index, hintId: hint.id }); setHint(null); }}>{hint.solution ? 'Zobrazit řešení' : 'Otevřít nápovědu'} +{hint.minutes} min</button><button className="p-secondary" onClick={() => setHint(null)}>Ještě zkusíme luštit</button></section></div>}
  </main></ExpeditionStoryGate>;
}

function Demo({ onBack }) {
  const [step, setStep] = useState(0), [answer, setAnswer] = useState(''), [message, setMessage] = useState(''), [hint, setHint] = useState(false);
  if (step === 0) return <TravelScreen simulated game={{name:'Tajemství starého dubu',mode:'race',totalStations:3}} team={{name:'Ukázkový hráč',index:0,penaltyMs:0,station:{name:'Starý dub',lat:49.3,lng:17.39,radius:25}}} position={{lat:49.29925,lng:17.389,acc:5}} heading={42} elapsed={1122000} total={1122000} onEnableCompass={() => {}} onRetry={() => {}} onDemoArrival={() => setStep(1)}/>;
  return <main className="p-narrow"><button className="p-back" onClick={onBack}><ArrowLeft size={18}/> Zpět</button><div className="p-demo-badge">UKÁZKA · POLOHA A ČAS JSOU SIMULOVANÉ</div><section className="p-panel p-demo"><span className="p-kicker">TAJEMSTVÍ STARÉHO DUBU</span><h1>{step === 0 ? 'Vyrazte za první stopou.' : step === 1 ? 'Jste na místě.' : 'První šifra je vaše!'}</h1>{step === 1 ? <><div className="p-parchment"><p>Na slunci tě provázím, ve tmě zmizím. Co jsem?</p></div><form onSubmit={e => { e.preventDefault(); if (['stín', 'stin'].includes(answer.toLowerCase().trim())) setStep(2); else setMessage(previous=>nextWrongAnswerMessage(previous)); }}><label className="p-label">Vaše odpověď<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Napište řešení…"/></label><button className="p-primary">Odemknout další stopu</button></form><button className="p-secondary" onClick={() => setHint(true)}><Lightbulb size={18}/> Nápověda +2 min</button>{hint && <p className="p-revealed-hint">Podívejte se na zem za sebe. Odpověď je stín.</p>}{message && <p role="status">{message}</p>}</> : <><Trophy className="p-big-icon"/><p>V opravdové výpravě by se teď otevřely souřadnice dalšího místa. Organizátor uvidí vyřešenou šifru i případnou nápovědu.</p><button className="p-primary" onClick={onBack}>Pustit se do vlastní výpravy <ArrowRight size={18}/></button></>}</section></main>;
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
  return <div className="p-modal-backdrop" onClick={onClose}><section ref={dialog} className="p-modal p-saved-modal" role="dialog" aria-modal="true" aria-labelledby="p-saved-title" onKeyDown={keys} onClick={e => e.stopPropagation()}><h2 id="p-saved-title">Pokračovat ve hře</h2><p>{sessions.length ? 'Vyberte hru nebo výpravu, kterou spravujete.' : 'V tomto zařízení zatím není uložená žádná hra. Připojte se k výpravě, vytvořte vlastní nebo obnovte přístup ze zálohy.'}</p><div className="p-saved-list">{sessions.map(s => <button className="p-saved-game" key={s.code + s.role} onClick={() => onEnter(s)}><span className="p-crest">{s.role === 'owner' ? <Flag/> : <Users/>}</span><span><strong>{s.name}</strong><small>{s.role === 'owner' ? 'Správa vytvořené hry' : 'Moje hra'} · {s.code}</small></span><ChevronRight size={18}/></button>)}</div><label className="p-secondary p-upload">Obnovit přístup ze zálohy<input aria-label="Obnovit přístup ze zálohy" type="file" accept="application/json,.json" onChange={e => onRestore(e.target.files[0])}/></label><button className="p-text-button p-saved-close" onClick={onClose}>Zavřít</button></section></div>;
}
