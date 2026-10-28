'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Navigation, Map, X, RefreshCw } from 'lucide-react';
import { buildExternalNavigationUrls } from '../lib/externalNavigation.mjs';

export default function NavigationChooser({ target, position, onStopik, onRetryLocation, onCancel, simulated }) {
  const urls = buildExternalNavigationUrls(target, position), card = useRef(null), cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; card.current?.querySelector('button')?.focus();
    const key = e => {
      if (e.key === 'Escape') cancel.current();
      if (e.key === 'Tab') {
        const controls = [...card.current.querySelectorAll('button,a[href]')].filter(el => !el.disabled), first = controls[0], last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="p-modal-backdrop p-nav-chooser" onClick={onCancel}><section ref={card} className="p-modal" role="dialog" aria-modal="true" aria-labelledby="p-nav-title" onClick={e => e.stopPropagation()}>
    <button className="p-nav-chooser-close p-icon-button" aria-label="Zavřít výběr navigace" onClick={onCancel}><X size={20}/></button><span className="p-kicker">DALŠÍ STOPA ČEKÁ</span><h2 id="p-nav-title">Jak chceš pokračovat?</h2>
    {simulated && <p className="p-small">Ukázka používá simulovanou polohu.</p>}
    {!urls ? <p role="alert">Tato stopa nemá platnou polohu. Organizátor musí opravit její souřadnice.</p> : <>
      <button className="p-primary" onClick={onStopik}><Compass size={21}/> Stopíkova navigace</button>
      <a className="p-secondary" href={urls.googleMapsUrl}><Navigation size={19}/> Google Maps</a>
      {urls.mapyUrl ? <><a className="p-secondary" href={urls.mapyUrl}><Map size={19}/> Mapy.com</a><a className="p-text-button p-route-preview" href={urls.mapyRouteUrl}>Zobrazit trasu bez spuštění navigace</a></> : <><p className="p-small" role="status">Pro trasu v Mapy.com potřebujeme tvoji aktuální polohu.</p><button className="p-secondary" onClick={onRetryLocation}><RefreshCw size={17}/> Znovu načíst polohu</button></>}
    </>}
    <button className="p-text-button p-chooser-cancel" onClick={onCancel}>Zrušit</button>
  </section></div>, document.body);
}
