'use client';
const date=value=>new Date(value).toLocaleDateString('cs-CZ',{dateStyle:'medium'});
export default function CreatorNoticeCard({notice}){
 const type=notice.type||'delete-expedition';
 const title=type==='access'?'Správce prodloužil váš přístup':type==='reward'?'Získáváte odměnu za svou výpravu':type==='limits'?'Správce změnil vaše limity výprav':'Výpravu odstranil správce';
 return <article className={'p-moderation-notice p-notice-'+type}><strong>{title}</strong>
 {['delete-expedition','reward'].includes(type)&&<h3>{notice.name}</h3>}
 {type==='delete-expedition'&&<p><b>Důvod:</b> {notice.reason}</p>}
 {type==='access'&&<p>Správce vám prodloužil přístup o <b>{notice.months} {notice.months===1?'měsíc':notice.months<5?'měsíce':'měsíců'}</b>. Platnost po tomto prodloužení: <b>{date(notice.expiresAt)}</b>.</p>}
 {type==='reward'&&<p>Vaše výprava dosáhla <b>{notice.milestone} dokončených her</b>. Automaticky jste získali <b>{notice.months} měsíce zdarma</b>. Platnost po připsání odměny: <b>{date(notice.expiresAt)}</b>.</p>}
 {type==='limits'&&<p>Soukromé výpravy: <b>{notice.oldPrivateLimit} → {notice.privateLimit}</b><br/>Veřejné výpravy: <b>{notice.oldPublicLimit} → {notice.publicLimit}</b></p>}
 <small>{notice.code&&<>Kód {notice.code} · </>}{notice.createdAt?new Date(notice.createdAt).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'}):''}</small></article>;
}
