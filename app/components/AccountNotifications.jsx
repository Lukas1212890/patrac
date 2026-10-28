'use client';
import {useState} from 'react';
import {Bell,RefreshCw} from 'lucide-react';
import CreatorNoticeCard from './CreatorNoticeCard';
export default function AccountNotifications({notices=[],loading=false,error='',onRefresh}){
 const [expanded,setExpanded]=useState(false);
 return <section className="p-account-notifications" aria-label="Oznámení účtu"><div className="p-row p-between"><h2><Bell size={20}/> Oznámení</h2><button type="button" className="p-icon-button" disabled={loading} aria-label="Obnovit oznámení" onClick={onRefresh}><RefreshCw size={17}/></button></div><p className="p-small">Změny přístupu, odměny a zprávy ke svým výpravám najdete tady. Zobrazujeme posledních 50 oznámení.</p>
 {error&&<p className="p-alert" role="alert">{error}</p>}{loading&&!notices.length?<p role="status">Načítám oznámení…</p>:!error&&!notices.length?<p className="p-small">Zatím nemáte žádná oznámení.</p>:null}
 {(expanded?notices:notices.slice(0,3)).map(notice=><CreatorNoticeCard key={notice.id} notice={notice}/>)}
 {notices.length>3&&<button type="button" className="p-secondary" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Zobrazit méně':'Zobrazit všechna oznámení ('+notices.length+')'}</button>}
 </section>;
}
