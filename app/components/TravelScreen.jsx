'use client';
import { useEffect, useState } from 'react';
import { Compass, Navigation, MapPin, Clock3, Users, LockKeyhole, LocateFixed, RefreshCw, Info, X } from 'lucide-react';
import NavigationChooser from './NavigationChooser';
import StopikNavigation from './StopikNavigation';
import { distanceTo } from '../lib/navigationMath';
import { compassTarget, nearestAngle } from '../lib/compassTarget.mjs';
import { installHomeGestureLock } from '../lib/homeGestureLock.mjs';

const formatTime = ms => { const sec = Math.floor(Math.max(0, ms || 0) / 1000); return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map(v => String(v).padStart(2, '0')).join(':'); };
function useContinuousAngle(value) {
  const [angle, setAngle] = useState(Number.isFinite(value) ? value : 0);
  useEffect(() => { if (Number.isFinite(value)) setAngle(previous => nearestAngle(previous, value)); }, [value]);
  return angle;
}
export default function TravelScreen({ game, team, position, heading, error, orientationError, compassPermission = 'unknown', elapsed, total, onEnableCompass, onRetry, simulated = false, onDemoArrival }) {
  const [chooser, setChooser] = useState(false), [navigation, setNavigation] = useState(false), [details, setDetails] = useState(false), [score, setScore] = useState(false);
  useEffect(() => { if (!navigation) return installHomeGestureLock(window); }, [navigation]);
  const target = team.station, distance = position ? distanceTo(position, target) : null;
  const destination = compassTarget(position, target, heading);
  const dialAngle = useContinuousAngle(heading);
  useEffect(() => { setChooser(false); setNavigation(false); setDetails(false); setScore(false); }, [team.index]);
  function startStopik() { setChooser(false); setNavigation(true); if (!simulated) onEnableCompass(); }
  return <main className="p-content p-player p-player-travelling">
    <div className="p-travel-art" role="img" aria-label="Fantasy cesta za pokladem"/>
    <div className="p-travel-meta"><span className="p-travel-team" title={team.name}><Users size={15}/><span>{team.name}</span></span><span className="p-travel-stop" aria-label={`Stanoviště ${team.index + 1} z ${game.totalStations}`}>{team.index + 1} / {game.totalStations}</span><button className="p-travel-clock" aria-label="Čas a nápovědy" onClick={() => setScore(true)}><Clock3 size={16}/>{formatTime(elapsed)}</button></div>
    <div className="p-travel-heading">{simulated && <span className="p-kicker">UKÁZKA · SIMULOVANÁ POLOHA</span>}<h1>{target.name}</h1></div>
    <section className="p-travel-body"><div className={'p-compass p-target-compass' + (destination ? '' : ' waiting')} aria-label={destination ? `Směr k místu ${target.name}` : 'Čekáme na polohu a orientaci telefonu'}>
      <div className="p-compass-dial" style={{transform:`rotate(${-dialAngle}deg)`}} aria-hidden="true"><svg className="p-compass-ticks" viewBox="0 0 200 200" aria-hidden="true">{Array.from({length:60}, (_,i) => <line key={i} x1="100" y1="4" x2="100" y2={i % 5 === 0 ? 14 : 9} transform={`rotate(${i*6} 100 100)`}/>)}</svg><span className="p-north">S</span><span className="p-east">V</span><span className="p-south">J</span><span className="p-west">Z</span></div>
      <div className="p-compass-inner" aria-label="Šipka ukazuje předek telefonu"><svg viewBox="0 0 64 80" aria-hidden="true"><path d="M32 3 54 73 32 61 10 73Z"/></svg></div>
      {!Number.isFinite(heading) && compassPermission !== 'granted' && <button className="p-compass-activation" aria-label="Zapnout kompas" disabled={compassPermission === 'requesting'} onClick={onEnableCompass}><Compass size={34}/><span>{compassPermission === 'requesting' ? 'Zapínám…' : 'Zapnout kompas'}</span></button>}
      {destination && <span className="p-compass-destination" role="img" aria-label={`Cíl: ${target.name}`} style={{left:destination.left+'%',top:destination.top+'%'}}><MapPin size={15} aria-hidden="true"/></span>}
    </div>
      <div className="p-travel-distance-row"><div className={'p-distance' + (distance === null ? ' p-location-loading' : '')}>{distance === null ? 'Načítám polohu' : distance < 1000 ? Math.round(distance)+' m' : (distance/1000).toFixed(1)+' km'}</div><button className={'p-travel-info' + (error ? ' has-error' : '')} aria-label={error ? 'GPS potřebuje pozornost — podrobnosti' : 'Podrobnosti GPS a cíle'} onClick={() => setDetails(true)}><Info size={21}/></button></div>
      {!Number.isFinite(heading) && (orientationError || compassPermission === 'granted') && <span className="p-compass-permission-note" role="status">{orientationError || 'Čekáme na orientaci telefonu.'}</span>}
      <div className="p-travel-status"><LockKeyhole size={13}/><span>{distance !== null && distance <= target.radius ? 'Ověřujeme příchod…' : 'Odemkne se na místě'}</span></div>
    </section>
    <div className="p-travel-bottom"><button className="p-primary p-navigate-button" onClick={() => setChooser(true)}><Navigation size={22}/> Navigovat</button>{simulated && <button className="p-text-button p-demo-arrival" onClick={onDemoArrival}>Ukázat příchod na místo</button>}</div>
    {score && <div className="p-modal-backdrop" onClick={() => setScore(false)}><section className="p-modal p-travel-details-modal" role="dialog" aria-modal="true" aria-labelledby="p-time-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setScore(false); }}><button autoFocus className="p-nav-chooser-close p-icon-button" aria-label="Zavřít čas a nápovědy" onClick={() => setScore(false)}><X size={20}/></button><span className="p-kicker">{game.name}</span><h2 id="p-time-title">Čas a nápovědy</h2><dl className="p-time-summary"><div><dt>Čas hry</dt><dd>{formatTime(elapsed)}</dd></div>{game.mode === 'race' ? <><div><dt>Nápovědy</dt><dd>+{formatTime(team.penaltyMs)}</dd></div><div className="p-time-result"><dt>Výsledný čas</dt><dd>{formatTime(total)}</dd></div></> : <div><dt>Režim</dt><dd>Hon za pokladem</dd></div>}</dl><p className="p-small">{game.mode === 'race' ? 'K času hry se přičítají použité nápovědy.' : 'Hrajete bez nápověd a časových penalizací.'}</p><button className="p-primary" onClick={() => setScore(false)}>Zpět do výpravy</button></section></div>}
    {chooser && <NavigationChooser target={target} position={position} simulated={simulated} onStopik={startStopik} onRetryLocation={onRetry} onCancel={() => setChooser(false)}/>}
    {navigation && <StopikNavigation target={target} position={position} heading={heading} error={error || orientationError} index={team.index} total={game.totalStations} onClose={() => setNavigation(false)} onEnableCompass={onEnableCompass} onRetry={onRetry} simulated={simulated}/>}
    {details && <div className="p-modal-backdrop" onClick={() => setDetails(false)}><section className="p-modal p-travel-details-modal" role="dialog" aria-modal="true" aria-labelledby="p-gps-title" onClick={e => e.stopPropagation()}><button className="p-nav-chooser-close p-icon-button" aria-label="Zavřít podrobnosti" onClick={() => setDetails(false)}><X size={20}/></button><h2 id="p-gps-title">Poloha a kompas</h2><p>{target.lat.toFixed(6)}, {target.lng.toFixed(6)}<br/>Oblast pro odemčení: {target.radius} m{position && <><br/>Přesnost GPS: ±{Math.round(position.acc)} m</>}</p>{error && <p className="p-alert" role="status">{error}</p>}{orientationError && <p className="p-small">{orientationError}</p>}<button className="p-secondary" onClick={onRetry}><RefreshCw size={18}/> Obnovit GPS</button>{heading === null && <button className="p-secondary" onClick={onEnableCompass}><Compass size={18}/> Zapnout kompas</button>}<p className="p-small p-gps-tip">Po návratu z Mapy.com nebo Google Maps Pátrač automaticky ověří příchod. Pak otevře hádanku.</p><button className="p-primary" onClick={() => setDetails(false)}>Zpět do výpravy</button></section></div>}
  </main>;
}
