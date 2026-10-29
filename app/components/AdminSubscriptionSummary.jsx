const date=value=>new Date(value).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'});
export const accessMonths=months=>months+' '+(months===1?'měsíc':months>=2&&months<=4?'měsíce':'měsíců');
export const accessSource=(source,environment)=>source==='paid'?(environment==='test'?'Testovací platba':'Zaplaceno'):source==='admin'?'Od správce':source==='reward'?'Odměna za výpravy':'Neznámý původ';
export default function AdminSubscriptionSummary({subscription}){
 if(!subscription)return <span className="pa-subscription-summary pa-muted">Přístupy nejsou zapnuté</span>;
 const s=subscription,remaining=s.active?Math.max(1,Math.ceil((s.expiresAt-Date.now())/86400000)):0;
 return <span className="pa-subscription-summary">
 <span className={'pa-badge '+(s.active?'verified':'')}>{s.active?'Aktivní':s.expiresAt?'Vypršel':'Bez přístupu'}</span>
 {s.expiresAt&&<small>{s.active?'Do':'Vypršel'} {date(s.expiresAt)}{s.active?' · zbývá '+remaining+' dní':''}</small>}
 {!!s.sources.length&&<small>{s.active?'Přidělená období: ':'Historie období: '}{[['paid',s.paidMonths],['admin',s.adminMonths],['reward',s.rewardMonths]].filter(([,months])=>months>0).map(([source,months])=>accessSource(source,s.environment)+' '+accessMonths(months)).join(' · ')}</small>}
 {s.active&&!s.sources.length&&<small>Původ není dohledatelný v historii.</small>}
 </span>;
}
