'use client';
import {useEffect,useRef,useState} from 'react';
import {creatorAccessToken} from '../lib/creator-client';
import {apiUrl} from '../lib/apiUrl.mjs';
async function billingRequest(path='',data){
 const token=await creatorAccessToken();
 const response=await fetch(apiUrl('/api/billing'+path),{method:data?'POST':'GET',cache:'no-store',headers:{'X-Patrac-Account':token||'',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});
 const value=await response.json();if(!response.ok){const error=Error(value.error||'Platby se nepodařilo načíst.');error.status=response.status;throw error;}return value;
}
const date=value=>new Date(value).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'});
export default function CreatorBilling({userId}){
 const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[returning,setReturning]=useState(''),[refreshing,setRefreshing]=useState(false),[refreshMessage,setRefreshMessage]=useState('');
 const keys=useRef({});
 async function refresh(){
  if(refreshing)return;
  setRefreshing(true);setRefreshMessage('');setError('');
  try{const next=await billingRequest();setState(next);setRefreshMessage(next.enabled&&!next.available?'Stav obnoven. Platební brána zatím nemá oba potřebné klíče.':'Stav přístupu byl obnoven.');}
  catch(e){setError(e.name==='TimeoutError'?'Server neodpovídá. Zkuste obnovit stav znovu.':e.message);}
  finally{setRefreshing(false);}
 }
 useEffect(()=>{let live=true;const result=new URLSearchParams(location.search).get('billing');setReturning(result||'');
  const load=async()=>{try{const data=await billingRequest();if(live){setState(data);setError('');}}catch(e){if(live)setError(e.message);}};
  load();window.addEventListener('patrac-expeditions-changed',load);const interval=result==='success'?setInterval(load,3000):null;const timer=interval?setTimeout(()=>clearInterval(interval),60000):null;
  return()=>{live=false;window.removeEventListener('patrac-expeditions-changed',load);if(interval)clearInterval(interval);if(timer)clearTimeout(timer);};
 },[userId]);
 async function buy(months){setBusy(true);setError('');try{
  keys.current[months] ||= crypto.randomUUID();
  const result=await billingRequest('/checkout',{months,environment:state.environment,requestKey:keys.current[months]});
  const url=new URL(result.url);if(url.origin!=='https://checkout.stripe.com')throw Error('Neplatná adresa platební brány.');
  location.assign(url.href);
 }catch(e){setError(e.message);if(e.status===409)delete keys.current[months];setBusy(false);}}
 return <section className="p-billing" aria-label="Přístup k tvorbě výprav"><h2>Můj přístup</h2>
 {error&&<p className="p-alert" role="alert">{error}</p>}
 {!state&&!error&&<p role="status">Načítám přístup…</p>}
 {state&&<>
 {state.environment==='test'&&state.enabled&&<p className="p-note">Testovací platby — skutečné peníze se nestrhávají.</p>}
 <p>{state.active?<>Přístup aktivní do <strong>{date(state.expiresAt)}</strong>.</>:state.expiresAt?<>Přístup vypršel {date(state.expiresAt)}.</>:'Zatím nemáte aktivní placený přístup.'}</p>
 {returning==='success'&&<p role="status">Platba byla dokončena v bráně. Aktivace se zobrazí po potvrzení serverem. Pokud ještě chybí, obnovte stav za chvíli.</p>}
 {returning==='cancel'&&<p>Platbu jste nedokončili. Můžete vybrat tarif znovu.</p>}
 {!state.available?<p className="p-small">Nákup přístupu právě připravujeme.</p>:<><p className="p-small">Jednorázová platba bez automatického obnovení. Obnovení prodlouží stávající přístup; po vypršení začne nové období zaplacením. Hráči se připojují zdarma.</p><div className="p-billing-plans">{state.plans.map(plan=><button className="p-secondary" disabled={busy} key={plan.months} onClick={()=>buy(plan.months)}><strong>{plan.months===3?'3 měsíce':plan.months===6?'6 měsíců':'12 měsíců'}</strong><span>{plan.amount/100} Kč</span></button>)}</div></>}

 {state.creatorRewards?.ready&&<section className="p-reward-history"><h3>Odměny za veřejné výpravy</h3><p><strong>{state.creatorRewards.awardedMonths} měsíců zdarma</strong> získáno tvorbou výprav.</p>{state.creatorRewards.history.length?<ul>{state.creatorRewards.history.map(item=><li key={item.code+':'+item.milestone}><strong>+{item.months} měsíce zdarma</strong> · {item.name}<small>{item.milestone} dokončených her · přiznáno {date(item.grantedAt)}</small></li>)}</ul>:<p className="p-small">Za každých 100 dokončených her na jedné tvé veřejné výpravě získáš automaticky 2 měsíce přístupu zdarma.</p>}</section>}
 {state.orders.some(o=>o.paid_at)&&<><h3>Zaplacená období</h3><ul>{state.orders.filter(o=>o.paid_at).map(o=><li key={o.id}>{date(o.paid_at)} · {o.months} měsíců · {o.amount/100} Kč</li>)}</ul></>}
 </>}
 <button type="button" className="p-secondary p-billing-refresh" disabled={busy||refreshing} aria-busy={refreshing} onClick={refresh}>{refreshing?'Obnovuji stav…':'Obnovit stav přístupu'}</button>
 {refreshMessage&&<p className="p-small" role="status">{refreshMessage}</p>}
 </section>;
}
