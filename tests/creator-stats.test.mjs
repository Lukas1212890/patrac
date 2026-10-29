import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creatorStats} from '../shared/creatorStats.mjs';
test('creator overview separates waiting, active, finished and timed out attempts and counts hint users once',()=>{
 const game={mode:'race',stations:[{name:'Start'},{name:'Cíl'}]};
 const events=[{type:'arrive',index:0,at:2000},{type:'hint',index:0},{type:'hint',index:0},{type:'solution',index:0},{type:'solve',index:0,at:62000}];
 const teams=[{index:0,events:[]},{startedAt:1000,index:1,finishedAt:121000,penaltyMs:60000,events},{startedAt:1000,index:0,events:[]},{startedAt:1000,index:1,abandonedAt:5000,events},{startedAt:1,index:0,events:[]}];
 const s=creatorStats(game,teams,48*3600000+1);
 assert.equal(s.waiting,1);assert.equal(s.started,4);assert.equal(s.completed,1);assert.equal(s.active,1);assert.equal(s.unfinished,2);assert.equal(s.completionRate,25);assert.equal(s.averageMs,180000);
 assert.deepEqual(s.stations[0],{index:0,name:'Start',reached:2,solved:2,hints:2,solutions:2,ended:1,averageSolveMs:60000});assert.equal(s.stations[1].ended,1);
});
test('private common start and treasure results omit penalties; empty averages remain unknown',()=>{
 const game={startedAt:1000,mode:'treasure',stations:[{name:'Les'}]};
 const s=creatorStats(game,[{index:1,finishedAt:61000,penaltyMs:99999,events:[]}],70000);
 assert.equal(s.started,1);assert.equal(s.averageMs,60000);assert.equal(s.completionRate,100);
 const empty=creatorStats(game,[],70000);assert.equal(empty.averageMs,null);assert.equal(empty.completionRate,null);assert.equal(empty.stations[0].averageSolveMs,null);
});
