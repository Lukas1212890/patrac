import test from 'node:test';
import assert from 'node:assert/strict';
import {installPwaZoomLock} from '../app/lib/pwaZoomLock.mjs';
function environment(ios=false,standalone=false){
 const attributes=new Map(),listeners=new Map(),mode={matches:standalone,addEventListener(_,f){this.change=f;},removeEventListener(){this.change=null;}};
 return{attributes,listeners,mode,navigator:{standalone:ios},matchMedia:q=>q.includes('standalone')?mode:{matches:false},document:{documentElement:{setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)},addEventListener:(k,fn,options)=>listeners.set(k,{fn,options}),removeEventListener:k=>listeners.delete(k)}};
}
const point=map=>({target:{closest:selector=>{assert.equal(selector,'[data-patrac-map-gestures]');return map;}}});
function prevented(scope,type,touches,cancelable=true){let blocked=false;scope.listeners.get(type).fn({touches,cancelable,preventDefault(){blocked=true;}});return blocked;}
test('PWA blocks native page pinch outside maps but allows one-finger scrolling and map touch events',()=>{
 for(const scope of [environment(true),environment(false,true)]){
  const clean=installPwaZoomLock(scope),map={};assert.equal(scope.attributes.has('data-patrac-zoom-locked'),true);
  for(const type of ['touchstart','touchmove']){
   assert.equal(scope.listeners.get(type).options.passive,false);
   assert.equal(prevented(scope,type,[point(null),point(null)]),true);
   assert.equal(prevented(scope,type,[point(map),point(null)]),true);
   assert.equal(prevented(scope,type,[point(map),point({})]),true);
   assert.equal(prevented(scope,type,[point(map),point(map)]),false);
   assert.equal(prevented(scope,type,[point(null)]),false);
   assert.equal(prevented(scope,type,[point(null),point(null)],false),false);
  }
  for(const type of ['gesturestart','gesturechange','gestureend'])assert.equal(prevented(scope,type,[]),true);
  clean();assert.equal(scope.listeners.size,0);assert.equal(scope.attributes.size,0);
 }
});
test('browser zoom stays native and lock follows display mode changes',()=>{
 const scope=environment(),clean=installPwaZoomLock(scope);assert.equal(scope.listeners.size,0);
 scope.mode.matches=true;scope.mode.change();assert.ok(scope.listeners.has('touchmove'));
 scope.mode.matches=false;scope.mode.change();assert.equal(scope.listeners.size,0);
 clean();assert.equal(scope.mode.change,null);
});
