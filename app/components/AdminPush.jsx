'use client';
import {useEffect,useState} from 'react';
import {Bell} from 'lucide-react';
function keyBytes(key){const raw=atob(key.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export async function disableAdminPush(api){
 if(!('serviceWorker' in navigator))return;
 const registration=await navigator.serviceWorker.getRegistration('/');const subscription=await registration?.pushManager?.getSubscription();if(!subscription)return;
 try{await api('/push',{action:'unsubscribe',endpoint:subscription.endpoint});}finally{await subscription.unsubscribe();}
}
async function readyPushWorker(){
 const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}),next=registration.installing||registration.waiting;
 if(next&&next.state!=='activated')await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{next.removeEventListener('statechange',check);reject(Error('Aktualizace aplikace ještě běží. Za chvíli zapnutí zopakujte.'));},20000);
  function check(){if(next.state==='activated'||next.state==='redundant'){clearTimeout(timer);next.removeEventListener('statechange',check);next.state==='activated'?resolve():reject(Error('Aktualizace aplikace se nepodařila. Obnovte stránku.'));}}
  next.addEventListener('statechange',check);check();
 });
 return navigator.serviceWorker.ready;
}
export default function AdminPush({api}){
 const [supported,setSupported]=useState(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[installNeeded,setInstallNeeded]=useState(false);
 useEffect(()=>{let current=true;const ok='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;setSupported(ok);setInstallNeeded((/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))&&!window.matchMedia('(display-mode: standalone)').matches&&!navigator.standalone);if(ok)navigator.serviceWorker.register('/sw.js').then(async r=>{const s=await r.pushManager.getSubscription();if(s&&Notification.permission==='granted'){await api('/push');const status=await api('/push',{action:'status',endpoint:s.endpoint});if(current)setEnabled(status.enabled);}else if(current)setEnabled(false);}).catch(()=>{if(current)setError('Nepodařilo se připravit upozornění. Obnovte stránku.');});return()=>{current=false;};},[]);
 async function toggle(){setBusy(true);setError('');setMessage('');try{
  if(enabled){await disableAdminPush(api);setEnabled(false);setMessage('Upozornění na tomto zařízení jsou vypnutá.');return;}
  // Permission must be requested directly from the tap, especially on iOS.
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Upozornění nebyla povolena. Povolte je v nastavení telefonu nebo prohlížeče.');
  const config=await api('/push');const registration=await readyPushWorker();
  let subscription=await registration.pushManager.getSubscription();if(subscription&&BufferKey(subscription.options.applicationServerKey)!==config.publicKey){await subscription.unsubscribe();subscription=null;}
  subscription ||= await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
  try{await api('/push',{action:'subscribe',subscription:subscription.toJSON()});}catch(e){await subscription.unsubscribe();throw e;}
  setEnabled(true);setMessage('Upozornění jsou zapnutá. Zkuste si poslat zkušební zprávu.');
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 async function test(){setBusy(true);setError('');setMessage('');try{const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();if(!subscription)throw Error('Nejprve zapněte upozornění.');await api('/push',{action:'test',endpoint:subscription.endpoint});setMessage('Zkušební upozornění bylo odesláno.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="pa-card pa-push"><div className="pa-card-heading"><h2><Bell size={20}/> Upozornění správce</h2><span>{enabled?'Zapnutá na tomto zařízení':'Vypnutá'}</span></div><p>Nové registrace a serverem potvrzené platby, i když aplikaci zavřete. Testovací platby jsou označené. Zapnutí platí pro toto zařízení.</p>{installNeeded&&<p className="pa-note">Na iPhonu otevřete tuto administraci v Safari, zvolte Sdílet → Přidat na plochu. Potom ji otevřete ikonou z plochy a zapněte upozornění.</p>}{supported===false&&!installNeeded&&<p className="pa-note">Tento prohlížeč push upozornění nepodporuje. Zkuste aktuální prohlížeč a nainstalovanou PWA.</p>}<div className="pa-push-actions"><button className="pa-primary" disabled={busy||!supported||installNeeded} onClick={toggle}>{busy?'Zpracovávám…':enabled?'Vypnout upozornění':'Zapnout upozornění'}</button>{enabled&&<button className="pa-clear-filters" disabled={busy} onClick={test}>Poslat zkušební upozornění</button>}</div>{error&&<p className="pa-alert" role="alert">{error}</p>}{message&&<p className="pa-message" role="status">{message}</p>}<small>V oznámení může být přezdívka hráče nebo částka platby. Náhledy na zamčené obrazovce můžete skrýt v nastavení telefonu.</small></section>;
}
function BufferKey(value){if(!value)return '';return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
