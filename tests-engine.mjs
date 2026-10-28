import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExpedition,newTeam,applyAction,teamProjection,checkArrival,stationTimings,score} from './app/lib/patrac-engine.mjs';
const at=2000000000000;
const station={name:'Dub',lat:49.3,lng:17.39,radius:25,question:'Co mizí ve tmě?',answer:'stín\nMůj stín',hints:[{type:'text',content:'Podívej se za sebe.',minutes:2}]};
const config=()=>validateExpedition({name:'Testovací výprava',mode:'race',stations:[station,{...station,name:'Cíl',lat:49.31,answer:'Poklad42'}]});
const game=()=>({...config(),status:'running',startedAt:at});
const position=(now,extra={})=>({lat:49.3,lng:17.39,acc:5,timestamp:now,...extra});
test('50 stations work; 51, empty answers and invalid GPS are rejected',()=>{assert.equal(validateExpedition({name:'50 stop',mode:'race',stations:Array(50).fill(station)}).stations.length,50);for(const stations of [Array(51).fill(station),[{...station,lat:null}],[{...station,answer:''}]])assert.throws(()=>validateExpedition({name:'Test',mode:'race',stations}));});
test('questions, answers, unpaid hints and future coordinates stay on server',()=>{const g=game(),t=newTeam('a','Vlci',at);const p=teamProjection(g,t,at);assert.equal(p.station.question,undefined);assert.equal(p.station.hints,undefined);assert.equal(p.station.answers,undefined);assert.equal(p.stations,undefined);const arrived=applyAction(g,t,{action:'arrive',index:0,position:position(at+1000)},at+1000);const visible=teamProjection(g,arrived,at+1000);assert.equal(visible.station.question,station.question);assert.equal(visible.station.hints[0].content,undefined);assert.equal(visible.station.answers,undefined);});
test('bad accuracy, old fixes and distant positions cannot unlock a riddle',()=>{for(const p of [position(at,{acc:80}),position(at-30000),position(at,{lat:49.4}),position(at,{acc:0})]) assert.throws(()=>checkArrival(p,station,at));});
test('answers and hints require GPS arrival',()=>{const g=game(),t=newTeam('a','Vlci',at);assert.throws(()=>applyAction(g,t,{action:'answer',index:0,answer:'stín'},at+1000));assert.throws(()=>applyAction(g,t,{action:'hint',index:0,hintId:'h0'},at+1000));});
test('same hint adds one penalty even after a retry; paid content becomes visible',()=>{const g=game();let t=applyAction(g,newTeam('a','Vlci',at),{action:'arrive',index:0,position:position(at+10000)},at+10000);t=applyAction(g,t,{action:'hint',index:0,hintId:'h0'},at+11000);t=applyAction(g,t,{action:'hint',index:0,hintId:'h0'},at+12000);assert.equal(t.penaltyMs,120000);assert.equal(t.events.filter(e=>e.type==='hint').length,1);assert.equal(teamProjection(g,t,at).station.hints[0].content,station.hints[0].content);});
test('correct answer accepts case and diacritics, stale repeated submissions never skip a station',()=>{const g=game();let t=applyAction(g,newTeam('a','Vlci',at),{action:'arrive',index:0,position:position(at+10000)},at+10000);t=applyAction(g,t,{action:'answer',index:0,answer:'  STIN  '},at+20000);assert.equal(t.index,1);assert.equal(teamProjection(g,t,at).station.lat,49.31);assert.equal(t.arrivedAt,null);assert.throws(()=>applyAction(g,t,{action:'answer',index:0,answer:'stín'},at+21000));});
test('travel and puzzle times partition the real elapsed time without duplication',()=>{const g=game();let t=applyAction(g,newTeam('a','Vlci',at),{action:'arrive',index:0,position:position(at+10000)},at+10000);t=applyAction(g,t,{action:'answer',index:0,answer:'stin'},at+30000);const timing=stationTimings(g,t)[0];assert.equal(timing.travelMs,10000);assert.equal(timing.solveMs,20000);assert.equal(timing.travelMs+timing.solveMs,score(g,t,at+30000).elapsedMs);});
test('treasure mode has no hints and penalties do not affect score',()=>{const g={...game(),mode:'treasure'};let t=applyAction(g,newTeam('a','Vlci',at),{action:'arrive',index:0,position:position(at+10000)},at+10000);assert.deepEqual(teamProjection(g,t,at).station.hints,[]);assert.throws(()=>applyAction(g,t,{action:'hint',index:0,hintId:'h0'},at+11000));assert.equal(score(g,{...t,penaltyMs:60000},at+20000).totalMs,20000);});
test('final time freezes after finish and earlier physical arrival need not win',()=>{const g=game();const first={...newTeam('a','A',at),finishedAt:at+60000,penaltyMs:120000};const second={...newTeam('b','B',at),finishedAt:at+90000};assert.ok(score(g,first,at+999999).totalMs>score(g,second,at+999999).totalMs);assert.equal(score(g,second,at+999999).elapsedMs,90000);});
test('wrong answers are rate-limited and cannot advance the team',()=>{const g=game();let t=applyAction(g,newTeam('a','Vlci',at),{action:'arrive',index:0,position:position(at+10000)},at+10000);t=applyAction(g,t,{action:'answer',index:0,answer:'špatně'},at+11000);assert.equal(t.index,0);assert.equal(t.wrongAnswer,true);assert.throws(()=>applyAction(g,t,{action:'answer',index:0,answer:'stín'},at+12000));});

test('late teams use their own start and finish times while the published route stays open',()=>{
 const g=game(),t={...newTeam('later','Pozdější tým',at+100000),startedAt:at+100000};
 assert.equal(score(g,t,at+115000).elapsedMs,15000);
 const arrived=applyAction(g,t,{action:'arrive',index:0,position:position(at+110000)},at+110000);
 assert.equal(stationTimings(g,arrived)[0].travelMs,10000);
 assert.equal(score(g,{...t,finishedAt:at+120000},at+500000).elapsedMs,20000);
 assert.equal(g.status,'running');
});
