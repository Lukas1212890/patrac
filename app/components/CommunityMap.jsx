'use client';
import {mapPlayStatus,MAP_FILTER_GROUPS,filterMapExpeditions,parseMapFilters} from '../lib/mapPlayStatus.mjs';
import {formatRouteDistance} from '../../shared/routeEstimate.mjs';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Compass,LocateFixed,MapPin,List,RefreshCw,ChevronRight,Star,SlidersHorizontal} from 'lucide-react';
import {clusterMapPoints,clusterNeedsList} from '../lib/mapClusters.mjs';
import MapClusterPicker from './MapClusterPicker';
import MapFilters from './MapFilters';
import {loadMap,RasterMap} from './PatracMap';
import {getBaseMapConfig} from '../lib/mapConfig';
import {publicRequest,difficulties} from '../lib/public-client';
export default function CommunityMap({onSelect,onJoin,userId}){
 const node=useRef(null),map=useRef(null),pins=useRef([]),select=useRef(onSelect),viewport=useRef(null);
 const [box,setBox]=useState('12,48,19,52'),[result,setResult]=useState(null),[error,setError]=useState(''),[mapError,setMapError]=useState(''),[fallback,setFallback]=useState(false),[ready,setReady]=useState(false),[locating,setLocating]=useState(false),[center,setCenter]=useState(null),[list,setList]=useState(false),[reload,setReload]=useState(0);
 const [filterOpen,setFilterOpen]=useState(false),[selected,setSelected]=useState(MAP_FILTER_GROUPS);
 const [mapRevision,setMapRevision]=useState(0),[groupCodes,setGroupCodes]=useState(null);
 const filterKey='patrac-map-filters:'+(userId||'guest');
 useEffect(()=>{try{setSelected(parseMapFilters(localStorage.getItem(filterKey)));}catch{setSelected([...MAP_FILTER_GROUPS]);}},[filterKey]);
 const visible=useMemo(()=>filterMapExpeditions(result?.expeditions||[],selected),[result,selected]);
 const groupItems=groupCodes?visible.filter(item=>groupCodes.includes(item.code)):[];
 function openGroup(items){setGroupCodes(items.map(item=>item.code));}
 function changeFilters(value){setSelected(value);try{localStorage.setItem(filterKey,JSON.stringify(value));}catch{}}
 select.current=onSelect;
 useEffect(()=>{const refresh=()=>{if(!document.hidden)setReload(v=>v+1);};window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 const bounds=useCallback(values=>{const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));setBox([clamp(values[0],-180,180),clamp(values[1],-85,85),clamp(values[2],-180,180),clamp(values[3],-85,85)].map(v=>Number(v).toFixed(4)).join(','));},[]);
 viewport.current=bounds;
 useEffect(()=>{let live=true;const controller=new AbortController();const timer=setTimeout(()=>publicRequest('/expeditions?bounds='+box,undefined,controller.signal).then(data=>{if(live){setResult(data);setError('');}}).catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);}),250);return()=>{live=false;clearTimeout(timer);controller.abort();};},[box,reload]);
 useEffect(()=>{if(fallback)return;let live=true;loadMap().then(lib=>{if(!live||!node.current)return;try{
  const base=getBaseMapConfig('map'),m=new lib.Map({container:node.current,style:{version:8,sources:{base:{type:'raster',tiles:base.tiles,tileSize:256,attribution:base.attribution,maxzoom:base.maxzoom}},layers:[{id:'base',type:'raster',source:'base'}]},center:[15.5,49.8],zoom:6,maxZoom:19,renderWorldCopies:false,attributionControl:false});map.current=m;
  m.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
  m.addControl(new lib.AttributionControl({compact:false}),'bottom-right');
  const update=()=>{if(!live)return;setMapRevision(v=>v+1);const b=m.getBounds();viewport.current?.([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);};
  m.on('load',()=>{if(live){setReady(true);update();}});m.on('moveend',update);m.on('resize',update);m.on('error',()=>{if(live)setMapError('Mapový podklad se nepodařilo načíst. Výpravy můžete otevřít i ze seznamu.');});
 }catch{if(live)setFallback(true);}}).catch(()=>{if(live)setFallback(true);});return()=>{live=false;pins.current.forEach(p=>p.remove());pins.current=[];map.current?.remove();map.current=null;};},[fallback]);
 useEffect(()=>{if(!ready||!map.current||fallback)return;pins.current.forEach(p=>p.remove());pins.current=[];
  const m=map.current;
  for(const group of clusterMapPoints(visible,item=>m.project([item.lng,item.lat]))){
   const clustered=group.items.length>1,item=group.items[0],status=mapPlayStatus(item.playStatus);
   const button=document.createElement('button');button.className='p-community-pin '+(clustered?'is-cluster':status.className);button.type='button';
   const badge=document.createElement('span');badge.className='p-pin-badge';badge.textContent=clustered?String(group.items.length):status.symbol;badge.setAttribute('aria-hidden','true');button.append(badge);
   const label=clustered?`${group.items.length} výprav — přiblížit nebo vybrat`:item.name+' · '+status.label;button.title=label;button.setAttribute('aria-label',label);
   const point=m.unproject([group.x,group.y]);
   button.addEventListener('click',e=>{e.stopPropagation();if(!clustered){select.current(item.code);return;}if(clusterNeedsList(group.items,m.getZoom(),m.getMaxZoom()))openGroup(group.items);else m.easeTo({center:point,zoom:Math.min(m.getMaxZoom(),m.getZoom()+2),duration:400});});
   pins.current.push(new window.maplibregl.Marker({element:button}).setLngLat(point).addTo(m));
  }
 },[visible,ready,fallback,mapRevision]);
 async function locate(){setLocating(true);setMapError('');if(!navigator.geolocation){setMapError('Prohlížeč neposkytuje polohu. Mapu můžete posunout ručně.');setLocating(false);return;}
  navigator.geolocation.getCurrentPosition(p=>{const point={lat:p.coords.latitude,lng:p.coords.longitude};setCenter(point);map.current?.easeTo({center:[point.lng,point.lat],zoom:11,duration:500});setLocating(false);},()=>{setMapError('Polohu se nepodařilo získat. Povolte ji nebo posuňte mapu ručně.');setLocating(false);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
 }
 return <><main className="p-community-home"><div className="p-community-map" data-patrac-pan="true">{fallback?<RasterMap overview target={center} points={visible} onPointSelect={onSelect} onPointGroup={openGroup} onBounds={bounds} baseMap="map"/>:<div ref={node} className="p-community-map-canvas" data-patrac-map-gestures="true" aria-label="Mapa veřejných výprav"/>}</div>
 <div className="p-map-heading"><span className="p-kicker">VENKU ČEKÁ DOBRODRUŽSTVÍ</span><h1>Kam vyrazíš dnes?</h1><p>Veřejné výpravy pro předplatitele.</p></div>
 <div className="p-map-tools"><button aria-label={locating?'Hledám polohu':'Výpravy v mém okolí'} disabled={locating} onClick={locate}><LocateFixed size={20}/><span className="p-map-locate-label">{locating?'Hledám…':'Moje okolí'}</span></button><button onClick={()=>setList(v=>!v)} aria-expanded={list} aria-controls="community-discovery"><List size={20}/><span className="p-map-list-desktop">{list?'Skrýt seznam':'Seznam výprav'}</span><span className="p-map-list-mobile">{list?'Zavřít seznam':'Výpravy'}{!list&&' ('+(result?visible.length:'…')+')'}</span></button><button className={selected.length<3?'is-filtered':''} onClick={()=>setFilterOpen(true)} aria-haspopup="dialog" aria-expanded={filterOpen}><SlidersHorizontal size={20}/>Filtr{selected.length<3?' ('+selected.length+'/3)':''}</button></div>
 <section id="community-discovery" aria-label="Výpravy a soukromá hra" className={'p-map-discovery'+(list?' expanded':'')}><div className="p-row p-between"><strong><Compass size={19}/> {visible.length} výprav v mapě</strong><button type="button" aria-label="Obnovit mapu výprav" onClick={()=>setReload(v=>v+1)}><RefreshCw size={18}/></button></div>
 {(error||mapError)&&<p role="status" className="p-small p-map-notice">{error||mapError}</p>}
 <div className="p-discovery-info">
 {!result&&!error&&<p className="p-small" role="status">Načítám veřejné výpravy…</p>}
 {result&&!result.ready&&<p className="p-small">Veřejné výpravy právě připravujeme. Soukromou hru můžete otevřít kódem.</p>}
 {result?.ready&&!result.expeditions.length&&<p className="p-small">V této oblasti zatím žádná výprava není. Posuňte mapu nebo zveřejněte vlastní v záložce Tvořit.</p>}
 {result?.hasMore&&<p className="p-small">Je tu více výprav. Přibližte mapu pro přesnější výběr.</p>}
 </div>
 {result?.ready&&result.expeditions.length>0&&!visible.length&&<p className="p-small" role="status">Vybranému filtru v této oblasti neodpovídá žádná výprava.</p>}
 {list&&<div className="p-community-list" data-patrac-pan="true">{visible.map(item=><button key={item.code} onClick={()=>onSelect(item.code)}><span className={"p-discovery-icon "+mapPlayStatus(item.playStatus).className} aria-label={mapPlayStatus(item.playStatus).label}>{item.playStatus?<span aria-hidden="true">{mapPlayStatus(item.playStatus).symbol}</span>:<MapPin size={20}/>}</span><span><strong>{item.name}</strong>{item.playStatus&&<small>{mapPlayStatus(item.playStatus).label}</small>}<small>{difficulties[item.difficulty]} · {formatRouteDistance(item)} vzdušně · ≈ {item.estimatedMinutes} min</small><small>{item.timeEstimateSource==='author'?'Časový odhad podle správce':'Automatický odhad ze vzdálenosti vzdušnou čarou'}</small>{item.rating?.count>0&&<small className="p-map-rating"><Star size={13} fill="currentColor"/> {Number(item.rating.average).toLocaleString('cs-CZ')} / 5 · {item.rating.count} hodnocení</small>}</span><ChevronRight size={18}/></button>)}</div>}
 <button type="button" className="p-primary p-code-entry" onClick={onJoin}>Zahájit soukromou výpravu <ChevronRight size={16}/></button>
 </section></main>{groupCodes&&<MapClusterPicker items={groupItems} onSelect={onSelect} onClose={()=>setGroupCodes(null)}/>}{filterOpen&&<MapFilters selected={selected} onChange={changeFilters} onClose={()=>setFilterOpen(false)}/>}</>;
}
