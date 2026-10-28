import test from 'node:test';
import assert from 'node:assert/strict';
import { photoDimensions, compressPhoto, dataUrlBytes, PHOTO_MAX_BYTES } from '../app/lib/photoCompression.mjs';
import { storeHintPhotos, removeReplacedPhotos } from '../worker/lib/photoStorage.mjs';
const encoded = (type, bytes) => `data:${type};base64,` + Buffer.alloc(bytes).toString('base64');
test('photo sizing preserves portrait/landscape ratios, never enlarges and rejects invalid pixel counts', () => {
  assert.deepEqual(photoDimensions(4000,3000),{width:1280,height:960});
  assert.deepEqual(photoDimensions(3000,4000),{width:960,height:1280});
  assert.deepEqual(photoDimensions(200,100),{width:200,height:100});
  assert.throws(()=>photoDimensions(0,20));assert.throws(()=>photoDimensions(20000,20000));
  assert.equal(dataUrlBytes(encoded('image/webp',10001)),10001);
});
test('compression prefers a clear WebP image within budget and handles Safari PNG fallback', async () => {
  const calls=[];
  const webp=await compressPhoto((size,type,quality)=>{calls.push({size,type,quality});return encoded(type,80000);},4000,3000);
  assert.equal(calls.length,1);assert.equal(calls[0].quality,.84);assert.equal(dataUrlBytes(webp),80000);
  const fallback=await compressPhoto((size,type)=>encoded(type==='image/webp'?'image/png':'image/jpeg',70000),800,600);
  assert.ok(fallback.startsWith('data:image/jpeg;'));assert.equal(dataUrlBytes(fallback),70000);
});
test('complex images reduce size within a quality floor and respect the server upload cap', async () => {
  const qualities=[];
  const image=await compressPhoto((size,type,q)=>{qualities.push(q);return encoded(type,Math.round(size.width*160));},4000,3000);
  assert.ok(dataUrlBytes(image)<=PHOTO_MAX_BYTES);assert.ok(image.length<250000);assert.ok(Math.min(...qualities)>=.72);
});
function bucket() {const objects=new Map(),writes=[],deleted=[];return {objects,writes,deleted,async head(k){return objects.get(k)||null;},async put(k,bytes,meta){writes.push(k);objects.set(k,{...meta,bytes});},async delete(ks){for(const k of ks){deleted.push(k);objects.delete(k);}}};}
function game(content,key) {return {stations:[{hints:[{type:'photo',content,...(key?{photoKey:key}:{})}]}]};}
test('saving an unchanged photo reuses its object; supplied foreign keys cannot read or reuse another game', async () => {
  const b=bucket(), content=encoded('image/webp',100);
  const first=await storeHintPhotos(game(content),'AAAAAAA',b);
  const key=first.stations[0].hints[0].photoKey;
  const second=await storeHintPhotos(game(content,key),'AAAAAAA',b,first);
  assert.equal(b.writes.length,1);assert.equal(second.stations[0].hints[0].photoKey,key);
  const other=await storeHintPhotos(game(content,key),'BBBBBBB',b);
  assert.notEqual(other.stations[0].hints[0].photoKey,key);assert.equal(b.writes.length,2);
});
test('replaced photo cleanup only removes superseded objects belonging to that expedition', async () => {
  const b=bucket(),first=await storeHintPhotos(game(encoded('image/jpeg',200)),'AAAAAAA',b);
  const oldKey=first.stations[0].hints[0].photoKey;
  const next=await storeHintPhotos(game(encoded('image/webp',100),oldKey),'AAAAAAA',b,first);
  assert.equal(b.objects.size,2);
  await removeReplacedPhotos(first,next,'AAAAAAA',b);
  assert.deepEqual(b.deleted,[oldKey]);assert.equal(b.objects.size,1);
  await removeReplacedPhotos(next,{stations:[]},'BBBBBBB',b);assert.equal(b.objects.size,1);
});
