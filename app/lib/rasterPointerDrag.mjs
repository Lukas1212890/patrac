import {project,unproject} from './mapProjection.mjs';
const rounded=p=>({lat:+p.lat.toFixed(6),lng:+p.lng.toFixed(6)});
// Snapshot projection at pointer-down so rendering during a drag cannot shift its origin.
export function rasterPointerHandlers({drag,view,onPick,onPreview,onPan,bounds}){
 const release=e=>{if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
 const at=(start,e)=>unproject(start.pixel.x+e.clientX-start.x,start.pixel.y+e.clientY-start.y,start.zoom);
 return {
  onPointerDown(e){
   if(view.navigation||drag.current||e.isPrimary===false||(e.button!==undefined&&e.button!==0)||e.target.closest('button,a'))return;
   const marker=!!onPick&&!!view.target&&!!e.target.closest('[data-patrac-draggable-marker]');
   drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,zoom:view.zoom,center:view.center,origin:view.origin,marker,pixel:marker?project(view.target,view.zoom):null,moved:false};
   e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
  },
  onPointerMove(e){
   const start=drag.current;if(!start||start.id!==e.pointerId)return;
   if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)start.moved=true;
   if(start.marker&&start.moved)onPreview(at(start,e));
  },
  onPointerUp(e){
   const start=drag.current;if(!start||start.id!==e.pointerId)return;
   drag.current=null;release(e);onPreview(null);
   const dx=e.clientX-start.x,dy=e.clientY-start.y,moved=start.moved||Math.hypot(dx,dy)>6;
   if(start.marker){if(moved)onPick?.(rounded(at(start,e)));return;}
   if(moved)onPan(unproject(start.center.x-dx,start.center.y-dy,start.zoom));
   else if(onPick){const rect=bounds();onPick(rounded(unproject(start.origin.x+e.clientX-rect.left,start.origin.y+e.clientY-rect.top,start.zoom)));}
  },
  onPointerCancel(e){if(drag.current?.id!==e.pointerId)return;drag.current=null;release(e);onPreview(null);},
  onLostPointerCapture(e){if(drag.current?.id!==e.pointerId)return;drag.current=null;onPreview(null);}
 };
}
