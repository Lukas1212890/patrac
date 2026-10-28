'use client';
import {useState} from 'react';
import CreatorNoticeCard from './CreatorNoticeCard';
export default function CreatorNotices({userId,notices,onOpenProfile}){
 const key='patrac-dismissed-notices:'+userId;
 const [dismissed,setDismissed]=useState(()=>{try{const value=JSON.parse(localStorage.getItem(key));return Array.isArray(value)?value:[];}catch{return[];}});
 const notice=notices.find(item=>!dismissed.includes(item.id));if(!notice)return null;
 function dismiss(){const next=[...dismissed,notice.id].slice(-100);setDismissed(next);try{localStorage.setItem(key,JSON.stringify(next));}catch{}}
 return <section className="p-creator-notices" data-patrac-pan="true" role="status" aria-label="Nové oznámení účtu"><CreatorNoticeCard notice={notice}/><div><button type="button" className="p-text-button" onClick={onOpenProfile}>Všechna oznámení v profilu</button><button type="button" className="p-secondary" onClick={dismiss}>Rozumím</button></div></section>;
}
