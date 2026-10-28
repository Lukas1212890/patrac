'use client';
import {useEffect,useState} from 'react';
import {publicRequest} from '../lib/public-client';
import ExpeditionReviews from './ExpeditionReviews';
export default function OwnerReviews({code,user}){
 const [expanded,setExpanded]=useState(()=>typeof window!=='undefined'&&new URL(window.location.href).searchParams.get('reviews')===code);
 const [reviews,setReviews]=useState(null),[reload,setReload]=useState(0),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{const controller=new AbortController();setError('');publicRequest('/expeditions/'+code+'/reviews?manage=1',undefined,controller.signal).then(setReviews).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[code,user?.id,reload]);
 return <details className="p-panel p-owner-reviews" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}><summary>Hodnocení a komentáře{reviews?.count>0?' · ★ '+Number(reviews.average).toLocaleString('cs-CZ')+' / 5 · '+reviews.count+' hodnocení':reviews?' · zatím bez hodnocení':''}</summary>{message&&<p className="p-note" role="status">{message}</p>}{error?<div className="p-alert" role="alert">{error}<button className="p-text-button" onClick={()=>setReload(v=>v+1)}>Obnovit hodnocení</button></div>:!reviews?<p role="status">Načítám hodnocení a komentáře…</p>:<ExpeditionReviews key={code+':'+reload} code={code} user={user} isAuthor reviews={reviews} onRefresh={message=>{setMessage(message);setReload(v=>v+1);window.dispatchEvent(new Event('patrac-expeditions-changed'));}}/>}</details>;
}
