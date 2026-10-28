'use client';
import { useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Trash2, ArrowUp, ArrowDown, LocateFixed, Camera, Flag, Save, ArrowLeft, Map } from 'lucide-react';
import { getStablePosition } from '../lib/geolocation';
import { preparePhoto, optimizeDraftPhotos } from '../lib/imageTools';
import RouteEstimateFields from './RouteEstimateFields';
import PatracMap from './PatracMap';
import { draftOperation } from '../lib/draftStorage';
import { validateExpedition, PENALTY_OPTIONS } from '../lib/patrac-engine.mjs';
export const blankStation = () => ({ name: '', lat: '', lng: '', radius: 25, question: '', answer: '', solutionMinutes: 30, hints: [{ type: 'text', content: '', minutes: 10 }] });
const freshDraft = visibility => ({ name: '', mode: 'race', visibility,timeEstimateOverride:null, ...(visibility==='public'?{publicInfo:{description:'',difficulty:'easy'}}:{}), stations: [blankStation()] });
export default function PatracEditor({ initial, onSave, onBack, saving, defaultVisibility='private' }) {
  const [draft, setDraft] = useState(() => initial || freshDraft(defaultVisibility)), [active, setActive] = useState(0), [error, setError] = useState(''), [gpsBusy, setGpsBusy] = useState(false), [showMap, setShowMap] = useState(false), [photoBusy, setPhotoBusy] = useState(false);
  const [editing, setEditing] = useState(true), [stationSaving, setStationSaving] = useState(false), [stationError, setStationError] = useState(''), [stationMessage, setStationMessage] = useState('');
  const addButton = useRef(null), stationPanel = useRef(null), summaryPanel = useRef(null);
  const storageKey = defaultVisibility==='public'?'public-current':'current';
  const isPublic=(draft.visibility||'private')==='public';
  const [draftLoaded, setDraftLoaded] = useState(Boolean(initial));
  useEffect(() => { if (initial) return; let cancelled = false; draftOperation('get',undefined,storageKey).then(value => { if (!cancelled && value?.stations?.length) setDraft(value); }).catch(() => { if (!cancelled) setError('Průběžné ukládání konceptu není v tomto prohlížeči dostupné.'); }).finally(() => { if (!cancelled) setDraftLoaded(true); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (initial || !draftLoaded) return; const timer = setTimeout(() => draftOperation('put', draft,storageKey).catch(() => setError('Telefon nemá dost místa pro uložení rozpracované výpravy.')), 400); return () => clearTimeout(timer); }, [draft, draftLoaded]);
  useEffect(() => {
    if (editing) return;
    const target = draft.stations.length < 50 ? addButton.current : summaryPanel.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center' });
  }, [editing]);
  function openStation(index) {
    if (photoBusy || gpsBusy || stationSaving || saving) return;
    setActive(index); setEditing(true); setShowMap(false); setStationError(''); setStationMessage('');
    requestAnimationFrame(() => { stationPanel.current?.scrollIntoView({ block: 'start' }); stationPanel.current?.focus({ preventScroll: true }); });
  }
  function addStation() {
    if (draft.stations.length >= 50 || stationSaving || saving || photoBusy) return;
    const index = draft.stations.length;
    setDraft(d => ({ ...d, stations: [...d.stations, blankStation()] }));
    openStation(index);
  }
  function removeStation(index) {
    if (photoBusy || gpsBusy || stationSaving || saving || !draftLoaded) return;
    const item = draft.stations[index];
    const filled = item.name.trim() || item.lat !== '' || item.lng !== '' || item.question.trim() || item.answer.trim() || item.hints.some(h => h.content?.trim());
    if (filled && !confirm(draft.stations.length === 1 ? 'Vymazat údaje tohoto stanoviště?' : 'Smazat stanoviště „' + (item.name || (index + 1)) + '“?')) return;
    setStationError(''); setError(''); setShowMap(false);
    if (draft.stations.length === 1) {
      setDraft(d => ({ ...d, stations: [blankStation()] })); setActive(0); setEditing(true); setStationMessage('');
      requestAnimationFrame(() => { stationPanel.current?.scrollIntoView({ block: 'start' }); stationPanel.current?.focus({ preventScroll: true }); });
      return;
    }
    setDraft(d => ({ ...d, stations: d.stations.filter((_, i) => i !== index) }));
    setActive(current => current > index ? current - 1 : current === index ? Math.max(0, index - 1) : current);
    setEditing(false);
    setStationMessage('Stanoviště je odstraněné z rozpracované trasy. ' + (initial ? 'Změnu potvrďte tlačítkem Uložit změny.' : 'Můžete přidat další nebo dokončit výpravu.'));
    requestAnimationFrame(() => { addButton.current?.scrollIntoView({ block: 'center' }); addButton.current?.focus({ preventScroll: true }); });
  }
  async function saveStation() {
    if (stationSaving || photoBusy || gpsBusy || saving || !draftLoaded) return;
    setStationSaving(true); setStationError('');
    try {
      validateExpedition({ name: 'Kontrola stanoviště', mode: draft.mode, stations: [draft.stations[active]] });
      let stored = true;
      if (!initial) { try { await draftOperation('put', draft,storageKey); } catch { stored = false; } }
      setStationMessage(!stored ? 'Stanoviště je připravené, ale koncept se nepodařilo uložit do zařízení. Před zavřením stránky dokončete celou výpravu.' : initial ? 'Stanoviště je připravené v rozpracovaných změnách. Na server je uložíte tlačítkem Uložit změny.' : 'Stanoviště je uložené v konceptu v tomto zařízení. Celou výpravu dokončíte tlačítkem Vytvořit výpravu.');
      setShowMap(false); setEditing(false);
    } catch (e) { setStationError(e.message.replace(/stanoviště 1/gi, 'stanoviště ' + (active + 1))); }
    finally { setStationSaving(false); }
  }
  const s = draft.stations[active];
  const change = (fields) => setDraft(d => ({ ...d, stations: d.stations.map((item, i) => i === active ? { ...item, ...fields } : item) }));
  const hintChange = (index, fields) => change({ hints: s.hints.map((h, i) => index === i ? { ...h, ...fields } : h) });
  async function locate() { setGpsBusy(true); setError(''); try { const p = await getStablePosition(); change({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); setShowMap(true); } catch { setError('Polohu se nepodařilo určit. Povolte GPS nebo vyberte bod na mapě.'); } finally { setGpsBusy(false); } }
  async function photo(file) { if (!file) return; setPhotoBusy(true); setError(''); try { const content = await preparePhoto(file); if (content.length > 250000) throw Error('Fotografie je příliš velká. Vyberte menší obrázek.'); change({ hints: [...s.hints, { type: 'photo', content, minutes: 10, photoVersion: 2 }] }); } catch (e) { setError(e.message === 'FILE_TOO_LARGE' ? 'Fotografie musí být menší než 25 MB.' : e.message); } finally { setPhotoBusy(false); } }
  function move(offset) { const target = active + offset; if (target < 0 || target >= draft.stations.length) return; const stations = [...draft.stations]; [stations[active], stations[target]] = [stations[target], stations[active]]; setDraft({ ...draft, stations }); setActive(target); }
  return <div className="p-content p-editor"><button className="p-back" onClick={onBack}><ArrowLeft size={18}/> Zpět</button><div className="p-section-heading"><span className="p-kicker">VYTVÁŘÍTE DOBRODRUŽSTVÍ</span><h1>Každá stopa má svůj příběh.</h1><p>Vyberte místa, vymyslete šifry a schovejte poklad. O zbytek se postará Pátrač.</p></div>
    <div className="p-editor-grid"><aside className="p-panel p-route-list"><label className="p-label">Název výpravy<input value={draft.name} maxLength={100} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Záhada ztracené truhly"/></label>
      <p className="p-note">{isPublic?'Veřejná výprava · 2 místa na účtu · vždy závod na čas':'Soukromá výprava · 3 místa na účtu · připojení přes kód'}</p>
      {isPublic&&<div className="p-public-editor-info"><label className="p-label">Popis pro hráče<textarea rows={4} minLength={10} maxLength={1500} value={draft.publicInfo?.description||''} onChange={e=>setDraft(d=>({...d,publicInfo:{...d.publicInfo,description:e.target.value}}))} placeholder="Co hráče čeká a pro koho je trasa vhodná? Neprozrazujte šifry ani další stanoviště."/></label><label className="p-label">Obtížnost<select value={draft.publicInfo?.difficulty||'easy'} onChange={e=>setDraft(d=>({...d,publicInfo:{...d.publicInfo,difficulty:e.target.value}}))}><option value="easy">Lehká</option><option value="medium">Střední</option><option value="hard">Náročná</option></select></label><p className="p-small">Po vytvoření ji samostatným tlačítkem zveřejníte na mapě. Během aktivního hraní je trasa uzamčená.</p></div>}
      <RouteEstimateFields draft={draft} onChange={fields=>setDraft(d=>({...d,...fields}))}/>
      {!isPublic&&<fieldset><legend>Jak se bude hrát?</legend><label className={'p-mode ' + (draft.mode === 'race' ? 'active' : '')}><input type="radio" checked={draft.mode === 'race'} onChange={() => setDraft({ ...draft, mode: 'race' })}/><div><strong>Závod na čas</strong><small>Nápovědy přidávají minuty k výsledku.</small></div></label><label className={'p-mode ' + (draft.mode === 'treasure' ? 'active' : '')}><input type="radio" checked={draft.mode === 'treasure'} onChange={() => setDraft({ ...draft, mode: 'treasure' })}/><div><strong>Hon za pokladem</strong><small>Bez nápověd. První nález vyhrává.</small></div></label></fieldset>}
      <div className="p-list-heading"><strong>Trasa výpravy</strong><span>{draft.stations.length} / 50</span></div><div className="p-station-list">{draft.stations.map((item, i) => <button className={'p-station-link ' + (active === i ? 'active' : '')} key={i} disabled={photoBusy || gpsBusy || stationSaving || saving} onClick={() => openStation(i)}><span className="p-station-number">{i + 1}</span><span>{item.name || 'Nové stanoviště'}{i === draft.stations.length - 1 && <small>Poslední stopa</small>}</span></button>)}</div>
      {!editing && <><p className="p-station-saved" role="status">{stationMessage}</p><button ref={addButton} type="button" className="p-primary p-add-next-station" disabled={draft.stations.length >= 50 || saving} onClick={addStation}><Plus size={18}/> Přidat další stanoviště</button>{draft.stations.length >= 50 && <p className="p-small">Máte všech 50 stanovišť. Nyní můžete dokončit výpravu.</p>}</>}</aside>
      <section ref={stationPanel} tabIndex={-1} aria-label={'Úprava stanoviště '+(active+1)} className="p-panel p-station-editor" inert={stationSaving || saving || undefined} hidden={!editing}><div className="p-row p-between"><span className="p-kicker">STANOVIŠTĚ {active + 1}</span><div className="p-row"><button className="p-icon-button" aria-label="Posunout stanoviště výš" disabled={active === 0 || photoBusy || gpsBusy || stationSaving || saving} onClick={() => move(-1)}><ArrowUp size={18}/></button><button className="p-icon-button" aria-label="Posunout stanoviště níž" disabled={active === draft.stations.length - 1 || photoBusy || gpsBusy || stationSaving || saving} onClick={() => move(1)}><ArrowDown size={18}/></button><button className="p-icon-button" aria-label={draft.stations.length === 1 ? 'Vymazat údaje stanoviště' : 'Smazat stanoviště'} disabled={photoBusy || gpsBusy || stationSaving || saving || !draftLoaded} onClick={() => removeStation(active)}><Trash2 size={18}/></button></div></div>
        <label className="p-label">Název místa<input value={s.name} maxLength={100} onChange={e => change({ name: e.target.value })} placeholder="Starý dub"/></label>
        <div className="p-field-grid"><label className="p-label">Zeměpisná šířka (N)<input type="number" step="any" min="-90" max="90" value={s.lat} onChange={e => change({ lat: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="49.300000"/></label><label className="p-label">Zeměpisná délka (E)<input type="number" step="any" min="-180" max="180" value={s.lng} onChange={e => change({ lng: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="17.390000"/></label></div>
        <div className="p-row p-wrap"><button className="p-secondary" onClick={locate} disabled={gpsBusy}><LocateFixed size={18}/>{gpsBusy ? 'Zpřesňuji GPS…' : 'Použít moji polohu'}</button><button className="p-secondary" onClick={() => setShowMap(!showMap)}><Map size={18}/>{showMap ? 'Skrýt mapu' : 'Vybrat na mapě'}</button></div>
        {showMap && <><p className="p-small">Klikněte do mapy nebo přetáhněte zlatý bod.</p><PatracMap key={active} target={s.lat !== '' && s.lng !== '' ? { lat: Number(s.lat), lng: Number(s.lng) } : null} onPick={p => change(p)}/></>}
        <label className="p-label">Vzdálenost pro odemčení hádanky<select value={s.radius} onChange={e => change({ radius: Number(e.target.value) })}><option value={10}>10 metrů · přesné místo</option><option value={25}>25 metrů · doporučeno</option><option value={50}>50 metrů · širší oblast</option><option value={100}>100 metrů · velká oblast</option></select></label>
        <label className="p-label">Hádanka nebo šifra<textarea rows={4} value={s.question} maxLength={5000} onChange={e => change({ question: e.target.value })} placeholder="Na slunci tě provázím, ve tmě zmizím. Co jsem?"/></label>
        <label className="p-label">Správná odpověď<textarea rows={2} value={s.answer} maxLength={1000} onChange={e => change({ answer: e.target.value })} placeholder="stín"/><small>Více uznávaných odpovědí napište na samostatné řádky. Velikost písmen a diakritika nerozhodují.</small></label>
        {!isPublic && active === draft.stations.length - 1 && <div className="p-note"><Flag size={20}/><span>Poslední stanoviště je cíl. Pro skutečný poklad zadejte jako odpověď tajný kód schovaný uvnitř truhly a v zadání požádejte hráče o jeho opsání.</span></div>}
        {draft.mode === 'race' && <label className="p-label">Zobrazení řešení<select value={s.solutionMinutes ?? 30} onChange={e => change({ solutionMinutes: Number(e.target.value) })}>{PENALTY_OPTIONS.map(m => <option key={m} value={m}>+{m} minut</option>)}</select><small>Hráči se po potvrzení zobrazí první správná odpověď. Penalizace se přičte jen jednou, navíc k použitým nápovědám.</small></label>}
        <div className="p-list-heading"><h2>Nápovědy</h2><span>{s.hints.length} / 5</span></div>{draft.mode === 'treasure' ? <p className="p-small">V honu za pokladem se nápovědy hráčům nezobrazují.</p> : <><p className="p-small">Jsou bez platby. Před otevřením hráči uvidí časovou penalizaci.</p>{s.hints.map((h, i) => <div className="p-hint-editor" key={i}><div className="p-row p-between"><strong>{h.type === 'photo' ? 'Fotografická' : 'Textová'} nápověda</strong><button className="p-icon-button" aria-label="Odebrat nápovědu" onClick={() => change({ hints: s.hints.filter((_, hi) => hi !== i) })}><Trash2 size={16}/></button></div>{h.type === 'text' ? <textarea rows={2} aria-label="Text nápovědy" value={h.content} onChange={e => hintChange(i, { content: e.target.value })}/> : <img className="p-hint-photo" src={h.content} alt="Fotografická nápověda"/>}<label className="p-label">Penalizace v minutách<select value={h.minutes} onChange={e => hintChange(i, { minutes: Number(e.target.value) })}>{!PENALTY_OPTIONS.includes(Number(h.minutes)) && <option value={h.minutes}>{h.minutes} min (původní nastavení)</option>}{PENALTY_OPTIONS.map(m => <option key={m} value={m}>{m} minut</option>)}</select></label></div>)}<div className="p-row p-wrap"><button className="p-secondary" disabled={s.hints.length >= 5} onClick={() => change({ hints: [...s.hints, { type: 'text', content: '', minutes: 10 }] })}><Plus size={18}/> Textová nápověda</button><label className={'p-secondary p-upload ' + (s.hints.length >= 5 || photoBusy ? 'disabled' : '')}><Camera size={18}/>{photoBusy ? 'Zpracovávám…' : 'Přidat fotografii'}<input type="file" accept="image/*" disabled={s.hints.length >= 5 || photoBusy} onChange={e => { photo(e.target.files[0]); e.target.value = ''; }}/></label></div></>}
        <div className="p-station-save">
          {stationError && <p className="p-alert" role="alert">{stationError}</p>}
          <button type="button" className="p-primary" disabled={stationSaving || saving || photoBusy || gpsBusy || !draftLoaded} onClick={saveStation}><Save size={18}/>{stationSaving ? 'Ukládám stanoviště…' : 'Uložit stanoviště'}</button><button type="button" className="p-secondary p-delete-station" disabled={stationSaving || saving || photoBusy || gpsBusy || !draftLoaded} onClick={() => removeStation(active)}><Trash2 size={18}/>{draft.stations.length === 1 ? 'Vymazat údaje stanoviště' : 'Smazat stanoviště'}</button>
          <p className="p-small">{initial ? 'Připraví stanoviště do rozpracovaných změn. Celou výpravu pak uložte dole.' : 'Uloží stanoviště do konceptu. Potom můžete přidat další nebo dokončit výpravu.'}</p>
        </div>
      </section>
      {!editing && <section ref={summaryPanel} tabIndex={-1} className="p-panel p-station-ready" aria-label="Stanoviště připraveno"><Flag size={30}/><h2>Trasa výpravy</h2><p>{s.name}</p><p className="p-small">Přidejte další stanoviště, vyberte některé z trasy k úpravě nebo dokončete celou výpravu.</p><button type="button" className="p-secondary" onClick={() => openStation(active)}>Upravit toto stanoviště</button><button type="button" className="p-secondary p-delete-station" disabled={saving} onClick={() => removeStation(active)}><Trash2 size={18}/>{draft.stations.length === 1 ? 'Vymazat údaje stanoviště' : 'Smazat toto stanoviště'}</button></section>}
      </div>
    {error && <div className="p-alert" role="alert">{error}</div>}<div className="p-editor-footer"><span className="p-small">{initial ? 'Připravené změny celé výpravy uložíte tímto tlačítkem.' : 'Koncept zůstává v tomto zařízení. Tímto tlačítkem vytvoříte celou výpravu.'}</span><button className="p-primary" disabled={saving || photoBusy || gpsBusy || stationSaving || !draftLoaded} onClick={async () => { setError(''); setPhotoBusy(true); try { await onSave(await optimizeDraftPhotos(draft)); } catch (e) { setError(e.message); } finally { setPhotoBusy(false); } }}><Save size={18}/>{saving ? 'Ukládám…' : photoBusy ? 'Připravuji fotografie…' : initial ? 'Uložit změny' : 'Vytvořit výpravu'}</button></div>
  </div>;
}
