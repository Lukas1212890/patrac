'use client';
import {useEffect,useState} from 'react';
export function AdminSafetyAction({game,userId,busy,onChange}){
 const [open,setOpen]=useState(false),[reason,setReason]=useState('');
 return <div>{game.suspensionReason&&<p className="pa-alert">Pozastaveno: {game.suspensionReason}</p>}<button type="button" disabled={busy} onClick={()=>setOpen(v=>!v)}>{game.suspensionReason?'Obnovit výpravu':'Bezpečnostní pozastavení'}</button>{open&&<form onSubmit={async e=>{e.preventDefault();const r=await onChange({action:game.suspensionReason?'restore-expedition':'suspend-expedition',id:userId,code:game.code,version:game.version,reason});if(r?.ok){setOpen(false);setReason('');}}}><p>Pozastavení okamžitě zablokuje výpravu i rozehrané pokusy. Čas hráčům nadále běží. Tvůrce dostane oznámení s důvodem; obnovení tuto blokaci zruší.</p><label>Důvod pro tvůrce<textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="pa-primary" disabled={busy||reason.trim().length<3}>Potvrdit {game.suspensionReason?'obnovení':'pozastavení'}</button></form>}</div>;
}
const reasons={danger:'Nebezpečné místo',coordinates:'Chybné souřadnice',access:'Nepovolený vstup',abuse:'Nevhodný obsah / osobní údaje',spam:'Spam',copyright:'Autorská práva',other:'Jiný problém'};
export default function AdminModeration({api,onSelect,onChange,refreshToken}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[resolutions,setResolutions]=useState({});
 const [status,setStatus]=useState('pending'),[environment,setEnvironment]=useState('all'),[page,setPage]=useState(0);
 useEffect(()=>{
  const c=new AbortController();setLoading(true);setError('');setData(null);
  api('/reports?'+new URLSearchParams({status,environment,page:String(page)}),undefined,c.signal).then(result=>{if(!c.signal.aborted)setData(result);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
  return()=>c.abort();
 },[api,reload,status,environment,page,refreshToken]);
 async function resolve(r,hide=false){setBusy(true);setError('');try{const result=await onChange({id:r.id,...(hide?{action:'hide-comment',reason:resolutions[r.id]||''}:{action:'resolve-report',resolution:resolutions[r.id]||''})});if(result?.ok){setPage(0);setReload(v=>v+1);setResolutions(v=>{const next={...v};delete next[r.id];return next;});}}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <details className="pa-card"><summary><strong>Nahlášené problémy · nevyřízené {data?.pending??'…'}</strong></summary>
 <div className="pa-actions"><label>Stav<select disabled={busy} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="pending">Nevyřízená</option><option value="resolved">Vyřízená</option><option value="all">Všechna</option></select></label><label>Prostředí<select disabled={busy} value={environment} onChange={e=>{setEnvironment(e.target.value);setPage(0);}}><option value="all">Všechna prostředí</option><option value="live">Ostré</option><option value="test">Testovací</option></select></label><button type="button" disabled={busy||loading} onClick={()=>setReload(v=>v+1)}>Obnovit hlášení</button></div>
 {loading&&<p role="status">Načítám hlášení…</p>}{error&&<p role="alert">{error}</p>}
 {data?.reports.map(r=><section key={r.id}><h3>{r.snapshot.name} · {r.code}</h3><p>{r.kind==='review'?'Komentář / odpověď':'Výprava'} · {reasons[r.reason]||r.reason} · {r.environment==='live'?'Ostré':'Testovací'} · {r.reporter||'Smazaný účet'} · {new Date(r.created_at).toLocaleString('cs-CZ')}</p><p>{r.description}</p>
 {r.kind==='review'&&<><p>Hlášený komentář: {r.snapshot.comment}</p><p>Odpověď: {r.snapshot.reply||'—'}</p></>}{r.suspensionReason&&<p>Pozastaveno: {r.suspensionReason}</p>}
 {r.ownerId?<button type="button" onClick={()=>onSelect(r.ownerId)}>Otevřít tvůrce a správu výpravy</button>:<p>Výprava již byla odstraněna.</p>}
 {r.resolved_at?<div className="pa-note"><strong>Vyřízeno {new Date(r.resolved_at).toLocaleString('cs-CZ')}</strong><p>{r.resolution}</p><p>Správce: {r.resolvedBy||r.resolved_by||'Neuveden'}</p></div>:<form onSubmit={e=>{e.preventDefault();resolve(r);}}><label>Způsob vyřízení (zobrazí se oznamovateli)<textarea required minLength={3} maxLength={500} disabled={busy} value={resolutions[r.id]||''} onChange={e=>setResolutions(v=>({...v,[r.id]:e.target.value}))}/></label><button disabled={busy}>Označit jako vyřízené</button>{r.kind==='review'&&<button type="button" disabled={busy||!(resolutions[r.id]?.trim().length>=3)} onClick={()=>resolve(r,true)}>Odstranit komentář i odpověď, ponechat hvězdičky</button>}</form>}
 </section>)}
 {data?.reports.length===0&&<p>Tomuto filtru neodpovídají žádná hlášení.</p>}
 {data&&<div className="pa-pagination"><button type="button" disabled={busy||loading||page===0} onClick={()=>setPage(v=>v-1)}>Předchozí</button><span>Strana {page+1} / {Math.max(1,Math.ceil(data.total/data.pageSize))} · {data.total} hlášení</span><button type="button" disabled={busy||loading||!data.hasMore} onClick={()=>setPage(v=>v+1)}>Další</button></div>}
 </details>;
}
