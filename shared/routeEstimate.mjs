export const WALKING_KMH=4;
export const RIDDLE_MINUTES=5;
export function routeEstimate(stations){
 if(!Array.isArray(stations)||!stations.length)return null;
 const coordinate=(v,max)=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=max;
 const valid=s=>s&&coordinate(s.lat,90)&&coordinate(s.lng,180);
 if(!stations.every(valid))return null;
 const rad=v=>v*Math.PI/180;let meters=0;
 for(let i=1;i<stations.length;i++){
  const a=stations[i-1],b=stations[i],h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  meters+=6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
 }
 return{distanceMeters:Math.round(meters),distanceKm:Math.round(meters)/1000,autoEstimatedMinutes:Math.ceil((meters/1000/WALKING_KMH*60+stations.length*RIDDLE_MINUTES)/5)*5};
}
export function timeOverride(game){
 // Existing author-entered times remain manual until the author selects automatic calculation.
 return Object.hasOwn(game,'timeEstimateOverride')?game.timeEstimateOverride:game.publicInfo?.estimatedMinutes??null;
}
export function routeInfoFor(game){
 const estimate=routeEstimate(game.stations);if(!estimate)return null;
 const override=timeOverride(game),manual=override!==null&&override!==''&&Number.isInteger(Number(override))&&Number(override)>=5&&Number(override)<=1440;
 return{...estimate,estimatedMinutes:manual?Number(override):estimate.autoEstimatedMinutes,timeEstimateSource:manual?'author':'automatic',distanceSource:'straight-line'};
}
export const formatRouteDistance=info=>info.distanceMeters<1000?info.distanceMeters.toLocaleString('cs-CZ')+' m':info.distanceKm.toLocaleString('cs-CZ',{maximumFractionDigits:2})+' km';
