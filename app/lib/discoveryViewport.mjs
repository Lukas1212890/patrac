// Cover the same discovery area on narrow phones and desktop screens.
export const DISCOVERY_BOUNDS=[[12,48],[19,52]];
export function prepareDiscoveryViewport(map,node,{onViewport,onReady,onContextLost},win=window,Observer=ResizeObserver){
 let active=true;
 const update=()=>{if(!active)return;const b=map.getBounds();onViewport([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);};
 const resize=()=>{if(!active||node.clientWidth<=0||node.clientHeight<=0)return;map.resize();update();};
 const lost=()=>{if(active)onContextLost();};
 map.on('moveend',update);map.on('resize',update);map.on('webglcontextlost',lost);
 map.fitBounds(DISCOVERY_BOUNDS,{padding:{top:72,bottom:90,left:24,right:24},maxZoom:6,duration:0});
 // DOM markers need the map transform, not loaded raster tiles or the `load` event.
 onReady();update();
 const observer=new Observer(resize);observer.observe(node);
 win.addEventListener('pageshow',resize);win.addEventListener('focus',resize);
 return()=>{active=false;observer.disconnect();win.removeEventListener('pageshow',resize);win.removeEventListener('focus',resize);map.off('moveend',update);map.off('resize',update);map.off('webglcontextlost',lost);};
}
