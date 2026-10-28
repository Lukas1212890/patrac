'use client';
import {useEffect,useRef} from 'react';
import {X,ChevronRight} from 'lucide-react';
import {mapPlayStatus} from '../lib/mapPlayStatus.mjs';
export default function MapClusterPicker({items,onSelect,onClose}){
 const panel=useRef(null);
 useEffect(()=>{const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.querySelector('button')?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus?.();};},[]);
 useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const nodes=panel.current?.querySelectorAll('button');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 return <div className="p-modal-backdrop"><section ref={panel} className="p-modal" role="dialog" aria-modal="true" aria-labelledby="map-cluster-title"><div className="p-row p-between"><h2 id="map-cluster-title">Výpravy na tomto místě</h2><button className="p-icon-button" aria-label="Zavřít výběr výprav" onClick={onClose}><X/></button></div><p>Vyberte výpravu ({items.length}).</p><div className="p-community-list p-cluster-list">{items.map(item=><button key={item.code} onClick={()=>onSelect(item.code)}><span className={'p-discovery-icon '+mapPlayStatus(item.playStatus).className} aria-hidden="true">{mapPlayStatus(item.playStatus).symbol}</span><span><strong>{item.name}</strong><small>{mapPlayStatus(item.playStatus).label}</small></span><ChevronRight size={18}/></button>)}</div><button className="p-primary" onClick={onClose}>Zpět na mapu</button></section></div>;
}
