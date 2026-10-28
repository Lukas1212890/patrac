import test from 'node:test';
import assert from 'node:assert/strict';
import { installHomeGestureLock } from '../app/lib/homeGestureLock.mjs';
function environment({ ios = false, standalone = false } = {}) {
  const attributes = new Map(), listeners = new Map();
  return { attributes, listeners, navigator: { standalone: ios }, matchMedia: q => ({ matches: standalone && q.includes('standalone') }), document: { documentElement: { setAttribute: (k,v) => attributes.set(k,v), removeAttribute: k => attributes.delete(k) }, addEventListener: (k,fn,options) => listeners.set(k,{fn,options}), removeEventListener: k => listeners.delete(k) } };
}
test('normal browser retains native refresh gestures', () => {
  const scope = environment(); const cleanup = installHomeGestureLock(scope);
  assert.equal(scope.listeners.size,0); assert.equal(scope.attributes.size,0); cleanup();
});
for (const mode of [{ios:true}, {standalone:true}]) test(`installed home prevents background dragging and releases lock when leaving (${JSON.stringify(mode)})`, () => {
  const scope = environment(mode); const cleanup = installHomeGestureLock(scope);
  const {fn,options} = scope.listeners.get('touchmove'); assert.equal(options.passive,false);
  let prevented = false; fn({cancelable:true,touches:[{}],target:{closest:()=>null},preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true); assert.equal(scope.attributes.has('data-patrac-home-locked'),true);
  cleanup(); assert.equal(scope.listeners.size,0); assert.equal(scope.attributes.size,0);
});
test('dialog scrolling and pinch zoom remain usable in installed mode', () => {
  const scope = environment({ios:true}); const cleanup = installHomeGestureLock(scope);
  const {fn} = scope.listeners.get('touchmove');
  for (const event of [{touches:[{}],target:{closest:()=>({})}},{touches:[{},{}],target:{closest:()=>null}}]) fn({...event,cancelable:true,preventDefault:()=>assert.fail('gesture must be allowed')});
  cleanup();
});
