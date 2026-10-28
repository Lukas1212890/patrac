import test from 'node:test';
import assert from 'node:assert/strict';
import { compassTarget, nearestAngle } from '../app/lib/compassTarget.mjs';
const origin={lat:0,lng:0};
test('destination icon marks north, east, south and west around the rim',()=>{
 for(const [target,x,y] of [[{lat:1,lng:0},50,7],[{lat:0,lng:1},93,50],[{lat:-1,lng:0},50,93],[{lat:0,lng:-1},7,50]]){
  const p=compassTarget(origin,target,0);assert.ok(Math.abs(p.left-x)<1e-9);assert.ok(Math.abs(p.top-y)<1e-9);
 }
});
test('turning the phone changes screen direction while preserving the geographic target',()=>{
 const target={lat:0,lng:1};
 assert.equal(compassTarget(origin,target,0).angle,90);
 assert.equal(compassTarget(origin,target,90).angle,0);
 assert.equal(compassTarget(origin,target,180).angle,270);
});
test('without GPS or a real compass heading no misleading target is shown',()=>{
 for(const h of [null,undefined,NaN,Infinity])assert.equal(compassTarget(origin,{lat:1,lng:1},h),null);
 assert.equal(compassTarget(null,{lat:1,lng:1},0),null);
 assert.equal(compassTarget(origin,{lat:91,lng:1},0),null);
});
test('angle wrap takes the short turn across north instead of spinning',()=>{
 assert.equal(nearestAngle(359,1),361);assert.equal(nearestAngle(1,359),-1);assert.equal(nearestAngle(721,359),719);
});

test('iPhone and Android sensors follow the front of the phone, including landscape',async()=>{
 const {phoneHeading}=await import('../app/lib/compassTarget.mjs');
 assert.equal(phoneHeading({webkitCompassHeading:90},0),90);
 assert.equal(phoneHeading({absolute:true,alpha:270},0),90);
 assert.equal(phoneHeading({webkitCompassHeading:270},90),0);
 assert.equal(phoneHeading({webkitCompassHeading:90},270),0);
 assert.equal(phoneHeading({absolute:false,alpha:270},0),null);
 assert.equal(phoneHeading({webkitCompassHeading:NaN},0),null);
});
