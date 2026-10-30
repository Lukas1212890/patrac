'use client';
import {Bell,UsersRound,Settings2,ShieldAlert,ChevronRight,Radio} from 'lucide-react';
export const ADMIN_TITLES={menu:'Administrace',events:'Události administrace',players:'Profily hráčů',push:'Upozornění správce',runtime:'Režim celé hry',reports:'Nahlášené problémy'};
const sections=[['events',Bell,'Registrace, platby a historie událostí.'],['players',UsersRound,'Účty, přístupy, limity a výpravy hráčů.'],['push',Radio,'Push upozornění a zkouška doručení.'],['runtime',Settings2,'Testovací nebo ostrý provoz hry.'],['reports',ShieldAlert,'Hlášení hráčů a kontrola obsahu.']];
export default function AdminMenu({onOpen,unread=0}){
 return <nav className="pa-menu" aria-label="Sekce administrace">{sections.map(([key,Icon,description])=><button type="button" key={key} className="pa-menu-item" onClick={()=>onOpen(key)}><span className={'pa-menu-icon pa-menu-icon-'+key}><Icon size={25}/></span><span className="pa-menu-copy"><strong>{ADMIN_TITLES[key]}{key==='events'&&unread>0&&<span className="pa-inbox-count" aria-label={unread+' nepřečtených událostí'}>{unread}</span>}</strong><small>{description}</small></span><ChevronRight size={20}/></button>)}</nav>;
}
