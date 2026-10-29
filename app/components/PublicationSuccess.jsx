'use client';
import {useEffect,useId,useRef} from 'react';
import {Trophy} from 'lucide-react';
export default function PublicationSuccess({name,onClose}){
 const button=useRef(null),titleId=useId(),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';button.current?.focus();
  function key(e){if(e.key==='Escape')close.current();if(e.key==='Tab'){e.preventDefault();button.current?.focus();}}
  document.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus?.();};
 },[]);
 return <div className="p-modal-backdrop"><section className="p-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
 <Trophy className="p-big-icon"/><span className="p-kicker">NOVÉ DOBRODRUŽSTVÍ JE NA MAPĚ</span>
 <h2 id={titleId}>Gratulujeme, tvoje výprava je venku!</h2>
 <p><strong>{name}</strong> už čeká na první pátrače. Díky tobě má teď někdo další důvod vyrazit ven, zapojit hlavu a zažít dobrodružství.</p>
 <p>Sleduj hodnocení a komentáře hráčů — pomůžou ti vymyslet ještě lepší výpravy. Za každých 100 dokončených her na této výpravě navíc získáš <strong>2 měsíce přístupu zdarma</strong>.</p>
 <button ref={button} type="button" className="p-primary" onClick={onClose}>Ať dobrodružství začne!</button>
 </section></div>;
}
