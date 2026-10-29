'use client';
import {useState} from 'react';
import {Bell,RefreshCw} from 'lucide-react';
import NoticeBadge from './NoticeBadge';
import CreatorNoticeCard from './CreatorNoticeCard';
export default function AccountNotifications({notices=[],loading=false,saving=false,error='',onRefresh,unreadNotices=[],unreadCount=0,markRead=()=>{}}){
 const [expanded,setExpanded]=useState(false);
 const unreadIds=new Set(unreadNotices.map(n=>n.id));
 return <section className="p-account-notifications" aria-label="Oznámení účtu"><div className="p-row p-between"><h2><Bell size={20}/> Oznámení <NoticeBadge count={unreadCount}/></h2><button type="button" className="p-icon-button" disabled={loading} aria-label="Obnovit oznámení" onClick={onRefresh}><RefreshCw size={17}/></button></div><p className="p-small">Změny přístupu, odměny a zprávy ke svým výpravám najdete tady. Zobrazujeme posledních 50 oznámení.</p>
 {unreadCount>0&&<button type="button" className="p-text-button p-mark-all-read" disabled={saving} onClick={()=>markRead(unreadNotices.map(n=>n.id))}>Označit všechna jako přečtená</button>}
 {error&&<p className="p-alert" role="alert">{error}</p>}{loading&&!notices.length?<p role="status">Načítám oznámení…</p>:!error&&!notices.length?<p className="p-small">Zatím nemáte žádná oznámení.</p>:null}
 {(expanded?notices:notices.slice(0,3)).map(notice=><div key={notice.id} className={"p-account-notice-item"+(unreadIds.has(notice.id)?" is-unread":"")}><CreatorNoticeCard notice={notice}/>{unreadIds.has(notice.id)&&<button type="button" className="p-text-button p-mark-read" disabled={saving} onClick={()=>markRead([notice.id])}>Označit jako přečtené</button>}</div>)}
 {notices.length>3&&<button type="button" className="p-secondary" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Zobrazit méně':'Zobrazit všechna oznámení ('+notices.length+')'}</button>}
 </section>;
}
