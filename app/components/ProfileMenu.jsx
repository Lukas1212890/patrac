'use client';
import {Trash2,Bell,CreditCard,UserRound,KeyRound,Info,ChevronRight} from 'lucide-react';
import NoticeBadge from './NoticeBadge';
export const PROFILE_TITLES={menu:'Můj profil',notifications:'Oznámení',billing:'Přístup a platby',details:'Údaje účtu',password:'Změna hesla',info:'Kontakt a dokumenty',delete:'Smazání účtu'};
const items=[['notifications',Bell,'Zprávy k výpravám, odměny a změny účtu.'],['billing',CreditCard,'Platnost přístupu, prodloužení a historie plateb.'],['details',UserRound,'E-mail účtu a změna přezdívky.'],['password',KeyRound,'Bezpečná změna přihlašovacího hesla.'],['info',Info,'Kontakt na provozovatele a důležité dokumenty.'],['delete',Trash2,'Trvalé smazání účtu a osobních herních dat.']];
export default function ProfileMenu({unread=0,onOpen}){
 return <nav className="p-profile-menu" aria-label="Sekce hráčského profilu">{items.map(([key,Icon,description])=><button type="button" key={key} className="p-profile-menu-item" onClick={()=>onOpen(key)}><span className={'p-profile-menu-icon p-profile-menu-icon-'+key}><Icon size={22}/></span><span className="p-profile-menu-copy"><strong>{PROFILE_TITLES[key]}{key==='notifications'&&<NoticeBadge count={unread}/>}</strong><small>{description}</small></span><ChevronRight size={19}/></button>)}</nav>;
}
