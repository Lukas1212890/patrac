import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createStopikTracker, smoothPosition } from '../app/lib/stopikGps.mjs';
import { distanceTo, autoFitNavMap } from '../app/lib/navigationMath.js';
import { getBaseMapConfig, getNavigationZoom, createTargetZone } from '../app/lib/mapConfig.js';

function mountMap(overrides = {}) {
  const effects = [], maps = [], markers = [], frames = [], ref = { current: null };
  class Map {
    constructor(options) { this.options = options; this.sources = {}; this.layers = []; this.handlers = {}; maps.push(this); }
    on(name, fn) { this.handlers[name] = fn; }
    addControl() {}
    resize() { this.resized = true; }
    addSource(name, source) { this.sources[name] = { ...source, setData(data) { this.data = data; } }; }
    addLayer(layer) { this.layers.push(layer); }
    getSource(name) { return this.sources[name]; }
    getBearing() { return this.options.bearing; }
    fitBounds(bounds, options) { this.fit = { bounds, options }; }
    setBearing(angle) { this.angle = angle; }
    loaded() { return true; }
    remove() { this.removed = true; }
  }
  class Marker {
    constructor(options) { this.options = options; markers.push(this); }
    setLngLat(coords) { this.coords = coords; return this; }
    addTo(map) { this.map = map; return this; }
  }
  const window = {};
  const context = { useEffect: fn => effects.push(fn), useRef: () => ref, window,
    document: { getElementById: () => ({}), createElement: () => ({}) },
    loadMap: async () => ({ Map, Marker, AttributionControl: class {} }),
    distanceTo, autoFitNavMap, getBaseMapConfig, getNavigationZoom, createTargetZone,
    setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {},
  };
  const source = readFileSync(new URL('../app/components/useStopikMap.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace('export default function', 'function');
  vm.runInNewContext(source + '\nthis.run = useStopikMap;', context);
  const props = { compass: true, navView: 'map', active: { stops: [{ lat: 49.3, lng: 17.39 }] }, currentIndex: 0,
    compassPos: { lat: 49.29925, lng: 17.389 }, heading: 42, mapFull: false, baseMap: 'map', setCompassError: error => { throw Error(error); }, ...overrides };
  context.run(props);
  return { effects, maps, markers, frames, context, props, ref };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('Stopík navigation draws the blue direct line, orange search area and blue player dot', async () => {
  const h = mountMap(), cleanup = h.effects[0](); await new Promise(setImmediate);
  const map = h.maps[0]; map.handlers.load();
  assert.equal(map.options.interactive, false);
  for (const name of ['dragPan','dragRotate','scrollZoom','touchZoomRotate','doubleClickZoom']) assert.equal(map.options[name], false);
  assert.equal(map.options.bearing, 42);
  assert.equal(map.layers.find(l => l.id === 'route').paint['line-color'], '#1687ff');
  assert.equal(map.layers.find(l => l.id === 'route').paint['line-width'], 6);
  assert.deepEqual(plain(map.sources.route.data.geometry.coordinates), [[17.389,49.29925],[17.39,49.3]]);
  assert.equal(map.sources['target-zone'].data.geometry.coordinates[0].length, 65);
  assert.equal(map.layers.find(l => l.id === 'target-zone-fill').paint['fill-color'], '#ff9f0a');
  assert.equal(h.markers[0].options.element.className, 'p-stopik-user-dot');
  assert.deepEqual(plain(h.markers[0].coords), [17.389,49.29925]);
  assert.ok(map.fit.options.maxZoom <= getBaseMapConfig('map').maxzoom);
  cleanup(); assert.equal(map.removed, true); assert.equal(h.context.window.__patracNavigationMap, null);
});

test('GPS received during map loading still draws player and line on first map load', async () => {
  const h = mountMap({ compassPos: null }); h.effects[0](); await new Promise(setImmediate);
  h.ref.current = { compassPos: { lat:49.299, lng:17.388 }, heading:20 };
  const map = h.maps[0]; map.handlers.load();
  assert.equal(h.markers.length, 1);
  assert.deepEqual(plain(map.sources.route.data.geometry.coordinates), [[17.388,49.299],[17.39,49.3]]);
});

test('fullscreen keeps both points visible and aerial zoom respects available imagery', async () => {
  const h = mountMap({ mapFull: true, baseMap: 'aerial' }); h.effects[0](); await new Promise(setImmediate);
  const map = h.maps[0]; map.handlers.load();
  assert.deepEqual(plain(map.fit.options.padding), { top:90, bottom:90, left:70, right:70 });
  assert.ok(map.fit.options.maxZoom <= 18);
  assert.equal(map.options.style.sources.base.maxzoom, 18);
});

test('phone orientation rotates the actual map', async () => {
  const h = mountMap(); h.effects[0](); await new Promise(setImmediate);
  h.effects[2](); h.frames[0](); assert.equal(h.maps[0].angle, 42);
});

test('GPS weighting matches Stopař and ignores unusable fixes', () => {
  const tracker = createStopikTracker();
  assert.equal(tracker.push({lat:49.3,lng:17.39,acc:121}),null);
  assert.equal(tracker.push({lat:NaN,lng:17.39,acc:5}),null);
  const a={lat:49.3,lng:17.39,acc:5,timestamp:100}, b={lat:49.30001,lng:17.39001,acc:10,timestamp:200};
  tracker.push(a);const value=tracker.push(b);
  assert.ok(Math.abs(value.lat - (a.lat * 4 + b.lat) / 5) < 1e-10);
  assert.equal(value.acc,5);assert.equal(value.sampleCount,2);assert.equal(value.stabilizing,false);
  assert.equal(value.arrivalFix.acc,10);assert.equal(value.timestamp,200);
});

test('navigation uses best five of eight samples and rejects poor-location jumps', () => {
  const samples=Array.from({length:8},(_,i)=>({lat:49.3+i/10000000,lng:17.39,acc:30+i,timestamp:i}));
  assert.equal(smoothPosition(samples).sampleCount,5);
  const tracker=createStopikTracker(); tracker.push({lat:49.3,lng:17.39,acc:30});
  // Flush the previous location with a far-away inaccurate cluster: the jump is not published.
  let result;for(let i=0;i<8;i++) result=tracker.push({lat:49.31,lng:17.4,acc:40});
  assert.equal(result,null);
});

test('raster projection round trips GPS and keeps the route midpoint between player and target',async()=>{
 const {project,unproject}=await import('../app/lib/mapProjection.mjs');
 for(const point of [{lat:49.3,lng:17.39},{lat:50.08,lng:14.42},{lat:-33.86,lng:151.2},{lat:40.7,lng:-74}]) {
  const pixel=project(point,17), restored=unproject(pixel.x,pixel.y,17);
  assert.ok(Math.abs(restored.lat-point.lat)<1e-9);
  assert.ok(Math.abs(restored.lng-point.lng)<1e-9);
 }
 const a=project({lat:49.29925,lng:17.389},17),b=project({lat:49.3,lng:17.39},17);
 const middle=unproject((a.x+b.x)/2,(a.y+b.y)/2,17);
 assert.ok(middle.lng>17.389&&middle.lng<17.39);
 const center=project(middle,17);
 assert.ok(Math.abs((a.x+b.x)/2-center.x)<1e-6);
});
