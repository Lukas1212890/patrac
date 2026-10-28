'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize, Minimize, X, Compass, LocateFixed } from 'lucide-react';
import useStopikMap from './useStopikMap';
import { RasterMap } from './PatracMap';
import { distanceTo } from '../lib/navigationMath';

export default function StopikNavigation({ target, position, heading, error, index, total, onClose, onEnableCompass, onRetry, simulated = false }) {
  const [mapFull, setFull] = useState(false), [baseMap, setBase] = useState('map'), [mapError, setMapError] = useState('');
  // Polling the expedition must not tear down and rebuild a live navigation map.
  const active = useMemo(() => ({ stops: [{ lat: target.lat, lng: target.lng }] }), [target.lat, target.lng]);
  useStopikMap({ compass: !mapError, navView: 'map', active, currentIndex: 0, compassPos: position, heading, mapFull, baseMap, setCompassError: setMapError });
  useEffect(() => {
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = e => { if (e.key === 'Escape') { if (mapFull) setFull(false); else onClose(); } };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); };
  }, [mapFull, onClose]);
  const distance = position ? Math.round(distanceTo(position, target)) : null;
  return createPortal(<section className="p-stopik-navigation" role="dialog" aria-modal="true" aria-label="Stopíkova navigace">
    <button className="p-stopik-close" onClick={onClose} aria-label="Zavřít navigaci"><X size={23}/></button>
    <div className="p-stopik-title">STOPÍKOVA NAVIGACE</div><div className="p-stopik-stop">{simulated ? 'UKÁZKA · SIMULOVANÁ POLOHA' : `STANOVIŠTĚ ${index + 1} / ${total}`}</div>
    <div className={'p-stopik-map-shell' + (mapFull ? ' full' : '')}>
      {mapError ? <RasterMap target={target} position={position} baseMap={baseMap} navigation heading={heading} mapFull={mapFull}/> : <div id="patracStopikMap" className="p-stopik-map" data-patrac-map-gestures="true"/>}
      <div className="p-stopik-basemaps"><button className={baseMap === 'map' ? 'active' : ''} onClick={() => setBase('map')}>Mapa</button><button className={baseMap === 'aerial' ? 'active' : ''} onClick={() => setBase('aerial')}>Letecká</button></div>
      <button className="p-stopik-full" aria-label={mapFull ? 'Zavřít mapu na celou obrazovku' : 'Mapa na celou obrazovku'} onClick={() => setFull(v => !v)}>{mapFull ? <Minimize size={22}/> : <Maximize size={22}/>}</button>
    </div>
    <div className="p-stopik-distance">{distance === null ? 'GPS…' : distance < 1000 ? distance + ' m' : (distance / 1000).toFixed(1) + ' km'}</div>
    <div className="p-stopik-message">{distance === null ? 'Hledám tvoji polohu…' : distance <= target.radius ? 'Jsi na místě. Ověřuji příchod…' : distance <= 25 ? 'Jsi blízko!' : 'Pokračuj k hledací oblasti'}</div>
    <div className="p-stopik-accuracy">{position ? (position.stabilizing ? 'Zpřesňuji tvoji polohu… ± ' : 'Přesnost GPS ± ') + Math.round(position.acc) + ' m' : 'Mapa je připravena, čekám na GPS…'}</div>
    {error && <div className="p-stopik-error" role="status">{error}</div>}
    <div className="p-stopik-actions">{heading === null && <button className="p-secondary" onClick={onEnableCompass}><Compass size={18}/> Povolit otáčení mapy</button>}<button className="p-text-button" onClick={onRetry}><LocateFixed size={16}/> Obnovit GPS</button><p>Na místě se automaticky otevře hádanka.</p></div>
  </section>, document.body);
}
