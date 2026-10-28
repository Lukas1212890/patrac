'use client';
import { useEffect, useRef, useState } from 'react';
import { getBaseMapConfig, getNavigationZoom } from '../lib/mapConfig';
import { autoFitNavMap, distanceTo } from '../lib/navigationMath';
import { project, unproject } from '../lib/mapProjection.mjs';
let loader;
export function loadMap() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (!loader) loader = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = '/vendor/maplibre-gl.js';
    s.onload = () => resolve(window.maplibregl); s.onerror = () => { loader = null; reject(new Error('Mapu se nepodařilo načíst.')); }; document.head.append(s);
  });
  return loader;
}
export default function PatracMap({ target, position, onPick, heading = null }) {
  const node = useRef(null), map = useRef(null), user = useRef(null), pin = useRef(null), callback = useRef(onPick);
  const [baseMap, setBase] = useState('map'), [error, setError] = useState(''), [fallback, setFallback] = useState(false);
  callback.current = onPick;
  useEffect(() => {
    let cancelled = false; setError('');
    if (fallback) return;
    loadMap().then(lib => {
      if (cancelled || !node.current) return;
      const base = getBaseMapConfig(baseMap);
      const m = new lib.Map({ container: node.current, style: { version: 8, sources: { base: { type: 'raster', tiles: base.tiles, tileSize: 256, attribution: base.attribution, maxzoom: base.maxzoom } }, layers: [{ id: 'base', type: 'raster', source: 'base' }] }, center: target ? [target.lng, target.lat] : [15.5, 49.8], zoom: target ? 16 : 6, maxZoom: base.maxzoom + 1 });
      map.current = m;
      m.addControl(new lib.NavigationControl({ showCompass: true }), 'top-right');
      const marker = document.createElement('div'); marker.className = 'p-target-marker'; marker.textContent = '✦';
      pin.current = new lib.Marker({ element: marker, draggable: Boolean(onPick) }).setLngLat(target ? [target.lng, target.lat] : [15.5, 49.8]).addTo(m);
      if (onPick) { pin.current.on('dragend', () => { const p = pin.current.getLngLat(); callback.current?.({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); }); m.on('click', e => callback.current?.({ lat: +e.lngLat.lat.toFixed(6), lng: +e.lngLat.lng.toFixed(6) })); }
      m.on('error', () => setError('Mapový podklad není dostupný. Souřadnice a GPS můžete dál použít.'));
      m.on('load', () => { if (position && target) autoFitNavMap(m, position, target, false, heading, base.maxzoom); });
    }).catch(() => { setFallback(true); setError(''); });
    return () => { cancelled = true; user.current = null; pin.current = null; map.current?.remove(); map.current = null; };
  }, [baseMap, Boolean(onPick), fallback]);
  useEffect(() => {
    if (pin.current && target) pin.current.setLngLat([target.lng, target.lat]);
    if (map.current && target && !position) map.current.easeTo({ center: [target.lng, target.lat], duration: 300 });
  }, [target?.lat, target?.lng]);
  useEffect(() => {
    const m = map.current; if (!m || !position || !window.maplibregl) return;
    if (!user.current) { const el = document.createElement('div'); el.className = 'p-user-marker'; user.current = new window.maplibregl.Marker({ element: el }).setLngLat([position.lng, position.lat]).addTo(m); }
    else user.current.setLngLat([position.lng, position.lat]);
    if (target && !onPick) autoFitNavMap(m, position, target, false, heading, getBaseMapConfig(baseMap).maxzoom);
  }, [position?.lat, position?.lng, target?.lat, target?.lng, heading, baseMap]);
  return <div className="p-map-wrap">{fallback ? <RasterMap target={target} position={position} onPick={onPick} baseMap={baseMap}/> : <div className="p-map" ref={node} aria-label={onPick ? 'Kliknutím vyberte stanoviště' : 'Mapa aktuálního cíle'} />}<div className="p-map-switch"><button type="button" className={baseMap === 'map' ? 'selected' : ''} onClick={() => setBase('map')}>Mapa</button><button type="button" className={baseMap === 'aerial' ? 'selected' : ''} onClick={() => setBase('aerial')}>Letecká</button></div>{error && <div className="p-map-error" role="status">{error}</div>}</div>;
}

// Raster fallback retains a working map on devices without a WebGL context.
export function RasterMap({ target, position, onPick, baseMap, navigation = false, heading = null, mapFull = false, overview = false, points = [], onPointSelect, onBounds }) {
  const [center, setCenter] = useState(target || { lat: 49.8, lng: 15.5 }), [zoom, setZoom] = useState(overview ? 6 : target ? 16 : 6), [width, setWidth] = useState(500);
  const [height, setHeight] = useState(320);
  const box = useRef(null), drag = useRef(null);
  useEffect(() => { const observer = new ResizeObserver(entries => { setWidth(entries[0].contentRect.width); setHeight(entries[0].contentRect.height); }); if (box.current) observer.observe(box.current); return () => observer.disconnect(); }, []);
  useEffect(() => { if (target) { setCenter(target); if(overview)setZoom(11); } }, [target?.lat, target?.lng]);
  useEffect(()=>{if(!overview||!onBounds)return;const c=project(center,zoom),sw=unproject(c.x-width/2,c.y+height/2,zoom),ne=unproject(c.x+width/2,c.y-height/2,zoom);onBounds([sw.lng,sw.lat,ne.lng,ne.lat]);},[overview,center.lat,center.lng,zoom,width,height,onBounds]);
  let viewZoom = zoom, viewCenter = center;
  const base = getBaseMapConfig(baseMap);
  if (navigation && target) {
    viewZoom = getNavigationZoom(position ? distanceTo(position, target) : null, Boolean(position), base.maxzoom);
    if (position) {
      const angle = (heading || 0) * Math.PI / 180, padX = mapFull ? 140 : 84, padY = mapFull ? 180 : 108;
      while (viewZoom > 2) { const a = project(position, viewZoom), b = project(target, viewZoom), dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) <= Math.max(40, width - padX) && Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) <= Math.max(40, height - padY)) break;
        viewZoom--;
      }
      const a = project(position, viewZoom), b = project(target, viewZoom); viewCenter = unproject((a.x + b.x) / 2, (a.y + b.y) / 2, viewZoom);
    } else viewCenter = target;
  }
  const p = project(viewCenter, viewZoom), origin = { x: p.x - width / 2, y: p.y - height / 2 }, tiles = [];
  const template = base.tiles[0], limit = 2 ** viewZoom, overscan = navigation && heading !== null ? Math.ceil(Math.hypot(width, height) / 2) : 0;
  for (let y = Math.floor((origin.y - overscan) / 256); y <= Math.floor((origin.y + height + overscan) / 256); y++) for (let x = Math.floor((origin.x - overscan) / 256); x <= Math.floor((origin.x + width + overscan) / 256); x++) {
    if (y < 0 || y >= limit) continue;
    const src = template.replace('{z}', viewZoom).replace('{x}', (x % limit + limit) % limit).replace('{y}', y);
    tiles.push(<img key={`${viewZoom}/${x}/${y}/${baseMap}`} src={src} alt="" draggable={false} style={{ position: 'absolute', width: 256, height: 256, maxWidth: 'none', left: x * 256 - origin.x, top: y * 256 - origin.y }}/>);
  }
  const pointStyle = point => { const pixel = project(point, viewZoom); return { position: 'absolute', left: pixel.x - origin.x, top: pixel.y - origin.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }; };
  const a = position ? project(position, viewZoom) : null, b = target ? project(target, viewZoom) : null;
  const zoneRadius = target ? 7.5 / (156543.033928 * Math.cos(target.lat * Math.PI / 180) / 2 ** viewZoom) : 0;
  return <div className="p-raster-map" ref={box} role="application" aria-label={onPick ? 'Mapa: přetáhněte pro posun, klepněte pro výběr' : 'Mapa cíle'}
    onPointerDown={e => { if (navigation || e.target.closest('button,a')) return; drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerUp={e => { const start = drag.current; drag.current = null; if (!start) return; const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.hypot(dx, dy) > 6) setCenter(unproject(p.x - dx, p.y - dy, zoom)); else if (onPick) { const bounds = box.current.getBoundingClientRect(); onPick(unproject(origin.x + e.clientX - bounds.left, origin.y + e.clientY - bounds.top, zoom)); } }}>
    <div className="p-raster-content" style={{ position: 'absolute', inset: 0, transform: navigation ? `rotate(${-(heading || 0)}deg)` : undefined, transition: navigation ? 'transform .18s linear' : undefined }}>{tiles}
      {navigation && <svg className="p-raster-route" width={width} height={height} aria-label="Modrá spojnice k cíli a oranžová hledací oblast" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{a && b && <line x1={a.x - origin.x} y1={a.y - origin.y} x2={b.x - origin.x} y2={b.y - origin.y} stroke="#1687ff" strokeWidth="6"/>}{b && <circle cx={b.x - origin.x} cy={b.y - origin.y} r={zoneRadius} fill="#ff9f0a" fillOpacity=".3" stroke="#ff9f0a" strokeWidth="2"/>}</svg>}
      {points.map(point=><button type="button" className="p-community-pin" key={point.code} aria-label={'Otevřít výpravu '+point.name} style={{...pointStyle(point),pointerEvents:'auto'}} onClick={()=>onPointSelect?.(point.code)}>✦</button>)}
      {!overview && !navigation && target && <div className="p-target-marker" style={pointStyle(target)}>✦</div>}{position && <div className={navigation ? 'p-stopik-user-dot' : 'p-user-marker'} style={pointStyle(position)}/>}
    </div>
    {!navigation && <div className="p-raster-controls"><button type="button" aria-label="Přiblížit mapu" onClick={() => setZoom(z => Math.min(base.maxzoom, z + 1))}>+</button><button type="button" aria-label="Oddálit mapu" onClick={() => setZoom(z => Math.max(2, z - 1))}>−</button><button type="button" aria-label="Zobrazit cíl" onClick={() => { if (target) setCenter(target); }}>◎</button></div>}
    <div className="p-raster-credit">{baseMap === 'map' ? 'Esri, HERE, Garmin, USGS, © OpenStreetMap, GIS User Community' : 'Esri, Maxar, GIS User Community'}</div>
  </div>;
}
