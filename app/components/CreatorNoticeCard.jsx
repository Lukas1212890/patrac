'use client';
const date=value=>new Date(value).toLocaleDateString('cs-CZ',{dateStyle:'medium'});
export default function CreatorNoticeCard({notice}){
 const type=notice.type;
 if(['review','review-reply'].includes(type))return <article className={'p-moderation-notice p-notice-'+type}><strong>{type==='review'?(notice.updated?'Hráč upravil hodnocení vaší výpravy':notice.comment?'Nový komentář a hodnocení výpravy':'Nové hodnocení výpravy'):(notice.updated?'Tvůrce upravil odpověď na váš komentář':'Tvůrce odpověděl na váš komentář')}</strong><h3>{notice.name}</h3><p><b>{notice.nickname}</b>{type==='review'?' · '+notice.stars+' / 5 hvězdiček':''}</p>{type==='review'&&notice.comment&&<p>{notice.comment}</p>}{type==='review-reply'&&<p>{notice.reply}</p>}<a className="p-text-button" href={type==='review'?'/?reviews='+notice.code:'/?public='+notice.code}>{type==='review'?'Otevřít hodnocení výpravy':'Otevřít výpravu a odpověď'}</a><small>{new Date(notice.createdAt).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'})}</small></article>;

 if(!['delete-expedition','access','access-revoke','reward','limits'].includes(type))return <article className="p-moderation-notice p-notice-unknown"><strong>Oznámení se nepodařilo rozpoznat</strong><p>Obnovte přehled oznámení v profilu.</p></article>;
 const privateChanged=notice.oldPrivateLimit!==notice.privateLimit,publicChanged=notice.oldPublicLimit!==notice.publicLimit;
 const increased=notice.privateLimit>notice.oldPrivateLimit||notice.publicLimit>notice.oldPublicLimit;
 const decreased=notice.privateLimit<notice.oldPrivateLimit||notice.publicLimit<notice.oldPublicLimit;
 const limitTitle=increased&&!decreased?'Správce navýšil vaše limity výprav':decreased&&!increased?'Správce snížil vaše limity výprav':'Správce změnil vaše limity výprav';
 const title=type==='access-revoke'?'Správce odebral přidělený přístup':type==='access'?'Správce prodloužil váš přístup':type==='reward'?'Získáváte odměnu za svou výpravu':type==='limits'?limitTitle:'Výpravu odstranil správce';
 return <article className={'p-moderation-notice p-notice-'+type}><strong>{title}</strong>
 {['delete-expedition','reward'].includes(type)&&<h3>{notice.name}</h3>}
 {type==='delete-expedition'&&<p><b>Důvod:</b> {notice.reason}</p>}
 {type==='access'&&<p>Správce vám prodloužil přístup o <b>{notice.months} {notice.months===1?'měsíc':notice.months<5?'měsíce':'měsíců'}</b>. Platnost po tomto prodloužení: <b>{date(notice.expiresAt)}</b>.</p>}
 {type==='access-revoke'&&<><p>Správce odebral nevyčerpanou část dříve přiděleného období. Platnost přístupu po změně: <b>{date(notice.expiresAt)}</b>.</p><p><b>Důvod:</b> {notice.reason}</p></>}
 {type==='reward'&&<p>Vaše výprava dosáhla <b>{notice.milestone} dokončených her</b>. Automaticky jste získali <b>{notice.months} měsíce zdarma</b>. Platnost po připsání odměny: <b>{date(notice.expiresAt)}</b>.</p>}
 {type==='limits'&&<p>{privateChanged&&<>Soukromé výpravy: <b>{notice.oldPrivateLimit} → {notice.privateLimit}</b>{notice.privateLimit===0?' (tvorba vypnutá)':''}</>}{privateChanged&&publicChanged&&<br/>}{publicChanged&&<>Veřejné výpravy: <b>{notice.oldPublicLimit} → {notice.publicLimit}</b>{notice.publicLimit===0?' (tvorba vypnutá)':''}</>}</p>}
 <small>{notice.code&&<>Kód {notice.code}{notice.createdAt?' · ':''}</>}{notice.createdAt?new Date(notice.createdAt).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'}):''}</small></article>;
}
