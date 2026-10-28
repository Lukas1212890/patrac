'use client';
import {useEffect,useState} from 'react';
export default function AdminRuntimeMode({api,busy,onChange}){
 const [state,setState]=useState(null),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
 useEffect(()=>{const c=new AbortController();api('/runtime-mode',undefined,c.signal).then(setState).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[api]);
 if(!state)return <section className="pa-card"><h2>Režim celé hry</h2><p>{error||'Načítám nastavení…'}</p></section>;
 const target=state.mode==='test'?'live':'test',configured=state[target].configured;
 return <section className="pa-card" aria-label="Režim celé hry" style={{marginBottom:20}}><h2>Režim celé hry</h2><p><strong>{state.mode==='live'?'OSTRÝ REŽIM — skutečné platby':'TESTOVACÍ REŽIM'}</strong></p><p>Účty a vytvořené výpravy zůstávají společné. Přístupy od správce jsou uznávané i v ostrém režimu. Veřejné výsledky, hodnocení a platby se přepnou na vybrané prostředí.</p>
 {!state.ready&&<p className="pa-alert">Je potřeba spustit migraci 0011_runtime_mode.sql v databázi Pátrače.</p>}
 {!configured&&<div className="pa-alert"><strong>Pro {target==='live'?'ostrý':'testovací'} režim chybí nastavení:</strong><ul>{state[target].missing.map(v=><li key={v}>{v}</li>)}</ul><p>Hodnoty se ukládají do nastavení Workeru patrac-api v Cloudflare. Tajné klíče do chatu neposílejte.</p></div>}
 <p>Ostré ceny: 3 měsíce 199 Kč · 6 měsíců 349 Kč · 12 měsíců 599 Kč. Před přepnutím server ověří ceny, účet a webhook ve Stripe.</p>
 <button type="button" role="switch" aria-checked={state.mode==='live'} className="pa-primary" disabled={busy||!state.ready||!configured} onClick={()=>setConfirm(!confirm)}>Ostrý režim: {state.mode==='live'?'zapnutý':'vypnutý'}</button>
 {confirm&&<div className="pa-alert"><p>{target==='live'?'Zapnout ostrý režim celé hry? Nové platby budou strhávat skutečné peníze.':'Vrátit celou hru do testovacího režimu? Ostré výsledky a přístupy se v testovacím pohledu nezobrazí.'} Hráči s otevřenou aplikací musí obnovit její zobrazení. Už zaplacené objednávky se zpracují ve svém původním režimu.</p><button className="pa-primary" disabled={busy} onClick={async()=>{await onChange({action:'runtime-mode',mode:target,version:state.version,confirm:true});setConfirm(false);}}>Potvrdit přepnutí</button> <button disabled={busy} onClick={()=>setConfirm(false)}>Zrušit</button></div>}
 </section>;
}
