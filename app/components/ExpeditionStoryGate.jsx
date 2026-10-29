'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Compass,Trophy} from 'lucide-react';
export default function ExpeditionStoryGate({text,title,finished=false,storageKey,eventKey,children}){
 const [dismissed,setDismissed]=useState(()=>{try{return localStorage.getItem(storageKey)===eventKey;}catch{return false;}});
 const button=useRef(null),titleId=useId();
 const visible=Boolean(text?.trim())&&!dismissed;
 useEffect(()=>{
  if(!visible)return;
  const previous=document.activeElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';button.current?.focus();
  function key(e){if(e.key==='Tab'){e.preventDefault();button.current?.focus();}}
  document.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus?.();};
 },[visible]);
 if(!visible)return children;
 return <main className="p-narrow"><div className="p-modal-backdrop"><section className="p-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
 {finished?<Trophy className="p-big-icon"/>:<Compass className="p-big-icon"/>}
 <span className="p-kicker">{finished?'VÝPRAVA DOKONČENA':'JSTE NA MÍSTĚ'}</span><h2 id={titleId}>{title}</h2>
 <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</p>
 <button ref={button} type="button" className="p-primary" onClick={()=>{try{localStorage.setItem(storageKey,eventKey);}catch{}setDismissed(true);}}>{finished?'Zobrazit výsledek':'Pokračovat k hádance'}</button>
 </section></div></main>;
}
