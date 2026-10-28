'use client';
import {useEffect,useRef,useState} from 'react';
import {apiUrl} from '../lib/apiUrl.mjs';
export default function RuntimeModeNotice(){
 const initial=useRef(null),[changed,setChanged]=useState(null);
 useEffect(()=>{let live=true,loading=false;const controller=new AbortController();async function check(){if(document.hidden||loading)return;loading=true;try{const r=await fetch(apiUrl('/api/account/config'),{cache:'no-store',signal:controller.signal});if(!r.ok)return;const d=await r.json();if(!live||!['test','live'].includes(d.environment))return;if(initial.current===null)initial.current=d.environment;else if(initial.current!==d.environment)setChanged(d.environment);}catch{}finally{loading=false;}}
 check();const timer=setInterval(check,30000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);return()=>{live=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};},[]);
 if(!changed)return null;
 return <div className="p-mode-changed" role="alert"><strong>{changed==='live'?'Pátrač přešel do ostrého režimu.':'Pátrač přešel do testovacího režimu.'}</strong><span>Obnovte aplikaci pro aktuální přístupy, hry a platby.</span><button onClick={()=>location.reload()}>Obnovit aplikaci</button></div>;
}
