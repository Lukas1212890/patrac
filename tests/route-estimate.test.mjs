import test from 'node:test';
import assert from 'node:assert/strict';
import {routeEstimate,routeInfoFor,formatRouteDistance} from '../shared/routeEstimate.mjs';
import {validatedRouteInfo} from '../worker/lib/routeInfo.mjs';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const a={lat:0,lng:0},b={lat:0,lng:0.01},c={lat:0.01,lng:0.01};
test('route sums consecutive straight-line legs, excludes approach and rounds walking plus riddles up to five minutes',()=>{
 assert.equal(routeEstimate([a]).distanceMeters,0);assert.equal(routeEstimate([a]).autoEstimatedMinutes,5);
 const route=routeEstimate([a,b,c]);assert.ok(Math.abs(route.distanceMeters-2224)<=1);assert.equal(route.autoEstimatedMinutes,50);
 assert.equal(routeEstimate([a,c,b]).distanceMeters>route.distanceMeters,true);
 assert.equal(routeEstimate([a,a]).distanceMeters,0);assert.equal(routeEstimate([a,a]).autoEstimatedMinutes,10);
 assert.equal(routeEstimate([{lat:0,lng:179.99},{lat:0,lng:-179.99}]).distanceMeters,2224);
 for(const stations of [[],[a,{lat:'',lng:0}],[a,{lat:' ',lng:0}],[a,{lat:true,lng:0}],[a,{lat:91,lng:0}],[a,{lat:0,lng:NaN}]])assert.equal(routeEstimate(stations),null);
});
test('manual times persist across route edits, automatic mode recalculates, and forged distances/sources are ignored',()=>{
 const draft={stations:[a,b],timeEstimateOverride:null,routeInfo:{distanceKm:999,timeEstimateSource:'author'},publicInfo:{distanceKm:999,estimatedMinutes:999}};
 const auto=validatedRouteInfo(draft,draft.stations);assert.equal(auto.routeInfo.distanceKm,1.112);assert.equal(auto.routeInfo.timeEstimateSource,'automatic');assert.equal(auto.routeInfo.estimatedMinutes,30);
 const manual=validatedRouteInfo({...draft,timeEstimateOverride:75},[a,b,c]);assert.equal(manual.routeInfo.estimatedMinutes,75);assert.equal(manual.routeInfo.timeEstimateSource,'author');
 assert.equal(routeInfoFor({stations:[a,b,c],timeEstimateOverride:null}).estimatedMinutes,50);
 assert.equal(routeInfoFor({stations:[a,b],publicInfo:{estimatedMinutes:65}}).timeEstimateSource,'author');
 for(const v of ['',true,0,4,10.5,1441,'bad'])assert.throws(()=>validatedRouteInfo({...draft,timeEstimateOverride:v},draft.stations));
 assert.equal(formatRouteDistance(routeEstimate([a])),'0 m');
});
test('editor and player explanations distinguish automatic straight-line calculation from the author estimate',async()=>{
 const built=await build({stdin:{contents:"export {default as Fields} from './RouteEstimateFields.jsx';export {default as Note} from './RouteEstimateNote.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const draft={stations:[a,b],timeEstimateOverride:null};const auto=renderToStaticMarkup(createElement(mod.exports.Fields,{draft,onChange(){}}));assert.ok(auto.includes('vzdušnou čarou'));assert.ok(auto.includes('4 km/h'));assert.ok(auto.includes('30'));assert.equal(auto.includes('checked=""'),false);
 const manual=renderToStaticMarkup(createElement(mod.exports.Fields,{draft:{...draft,timeEstimateOverride:75},onChange(){}}));assert.ok(manual.includes('Časový odhad podle správce.'));assert.ok(manual.includes('checked=""'));assert.ok(manual.includes('value="75"'));
 const incomplete=renderToStaticMarkup(createElement(mod.exports.Fields,{draft:{stations:[{lat:'',lng:''}],timeEstimateOverride:null},onChange(){}}));assert.ok(incomplete.includes('doplňte souřadnice'));assert.equal(incomplete.includes('NaN'),false);
});
