'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Compass,LocateFixed,MapPin,Clock3,List,RefreshCw,ChevronRight,Star} from 'lucide-react';
import {loadMap,RasterMap} from './PatracMap';
import {getBaseMapConfig} from '../lib/mapConfig';
import {publicRequest,difficulties} from '../lib/public-client';
export default function CommunityMap({onSelect,onJoin}){
 const node=useRef(null),map=useRef(null),pins=useRef([]),select=useRef(onSelect),viewport=useRef(null);
 const [box,setBox]=useState('12,48,19,52'),[result,setResult]=useState(null),[error,setError]=useState(''),[mapError,setMapError]=useState(''),[fallback,setFallback]=useState(false),[ready,setReady]=useState(false),[locating,setLocating]=useState(false),[center,setCenter]=useState(null),[list,setList]=useState(false),[reload,setReload]=useState(0);
 select.current=onSelect;
 const bounds=useCallback(values=>{const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));setBox([clamp(values[0],-180,180),clamp(values[1],-85,85),clamp(values[2],-180,180),clamp(values[3],-85,85)].map(v=>Number(v).toFixed(4)).join(','));},[]);
 viewport.current=bounds;
 useEffect(()=>{let live=true;const controller=new AbortController();const timer=setTimeout(()=>publicRequest('/expeditions?bounds='+box,undefined,controller.signal).then(data=>{if(live){setResult(data);setError('');}}).catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);}),250);return()=>{live=false;clearTimeout(timer);controller.abort();};},[box,reload]);
 useEffect(()=>{if(fallback)return;let live=true;loadMap().then(lib=>{if(!live||!node.current)return;try{
  const base=getBaseMapConfig('map'),m=new lib.Map({container:node.current,style:{version:8,sources:{base:{type:'raster',tiles:base.tiles,tileSize:256,attribution:base.attribution,maxzoom:base.maxzoom}},layers:[{id:'base',type:'raster',source:'base'}]},center:[15.5,49.8],zoom:6,maxZoom:19,renderWorldCopies:false});map.current=m;
  m.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
  const update=()=>{const b=m.getBounds();viewport.current?.([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);};
  m.on('load',()=>{if(live){setReady(true);update();}});m.on('moveend',update);m.on('error',()=>{if(live)setMapError('Mapový podklad se nepodařilo načíst. Výpravy můžete otevřít i ze seznamu.');});
 }catch{if(live)setFallback(true);}}).catch(()=>{if(live)setFallback(true);});return()=>{live=false;pins.current.forEach(p=>p.remove());pins.current=[];map.current?.remove();map.current=null;};},[fallback]);
 useEffect(()=>{if(!ready||!map.current||fallback)return;pins.current.forEach(p=>p.remove());pins.current=[];
  for(const item of result?.expeditions||[]){const button=document.createElement('button');button.className='p-community-pin';button.type='button';button.textContent='✦';button.setAttribute('aria-label','Otevřít výpravu '+item.name);button.addEventListener('click',e=>{e.stopPropagation();select.current(item.code);});pins.current.push(new window.maplibregl.Marker({element:button}).setLngLat([item.lng,item.lat]).addTo(map.current));}
 },[result,ready,fallback]);
 async function locate(){setLocating(true);setMapError('');if(!navigator.geolocation){setMapError('Prohlížeč neposkytuje polohu. Mapu můžete posunout ručně.');setLocating(false);return;}
  navigator.geolocation.getCurrentPosition(p=>{const point={lat:p.coords.latitude,lng:p.coords.longitude};setCenter(point);map.current?.easeTo({center:[point.lng,point.lat],zoom:11,duration:500});setLocating(false);},()=>{setMapError('Polohu se nepodařilo získat. Povolte ji nebo posuňte mapu ručně.');setLocating(false);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
 }
 return <main className="p-community-home"><div className="p-community-map" data-patrac-pan="true">{fallback?<RasterMap overview target={center} points={result?.expeditions||[]} onPointSelect={onSelect} onBounds={bounds} baseMap="map"/>:<div ref={node} className="p-community-map-canvas" aria-label="Mapa veřejných výprav"/>}</div>
 <div className="p-map-heading"><span className="p-kicker">VENKU ČEKÁ DOBRODRUŽSTVÍ</span><h1>Kam vyrazíš dnes?</h1><p>Veřejné výpravy pro předplatitele.</p></div>
 <div className="p-map-tools"><button aria-label="Výpravy v mém okolí" disabled={locating} onClick={locate}><LocateFixed size={20}/>{locating?'Hledám…':'Moje okolí'}</button><button onClick={()=>setList(v=>!v)} aria-expanded={list}><List size={20}/>{list?'Skrýt seznam':'Seznam výprav'}</button></div>
 <section className={'p-map-discovery'+(list?' expanded':'')}><div className="p-row p-between"><strong><Compass size={19}/> {result?.expeditions?.length||0} výprav v mapě</strong><button type="button" aria-label="Obnovit mapu výprav" onClick={()=>setReload(v=>v+1)}><RefreshCw size={18}/></button></div>
 {(error||mapError)&&<p role="status" className="p-small">{error||mapError}</p>}
 {!result&&!error&&<p className="p-small" role="status">Načítám veřejné výpravy…</p>}
 {result&&!result.ready&&<p className="p-small">Veřejné výpravy právě připravujeme. Soukromou hru můžete otevřít kódem.</p>}
 {result?.ready&&!result.expeditions.length&&<p className="p-small">V této oblasti zatím žádná výprava není. Posuňte mapu nebo zveřejněte vlastní v záložce Tvořit.</p>}
 {result?.hasMore&&<p className="p-small">Je tu více výprav. Přibližte mapu pro přesnější výběr.</p>}
 {list&&<div className="p-community-list" data-patrac-pan="true">{result?.expeditions.map(item=><button key={item.code} onClick={()=>onSelect(item.code)}><span className="p-discovery-icon"><MapPin size={20}/></span><span><strong>{item.name}</strong><small>{difficulties[item.difficulty]} · {item.distanceKm} km · {item.estimatedMinutes} min</small>{item.rating?.count>0&&<small className="p-map-rating"><Star size={13} fill="currentColor"/> {Number(item.rating.average).toLocaleString('cs-CZ')} / 5 · {item.rating.count} hodnocení</small>}</span><ChevronRight size={18}/></button>)}</div>}
 <button type="button" className="p-primary p-code-entry" onClick={onJoin}>Zahájit soukromou výpravu <ChevronRight size={16}/></button>
 </section></main>;
}
