'use client';
import { useEffect, useState } from 'react';
import { createStopikTracker } from '../lib/stopikGps.mjs';
// Navigation uses the same GPS smoothing/jump filtering as Stopař. Arrival
// retains the fresh raw fix for the independent server-side geofence check.
export default function usePatracPosition(enabled) {
  const [position, setPosition] = useState(null), [error, setError] = useState(''), [restart, setRestart] = useState(0);
  useEffect(() => {
    if (!enabled) { setPosition(null); return; }
    if (!navigator.geolocation) { setError('GPS není v tomto zařízení dostupná.'); return; }
    const tracker = createStopikTracker(); let cancelled = false; setPosition(null); setError('');
    const watch = navigator.geolocation.watchPosition(p => {
      if (cancelled || Date.now() - p.timestamp > 20000) return;
      const sample = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, timestamp: p.timestamp };
      if (!Number.isFinite(sample.acc) || sample.acc <= 0 || sample.acc > 120) { setError('GPS zatím není přesná. Vyčkejte na volném prostranství.'); return; }
      const smoothed = tracker.push(sample);
      if (smoothed) { setPosition(smoothed); setError(''); }
    }, e => { if (!cancelled) setError(e.code === 1 ? 'Povolte Pátrači přístup k poloze v nastavení prohlížeče.' : 'Polohu se nepodařilo zjistit. Zkuste GPS znovu.'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    const resume = () => { if (!document.hidden) setRestart(n => n + 1); };
    document.addEventListener('visibilitychange', resume); window.addEventListener('pageshow', resume);
    return () => { cancelled = true; navigator.geolocation.clearWatch(watch); document.removeEventListener('visibilitychange', resume); window.removeEventListener('pageshow', resume); };
  }, [enabled, restart]);
  return { position, error, retry: () => setRestart(n => n + 1) };
}
