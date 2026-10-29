import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDiscoveryViewport,DISCOVERY_BOUNDS} from '../app/lib/discoveryViewport.mjs';
import {project,unproject} from '../app/lib/mapProjection.mjs';
function fixture(width=360){
 const listeners=new Map(),events=[],win=new EventTarget(),node={clientWidth:width,clientHeight:520};let observer;
 class Observer{constructor(fn){this.callback=fn;observer=this;}observe(n){assert.equal(n,node);}disconnect(){this.disconnected=true;}}
 const map={on(event,fn){listeners.set(event,fn);},off(event,fn){if(listeners.get(event)===fn)listeners.delete(event);},fitBounds(bounds,options){this.fit={bounds,options};},resize(){events.push('resize');listeners.get('resize')?.();},getBounds(){return{getWest:()=>12,getSouth:()=>48,getEast:()=>19,getNorth:()=>52};}};
 const stop=prepareDiscoveryViewport(map,node,{onViewport:b=>events.push(b),onReady:()=>events.push('ready'),onContextLost:()=>events.push('fallback')},win,Observer);
 return{map,events,listeners,win,node,stop,get observer(){return observer;}};
}
test('old fixed zoom excludes western Czech starts on a 360px phone; discovery fits the full region',()=>{
 // MapLibre world size uses 512px tiles, equivalent to one zoom level higher here.
 const center=project({lat:49.8,lng:15.5},7),west=unproject(center.x-180,center.y,7).lng;
 assert.ok(west>13.38,'Plzeň falls outside the old initial phone view');
 for(const width of [320,360,393,768,1200]){
  const f=fixture(width);assert.deepEqual(f.map.fit.bounds,DISCOVERY_BOUNDS);assert.ok(DISCOVERY_BOUNDS[0][0]<13.38);assert.ok(DISCOVERY_BOUNDS[1][0]>18.3);assert.equal(f.map.fit.options.duration,0);f.stop();
 }
});
test('markers become ready without raster load; PWA restoration and element resizing update the viewport',()=>{
 const f=fixture();assert.ok(f.events.includes('ready'));assert.equal(f.listeners.has('load'),false);
 f.win.dispatchEvent(new Event('pageshow'));f.win.dispatchEvent(new Event('focus'));f.observer.callback();assert.equal(f.events.filter(v=>v==='resize').length,3);
 f.listeners.get('webglcontextlost')();assert.ok(f.events.includes('fallback'));
 f.stop();const count=f.events.length;f.win.dispatchEvent(new Event('pageshow'));f.observer.callback();assert.equal(f.events.length,count);assert.equal(f.observer.disconnected,true);assert.equal(f.listeners.size,0);
});
