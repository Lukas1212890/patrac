'use client';
import AdminSubscriptionSummary,{accessMonths,AdminAccessTags} from './AdminSubscriptionSummary';
import {useRef,useState} from 'react';
const date=value=>value?new Date(value).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'}):'—';
export default function AdminAccess({billing,userId,busy,onChange,loadPreview}){
 const [months,setMonths]=useState(3),[reason,setReason]=useState('');
 const request=useRef(null);
 const [revocation,setRevocation]=useState(null),[revokeReason,setRevokeReason]=useState(''),[revokeError,setRevokeError]=useState(''),[previewBusy,setPreviewBusy]=useState(false);
 async function prepareRevoke(reference){setPreviewBusy(true);setRevokeError('');setRevocation(null);setRevokeReason('');try{setRevocation({...await loadPreview(reference),requestKey:crypto.randomUUID()});}catch(e){setRevokeError(e.message);}finally{setPreviewBusy(false);}}
 async function confirmRevoke(event){event.preventDefault();const result=await onChange({action:'access-revoke',id:userId,environment:billing.environment,reference:revocation.reference,reason:revokeReason.trim(),versions:Object.fromEntries(revocation.plans.map(p=>[p.environment,p.version])),requestKey:revocation.requestKey});if(result?.ok){setRevocation(null);setRevokeReason('');}}
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
 <h3>Historie všech přidělených období</h3>{revokeError&&<p className="pa-alert" role="alert">{revokeError}</p>}
 {billing.subscription?.history?.length?<ul className="pa-payments">{billing.subscription.history.map(item=><li key={item.source+':'+item.reference}><div><AdminAccessTags source={item.source} environment={billing.environment} months={item.months}/></div><small>{item.source==='paid'?'Zaplaceno':'Přiděleno'} {date(item.grantedAt)}</small>{item.source==='paid'&&<small>Částka: {(item.amount/100).toLocaleString('cs-CZ')} Kč</small>}<small>Platnost po tomto prodloužení: {date(item.accessUntil)}</small>{item.reason&&<small>{item.source==='reward'?'Výprava: ':'Důvod: '}{item.reason}</small>}{item.revokedAt&&<span className="pa-revoked-tag">Odebráno {date(item.revokedAt)}</span>}
 {item.source==='admin'&&!item.revokedAt&&item.accessUntil>Date.now()&&<button type="button" className="pa-danger" disabled={busy||previewBusy} onClick={()=>prepareRevoke(item.reference)}>{previewBusy?'Načítám náhled…':'Odebrat toto přidělení'}</button>}
 {revocation?.reference===item.reference&&!item.revokedAt&&<form className="pa-revoke-confirm" onSubmit={confirmRevoke}><h4>Odebrat nevyčerpanou část přidělení?</h4><p>Změna zachová ostatní přidělená období i jejich nevyčerpanou délku. U přidělení z testovacího režimu se upraví i přístup přenesený do ostrého provozu.</p>{revocation.plans.map(plan=><p key={plan.environment}><strong>{plan.environment==='live'?'Ostrý provoz':'Testovací prostředí'}</strong><br/>Dosud do: {date(plan.oldExpiresAt)}<br/><strong>Po odebrání do: {date(plan.expiresAt)}</strong>{plan.removedMs===0&&<small>V tomto prostředí už bylo období vyčerpané.</small>}</p>)}<label>Důvod odebrání<input required minLength={3} maxLength={240} disabled={busy} value={revokeReason} onChange={e=>setRevokeReason(e.target.value)} placeholder="Hráč tento důvod uvidí v oznámení"/></label><button className="pa-danger" disabled={busy||revokeReason.trim().length<3}>{busy?'Odebírám…':'Potvrdit odebrání přidělení'}</button><button type="button" disabled={busy} onClick={()=>setRevocation(null)}>Zrušit</button></form>}
 </li>)}</ul>:<p className="pa-muted">Zatím žádné doložené období.</p>}
 {billing.subscription?.history?.length===100&&<p className="pa-muted">Zobrazeno posledních 100 období.</p>}
 <h3>Platby a objednávky</h3>
 {!billing.orders.length?<p className="pa-muted">Zatím žádné objednávky. Ručně přidělené období najdete v historii správy.</p>:<ul className="pa-payments">{billing.orders.map(order=><li key={order.id}><div><strong>{accessMonths(order.months)} · {(order.amount/100).toLocaleString('cs-CZ')} Kč</strong><span className={'pa-badge '+(order.paid_at?'verified':'')}>{order.paid_at?'Zaplaceno':'Nezaplaceno'}</span></div><small>Vytvořeno {date(order.created_at)}</small>{order.paid_at&&<><small>Zaplaceno {date(order.paid_at)}</small><small>Platnost po této platbě: {date(order.access_until)}</small></>}</li>)}</ul>}
 {billing.orders.length===50&&<p className="pa-muted">Zobrazeno posledních 50 objednávek.</p>}
 </section>;
}
