import test from 'node:test';
import assert from 'node:assert/strict';
import * as client from '../app/lib/patrac-engine.mjs';
import * as worker from '../worker/lib/patrac-engine.mjs';
const now=2000000000000;
const station={name:'Dub',lat:49.3,lng:17.39,radius:25,question:'Co hledáš?',answer:'poklad',hints:[]};
for(const [name,engine] of [['client',client],['worker',worker]]){
 test(name+': optional stories survive validation and JSON storage; old games stay compatible',()=>{
  const old=engine.validateExpedition({name:'Výprava',mode:'race',stations:[station]});
  assert.equal(old.finishText,'');assert.equal(old.stations[0].arrivalText,'');
  const game=JSON.parse(JSON.stringify(engine.validateExpedition({name:'Výprava',mode:'race',finishText:'  Gratulace\nDíky!  ',stations:[{...station,arrivalText:'  Příběh dubu  '}]})));
  assert.equal(game.finishText,'Gratulace\nDíky!');assert.equal(game.stations[0].arrivalText,'Příběh dubu');
  for(const bad of [42,{},'x'.repeat(3001)]){
   assert.throws(()=>engine.validateExpedition({name:'Výprava',mode:'race',finishText:bad,stations:[station]}));
   assert.throws(()=>engine.validateExpedition({name:'Výprava',mode:'race',stations:[{...station,arrivalText:bad}]}));
  }
 });
 test(name+': GPS arrival unlocks story; only final correct answer reveals congratulations and stops time',()=>{
  const game={...engine.validateExpedition({name:'Výprava',mode:'race',finishText:'Hotovo!',stations:[{...station,arrivalText:'Vítej u dubu.'}]}),status:'running',startedAt:now};
  let team=engine.newTeam('player','Pátrač',now);
  assert.equal(engine.teamProjection(game,team,now).station.arrivalText,undefined);
  assert.equal(engine.teamProjection(game,team,now).finishText,undefined);
  assert.throws(()=>engine.applyAction(game,team,{action:'arrive',index:0,position:{lat:50,lng:18,acc:5,timestamp:now+1000}},now+1000));
  team=engine.applyAction(game,team,{action:'arrive',index:0,position:{lat:49.3,lng:17.39,acc:5,timestamp:now+1000}},now+1000);
  assert.equal(engine.teamProjection(game,team,now+1000).station.arrivalText,'Vítej u dubu.');
  team=engine.applyAction(game,team,{action:'answer',index:0,answer:'špatně'},now+2000);
  assert.equal(engine.teamProjection(game,team,now+2000).finishText,undefined);
  team=engine.applyAction(game,team,{action:'answer',index:0,answer:'poklad'},now+8000);
  const projected=engine.teamProjection(game,team,now+100000);
  assert.equal(projected.finishText,'Hotovo!');assert.equal(projected.station,null);assert.equal(projected.elapsedMs,8000);
 });
}
