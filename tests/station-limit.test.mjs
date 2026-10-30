import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as client from '../app/lib/patrac-engine.mjs';
import * as worker from '../worker/lib/patrac-engine.mjs';
const station={name:'Místo',lat:49.3,lng:17.39,radius:25,question:'Kolik?',answer:'Jedna',hints:[]};
test('client and server accept 30 stations but reject zero and 31, for timed expeditions',()=>{
 assert.equal(readFileSync(new URL('../app/lib/patrac-engine.mjs',import.meta.url),'utf8'),readFileSync(new URL('../worker/lib/patrac-engine.mjs',import.meta.url),'utf8'));
 for(const engine of [client,worker])for(const mode of ['race']){
 assert.equal(engine.MAX_STATIONS,30);
 assert.equal(engine.validateExpedition({name:'Výprava',mode,stations:Array.from({length:30},()=>({...station}))}).stations.length,30);
 for(const n of [0,31,50])assert.throws(()=>engine.validateExpedition({name:'Výprava',mode,stations:Array.from({length:n},()=>({...station}))}),/1 až 30 stanovišť/);
 }
});
test('existing longer games remain playable without silently dropping stations',()=>{
 for(const engine of [client,worker]){
 const now=Date.now(),validated=engine.validateExpedition({name:'Dřívější výprava',mode:'race',stations:[station]});
 const game={...validated,status:'running',startedAt:now-1000,stations:Array.from({length:31},(_,index)=>({...validated.stations[0],id:index,name:'Místo '+(index+1)}))};
 const team={...engine.newTeam('player','Hráč',now-1000),startedAt:now-1000,index:30,arrivedAt:now-500};
 assert.equal(engine.teamProjection(game,team,now).station.name,'Místo 31');
 assert.equal(engine.applyAction(game,team,{action:'answer',index:30,answer:'Jedna'},now).finishedAt,now);
 assert.equal(game.stations.length,31);
 }
});
