const date=value=>new Date(value).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'});
export const accessMonths=months=>months+' '+(months===1?'měsíc':months>=2&&months<=4?'měsíce':'měsíců');
export const accessSource=(source,environment)=>source==='paid'?(environment==='test'?'Testovací platba':'Samoplátce'):source==='admin'?'Od správce':source==='registration'?'Registrační bonus':source==='reward'?'Odměna':'Neznámý původ';
export function AdminAccessTags({source,environment,months}){
 const duration=[2,3,6,12].includes(Number(months))?Number(months):'other';
 return <span className="pa-access-tag-group"><span className={'pa-source-tag pa-source-'+source}>{accessSource(source,environment)}</span><span className={'pa-duration-tag pa-duration-'+duration} title="Celková přidělená délka období tohoto původu">{accessMonths(months)}</span></span>;
}
export default function AdminSubscriptionSummary({subscription,compact=false}){
 if(!subscription)return <span className="pa-subscription-summary pa-muted">Přístupy nejsou zapnuté</span>;
 const s=subscription,remaining=s.active?Math.max(1,Math.ceil((s.expiresAt-Date.now())/86400000)):0;
 return <span className="pa-subscription-summary">
 {!compact&&<span className={'pa-badge '+(s.active?'verified':'')}>{s.active?'Aktivní':s.expiresAt?'Vypršel':'Bez přístupu'}</span>}
 {s.expiresAt&&<small>{s.active?'Do':'Vypršel'} {date(s.expiresAt)}{s.active?' · zbývá '+remaining+' '+(remaining===1?'den':remaining<=4?'dny':'dní'):''}</small>}
 {!!s.sources.length&&<>{!compact&&<small>{s.active?'Přidělená období:':'Historie období:'}</small>}<span className="pa-access-tags">{[['paid',s.paidMonths],['admin',s.adminMonths],['reward',s.rewardMonths],['registration',s.registrationMonths]].filter(([,months])=>months>0).map(([source,months])=><AdminAccessTags key={source} source={source} environment={s.environment} months={months}/>)}</span></>}

 {s.active&&!s.sources.length&&<small>Původ není dohledatelný v historii.</small>}
 </span>;
}
