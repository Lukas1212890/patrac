'use client';
import {createContext,useContext,useEffect,useRef,useState} from 'react';
import {apiUrl} from '../lib/apiUrl.mjs';
const RuntimeEnvironment=createContext(null);
export function TestModeNotice({environment,children}){
 const current=useContext(RuntimeEnvironment);
 return current!=='live'&&(environment??current)==='test'?children:null;
}
export default function RuntimeModeNotice({children}){
 const initial=useRef(null),[changed,setChanged]=useState(null),[environment,setEnvironment]=useState(null);
 useEffect(()=>{let live=true,loading=false;const controller=new AbortController();async function check(){if(document.hidden||loading)return;loading=true;try{const r=await fetch(apiUrl('/api/account/config'),{cache:'no-store',signal:controller.signal});if(!r.ok)return;const d=await r.json();if(!live||!['test','live'].includes(d.environment))return;setEnvironment(d.environment);if(initial.current===null)initial.current=d.environment;setChanged(initial.current!==d.environment?d.environment:null);}catch{}finally{loading=false;}}
 check();const timer=setInterval(check,30000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);return()=>{live=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};},[]);
 return <RuntimeEnvironment.Provider value={environment}>{children}{changed&&<div className="p-mode-changed" role="alert"><strong>{changed==='live'?'Pátrač přešel do ostrého režimu.':'Pátrač přešel do testovacího režimu.'}</strong><span>Obnovte aplikaci pro aktuální přístupy, hry a platby.</span><button onClick={()=>location.reload()}>Obnovit aplikaci</button></div>}</RuntimeEnvironment.Provider>;
}
