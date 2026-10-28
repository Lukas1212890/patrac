'use client';
import {routeInfoFor,timeOverride,formatRouteDistance} from '../../shared/routeEstimate.mjs';
import RouteEstimateNote from './RouteEstimateNote';
export default function RouteEstimateFields({draft,onChange}){
 const info=routeInfoFor(draft),override=timeOverride(draft),manual=override!==null;
 return <section className="p-route-estimate-fields" aria-label="Délka a čas výpravy"><h3>Délka a čas výpravy</h3><p className="p-small">Odhad hraní může být nejvýše 24 hodin. Nedokončený pokus se po 48 hodinách od startu automaticky ukončí.</p>{info?.estimatedMinutes>1440&&<p className="p-alert" role="alert">Odhad překračuje 24 hodin. Před uložením zkraťte trasu nebo upravte odhad správce.</p>}
 {info?<><p><strong>{formatRouteDistance(info)} vzdušnou čarou</strong><br/>Odhad přibližně <strong>{info.estimatedMinutes} min</strong></p><RouteEstimateNote info={info}/></>:<p className="p-small">Pro výpočet délky a času doplňte souřadnice všech stanovišť.</p>}
 <label className="p-route-manual"><input type="checkbox" checked={manual} onChange={e=>onChange({timeEstimateOverride:e.target.checked?(info?.autoEstimatedMinutes||30):null})}/> Použít vlastní časový odhad správce</label>
 {manual&&<label className="p-label">Časový odhad podle správce (minuty)<input type="number" required min={5} max={1440} step={1} value={override} onChange={e=>onChange({timeEstimateOverride:e.target.value})}/><small>Ruční odhad se při úpravách trasy nemění. Pro automatický výpočet zrušte zaškrtnutí.</small></label>}
 </section>;
}
