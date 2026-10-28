// Map libraries own their touch gestures; native page zoom is disabled only in PWA mode.
export function installPwaZoomLock(scope) {
 const standalone=scope.matchMedia?.('(display-mode: standalone)'),fullscreen=scope.matchMedia?.('(display-mode: fullscreen)');
 const doc=scope.document,options={passive:false,capture:true};
 let active=false;
 const nativeGesture=event=>{if(event.cancelable)event.preventDefault();};
 function touch(event){
  if(!event.cancelable||event.touches.length<2)return;
  const targets=Array.from(event.touches,t=>t.target?.closest?.('[data-patrac-map-gestures]'));
  // Both touches must belong to the same actual map, not a scrollable list or dialog.
  if(!targets[0]||!targets.every(target=>target===targets[0]))event.preventDefault();
 }
 function enable(){
  if(active)return;active=true;doc.documentElement.setAttribute('data-patrac-zoom-locked','');
  for(const type of ['touchstart','touchmove'])doc.addEventListener(type,touch,options);
  for(const type of ['gesturestart','gesturechange','gestureend'])doc.addEventListener(type,nativeGesture,options);
 }
 function disable(){
  if(!active)return;active=false;doc.documentElement.removeAttribute('data-patrac-zoom-locked');
  for(const type of ['touchstart','touchmove'])doc.removeEventListener(type,touch,options);
  for(const type of ['gesturestart','gesturechange','gestureend'])doc.removeEventListener(type,nativeGesture,options);
 }
 const update=()=>{if(scope.navigator?.standalone===true||standalone?.matches||fullscreen?.matches)enable();else disable();};
 update();standalone?.addEventListener?.('change',update);fullscreen?.addEventListener?.('change',update);
 return()=>{disable();standalone?.removeEventListener?.('change',update);fullscreen?.removeEventListener?.('change',update);};
}
