import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPrivateHistory,mergePrivateHistory} from '../app/lib/privateHistory.mjs';
const saved=(code,token=code)=>({code,token,role:'team',name:'Vlci'});
test('history removes only confirmed missing/deleted routes; network, auth and server failures preserve keys',async()=>{
 const current=['missing','deleted','offline','server','auth','guest','valid'].map(code=>saved(code));
 const {checked,unverified}=await checkPrivateHistory(current,async s=>{
  const status={missing:404,deleted:410,server:500,auth:401}[s.code];if(status)throw Object.assign(Error(),{status});
  if(s.code==='offline')throw TypeError('Failed to fetch');
  if(s.code==='guest')return{role:'guest'};
  return{role:'team',game:{name:'Lesní cesta',totalStations:5},team:{name:'Vlci',index:2,finishedAt:null}};
 });
 assert.equal(unverified,true);const result=mergePrivateHistory(current,checked);
 assert.deepEqual(result.map(s=>s.code),['offline','server','auth','guest','valid']);
 assert.equal(result.at(-1).gameName,'Lesní cesta');assert.equal(result.at(-1).name,'Vlci');assert.equal(result.at(-1).index,2);
 assert.equal(result.at(-1).token,'valid');
});
test('late cleanup cannot remove a replacement key, owner access, pending join, or a newly added expedition',async()=>{
 const old=saved('old','old-key'),owner={...old,role:'owner'},pending={...saved('pending'),pending:true};let calls=0;
 const {checked}=await checkPrivateHistory([old,owner,pending],async()=>{calls++;throw Object.assign(Error(),{status:404});});
 assert.equal(calls,1);
 const replacement=saved('old','new-key'),newGame=saved('new');
 assert.deepEqual(mergePrivateHistory([replacement,owner,pending,newGame],checked),[replacement,owner,pending,newGame]);
 assert.equal(mergePrivateHistory([old],checked).length,0);
});
test('history stops scheduling checks after cancellation and limits concurrent requests',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 assert.deepEqual((await checkPrivateHistory([saved('one')],async()=>{calls++;},controller.signal)).checked,[]);assert.equal(calls,0);
 let active=0,peak=0;
 await checkPrivateHistory(Array.from({length:9},(_,i)=>saved(String(i))),async()=>{active++;peak=Math.max(active,peak);await new Promise(setImmediate);active--;throw Error('offline');});assert.equal(peak,3);
});
