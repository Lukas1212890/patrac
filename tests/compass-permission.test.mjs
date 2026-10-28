import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCompassAccess} from '../app/lib/compassPermission.mjs';
test('iPhone permission request runs synchronously in the tap, without opening navigation or waiting for GPS',async()=>{
 let calls=0; const promise=requestCompassAccess({DeviceOrientationEvent:{requestPermission(){calls++;return Promise.resolve('granted');}}});
 assert.equal(calls,1); assert.equal(await promise,'granted');
});
test('denials and rejected requests are handled without breaking the game',async()=>{
 assert.equal(await requestCompassAccess({DeviceOrientationEvent:{requestPermission:()=>Promise.resolve('denied')}}),'denied');
 assert.equal(await requestCompassAccess({DeviceOrientationEvent:{requestPermission:()=>Promise.reject(Error())}}),'denied');
 assert.equal(await requestCompassAccess({DeviceOrientationEvent:{requestPermission:()=>{throw Error();}}}),'denied');
});
test('browsers without a permission prompt can start listening directly',async()=>{
 assert.equal(await requestCompassAccess({DeviceOrientationEvent:function(){}}),'granted');
 assert.equal(await requestCompassAccess({}),'unsupported');
});
