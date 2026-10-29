'use client';
import {UserRound,Check} from 'lucide-react';
import NoticeBadge from './NoticeBadge';
export default function ProfileButton({user,unreadCount=0,onClick}){
 const label=user?'Přihlášený účet'+(user.name?': '+user.name:'')+'. Můj profil'+(unreadCount?', nepřečtená oznámení: '+unreadCount:''):'Přihlášení';
 return <button type="button" className={'p-icon-button p-profile-button'+(user?' is-signed-in':'')} aria-label={label} title={user?'Přihlášený účet'+(user.name?': '+user.name:''):'Přihlásit se'} onClick={onClick}><UserRound size={20} aria-hidden="true"/>{user&&<><span className="p-profile-signed-in" aria-hidden="true"><Check size={11} strokeWidth={3}/></span><NoticeBadge count={unreadCount}/></>}</button>;
}
