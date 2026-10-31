'use client';
import {useEffect,useRef,useState} from 'react';
let pending;
function sdk(){if(window.turnstile)return Promise.resolve(window.turnstile);if(!pending)pending=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>resolve(window.turnstile);script.onerror=()=>{pending=null;script.remove();reject(Error());};document.head.append(script);});return pending;}
export default function Turnstile({siteKey,action,onToken}){
 const box=useRef(null),callback=useRef(onToken),[error,setError]=useState(false),[retry,setRetry]=useState(0);callback.current=onToken;
 useEffect(()=>{let live=true,id,api;setError(false);callback.current('');sdk().then(lib=>{if(!live)return;api=lib;id=api.render(box.current,{sitekey:siteKey,action,language:'cs',theme:'light',size:'flexible',callback:token=>{if(live){setError(false);callback.current(token);}},'expired-callback':()=>{if(live)callback.current('');},'error-callback':()=>{if(live){callback.current('');setError(true);}}});}).catch(()=>{if(live)setError(true);});return()=>{live=false;if(id!==undefined)api?.remove(id);};},[siteKey,action,retry]);
 return <div style={{margin:'16px 0'}}><div ref={box}/>{error&&<p role="alert">Ověření proti robotům se nepodařilo načíst. <button type="button" className="p-text-button" onClick={()=>setRetry(v=>v+1)}>Zkusit znovu</button></p>}</div>;
}
