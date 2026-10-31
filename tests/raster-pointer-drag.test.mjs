import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterPointerHandlers} from '../app/lib/rasterPointerDrag.mjs';
import {project,unproject} from '../app/lib/mapProjection.mjs';
function fixture(){
 const drag={current:null},picks=[],previews=[],pans=[],target={lat:49.8,lng:15.5},zoom=16,center=project(target,zoom),origin={x:center.x-250,y:center.y-160},captured=new Set();
 const element={setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
 const handlers=rasterPointerHandlers({drag,view:{target,zoom,center,origin},onPick:p=>picks.push(p),onPreview:p=>previews.push(p),onPan:p=>pans.push(p),bounds:()=>({left:20,top:40})});
 const event=(x,y,{marker=false,id=1,...extra}={})=>({clientX:x,clientY:y,pointerId:id,button:0,isPrimary:true,currentTarget:element,target:{closest:s=>s==='[data-patrac-draggable-marker]'&&marker?{}:null},preventDefault(){},...extra});
 return {handlers,event,picks,previews,pans,captured,drag,center,zoom};
}
test('touch or mouse drags the marker continuously and commits exact coordinates only on release',()=>{
 for(const pointerType of ['touch','mouse','pen']){
  const f=fixture(),down=f.event(270,200,{marker:true,pointerType});f.handlers.onPointerDown(down);assert.ok(f.captured.has(1));
  f.handlers.onPointerMove(f.event(310,230,{pointerType}));assert.equal(f.picks.length,0);assert.equal(f.previews.length,1);assert.equal(f.pans.length,0);
  f.handlers.onPointerUp(f.event(310,230,{pointerType}));const expected=unproject(f.center.x+40,f.center.y+30,f.zoom);
  assert.deepEqual(f.picks,[{lat:+expected.lat.toFixed(6),lng:+expected.lng.toFixed(6)}]);assert.equal(f.previews.at(-1),null);assert.equal(f.captured.size,0);
 }
});
test('map pan and tap retain their separate behavior; tapping marker does not offset its center',()=>{
 const f=fixture();f.handlers.onPointerDown(f.event(270,200));f.handlers.onPointerUp(f.event(300,220));assert.equal(f.pans.length,1);assert.equal(f.picks.length,0);
 f.handlers.onPointerDown(f.event(270,200));f.handlers.onPointerUp(f.event(270,200));assert.deepEqual(f.picks,[{lat:49.8,lng:15.5}]);
 f.handlers.onPointerDown(f.event(275,205,{marker:true}));f.handlers.onPointerUp(f.event(275,205));assert.equal(f.picks.length,1);
});
test('cancelled gestures and other fingers cannot save a station or take over an active drag',()=>{
 const f=fixture();f.handlers.onPointerDown(f.event(270,200,{marker:true}));f.handlers.onPointerDown(f.event(10,10,{id:2,isPrimary:false}));f.handlers.onPointerUp(f.event(80,80,{id:2}));assert.equal(f.picks.length,0);assert.equal(f.drag.current.id,1);
 f.handlers.onPointerMove(f.event(310,230));f.handlers.onPointerCancel(f.event(310,230));f.handlers.onPointerUp(f.event(310,230));assert.equal(f.picks.length,0);assert.equal(f.previews.at(-1),null);assert.equal(f.drag.current,null);
 f.handlers.onPointerDown(f.event(270,200,{marker:true}));f.handlers.onLostPointerCapture(f.event(310,230));assert.equal(f.drag.current,null);assert.equal(f.picks.length,0);
});
