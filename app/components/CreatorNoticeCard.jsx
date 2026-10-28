'use client';
export default function CreatorNoticeCard({notice}){
 return <article className="p-moderation-notice"><strong>Výpravu odstranil správce</strong><h3>{notice.name}</h3><p><b>Důvod:</b> {notice.reason}</p><small>Kód {notice.code}{notice.createdAt?' · '+new Date(notice.createdAt).toLocaleString('cs-CZ',{dateStyle:'medium',timeStyle:'short'}):''}</small></article>;
}
