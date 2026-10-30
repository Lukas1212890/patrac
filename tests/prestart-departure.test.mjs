import test from 'node:test';
import assert from 'node:assert/strict';
import {newTeam,applyAction,teamProjection} from '../app/lib/patrac-engine.mjs';
import {restoreUnstartedDeparture} from '../shared/playLimits.mjs';
const game={mode:'race',status:'running',startedAt:null,stations:[{id:'s0',name:'Start',lat:49,lng:17,radius:25}]};
const prepared={...newTeam('one','Hráč',1000),individualStart:true,startedAt:null};
test('leaving before start does not consume the attempt; starting then abandoning is permanent',()=>{
 const left=applyAction(game,prepared,{action:'abandon',confirm:true},2000);assert.deepEqual(left,prepared);assert.equal(teamProjection(game,left,3000).station.name,'Start');
 const started=applyAction(game,left,{action:'begin',confirm:true},4000);const ended=applyAction(game,started,{action:'abandon',confirm:true},5000);assert.equal(ended.abandonedAt,5000);assert.equal(restoreUnstartedDeparture(game,ended),ended);assert.throws(()=>applyAction(game,ended,{action:'begin',confirm:true},6000),/ukončený/);
});
test('repair only restores provably unstarted cancellations, never started, finished, timed out or visited attempts',()=>{
 const old={...prepared,abandonedAt:2000,events:[{type:'abandon',at:2000,index:0}]};const restored=restoreUnstartedDeparture(game,old);assert.equal(restored.abandonedAt,undefined);assert.deepEqual(restored.events,[]);
 for(const unsafe of [{startedAt:1500},{finishedAt:1900},{arrivedAt:1800},{lastWrongAt:1800},{index:1},{penaltyMs:60000},{endReason:'timeout'},{events:[{type:'start',at:1500},{type:'abandon',at:2000}]}]){const team={...old,...unsafe};assert.equal(restoreUnstartedDeparture(game,team),team);}
 const legacy={...old,individualStart:false};assert.equal(restoreUnstartedDeparture({...game,startedAt:1500},legacy),legacy);
});
