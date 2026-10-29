'use client';
import AdminSubscriptionSummary,{accessMonths,accessSource} from './AdminSubscriptionSummary';
import {useRef,useState} from 'react';
const date=value=>value?new Date(value).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'}):'—';
export default function AdminAccess({billing,userId,busy,onChange}){
 const [months,setMonths]=useState(3),[reason,setReason]=useState('');
 const request=useRef(null);
 if(!billing?.available)return <section className="pa-access"><h3>Platnost přístupu</h3><p className="pa-muted">Správa předplatného není v tomto prostředí zapnutá.</p></section>;
 const resetKey=()=>{request.current=null;};
 function submit(event){event.preventDefault();if(busy)return;
  const values={action:'access',id:userId,environment:billing.environment,months,reason:reason.trim(),version:billing.version};
  const signature=JSON.stringify(values);if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  onChange({...values,requestKey:request.current.key});
 }
 return <section className="pa-access" aria-label="Předplatné a platby"><h3>Platnost přístupu</h3>
 <p className="pa-access-mode">{billing.environment==='test'?'TESTOVACÍ PROSTŘEDÍ — přístupy od správce platí i v ostrém provozu':'OSTRÝ PROVOZ'}</p>
 <p><span className={'pa-badge '+(billing.active?'verified':'')}>{billing.active?'Aktivní':billing.expiresAt?'Vypršel':'Bez přístupu'}</span></p>
 <p>Platnost do: <strong>{date(billing.expiresAt)}</strong></p>
 {billing.environment==='test'&&<p>Přístup uznaný pro ostrý provoz do: <strong>{date(billing.liveExpiresAt)}</strong></p>}
 {billing.subscription&&<><h3>Původ a délka přístupu</h3><AdminSubscriptionSummary subscription={billing.subscription}/><p className="pa-muted">Zbývající čas počítá konec celého přístupu. Přidělené délky jsou součtem dosud nevyčerpaných období, včetně těch, která navazují. Úplná historie je níže.</p></>}
 <form onSubmit={submit}>
 <label>Přidat období<select disabled={busy} value={months} onChange={e=>{setMonths(Number(e.target.value));resetKey();}}><option value={3}>3 měsíce</option><option value={6}>6 měsíců</option><option value={12}>12 měsíců</option></select></label>
 <label>Důvod přidělení<input disabled={busy} required minLength={3} maxLength={240} placeholder="Například dárek nebo kompenzace" value={reason} onChange={e=>{setReason(e.target.value);resetKey();}}/></label>
 <p className="pa-muted">Období se přičte k dosavadní platnosti. Pokud přístup vypršel, začne dneškem. Jde o ruční přidělení bez platby; důvod i správce se uloží do historie.</p>
 <button className="pa-primary" disabled={busy}>{busy?'Ukládám…':(billing.active?'Prodloužit':'Přidělit')+' přístup o '+months+' měsíců'}</button>
 </form>
 <h3>Historie všech přidělených období</h3>
 {billing.subscription?.history?.length?<ul className="pa-payments">{billing.subscription.history.map(item=><li key={item.source+':'+item.reference}><div><strong>{accessSource(item.source,billing.environment)} · {accessMonths(item.months)}</strong></div><small>{item.source==='paid'?'Zaplaceno':'Přiděleno'} {date(item.grantedAt)}</small>{item.source==='paid'&&<small>Částka: {(item.amount/100).toLocaleString('cs-CZ')} Kč</small>}<small>Platnost po tomto prodloužení: {date(item.accessUntil)}</small>{item.reason&&<small>{item.source==='reward'?'Výprava: ':'Důvod: '}{item.reason}</small>}</li>)}</ul>:<p className="pa-muted">Zatím žádné doložené období.</p>}
 {billing.subscription?.history?.length===100&&<p className="pa-muted">Zobrazeno posledních 100 období.</p>}
 <h3>Platby a objednávky</h3>
 {!billing.orders.length?<p className="pa-muted">Zatím žádné objednávky. Ručně přidělené období najdete v historii správy.</p>:<ul className="pa-payments">{billing.orders.map(order=><li key={order.id}><div><strong>{accessMonths(order.months)} · {(order.amount/100).toLocaleString('cs-CZ')} Kč</strong><span className={'pa-badge '+(order.paid_at?'verified':'')}>{order.paid_at?'Zaplaceno':'Nezaplaceno'}</span></div><small>Vytvořeno {date(order.created_at)}</small>{order.paid_at&&<><small>Zaplaceno {date(order.paid_at)}</small><small>Platnost po této platbě: {date(order.access_until)}</small></>}</li>)}</ul>}
 {billing.orders.length===50&&<p className="pa-muted">Zobrazeno posledních 50 objednávek.</p>}
 </section>;
}
