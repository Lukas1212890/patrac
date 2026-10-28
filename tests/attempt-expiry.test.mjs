import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ATTEMPT_LIMIT_MS as limit,expireAttempt} from '../shared/playLimits.mjs';
import {expireAttempts} from '../worker/lib/expiredAttempts.mjs';
import {applyAction,teamProjection,score} from '../worker/lib/patrac-engine.mjs';
import {activePlayerCount} from '../worker/lib/activeExpeditionPlayers.mjs';
import {validatedRouteInfo} from '../worker/lib/routeInfo.mjs';
const start=1000000, game={status:'running',mode:'race',startedAt:start,stations:[{answer:'ok',hints:[]}]};
const team={id:'p',index:0,arrivedAt:start,finishedAt:null,penaltyMs:600000,events:[]};
test('48-hour deadline is based on start, freezes elapsed time and never grants a completion',()=>{
 assert.equal(expireAttempt(game,team,start+limit-1),team);
 const expired=expireAttempt(game,team,start+limit);
 assert.equal(expired.abandonedAt,start+limit);assert.equal(expired.finishedAt,null);assert.equal(expired.endReason,'timeout');
 assert.equal(expireAttempt(game,expired,start+limit*2),expired);
 assert.equal(score(game,team,start+limit*2).totalMs,limit+600000);
 assert.equal(teamProjection(game,team,start+limit).station,null);
 assert.equal(applyAction(game,team,{action:'answer',index:0,answer:'ok'},start+limit).finishedAt,null);
 assert.equal(applyAction(game,team,{action:'answer',index:0,answer:'ok'},start+limit).endReason,'timeout');
 assert.equal(expireAttempt({...game,startedAt:null},team,start+limit),team);
 const late={...team,startedAt:start+1000};assert.equal(expireAttempt(game,late,start+limit),late);
 for(const done of [{...team,finishedAt:start+10},{...team,abandonedAt:start+10}])assert.equal(expireAttempt(game,done,start+limit*2),done);
});
test('atomic expiry releases the owner lock, preserves terminal/waiting players and is idempotent',async()=>{
 const native=new DatabaseSync(':memory:');native.exec('CREATE TABLE patrac_expeditions(code TEXT PRIMARY KEY,payload TEXT);CREATE TABLE patrac_teams(id TEXT PRIMARY KEY,code TEXT,payload TEXT,version INTEGER)');
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),async run(){return{meta:{changes:Number(native.prepare(sql).run(...args).changes)}};},async first(){return native.prepare(sql).get(...args);}});
 const db={prepare:sql=>statement(sql)};
 native.prepare('INSERT INTO patrac_expeditions VALUES(?,?)').run('private',JSON.stringify(game));
 native.prepare('INSERT INTO patrac_expeditions VALUES(?,?)').run('public',JSON.stringify({...game,startedAt:null}));
 const put=(id,code,p)=>native.prepare('INSERT INTO patrac_teams VALUES(?,?,?,0)').run(id,code,JSON.stringify(p));
 put('legacy','private',team);put('active','public',{...team,startedAt:start});put('waiting','public',team);
 put('completed','public',{...team,startedAt:start,finishedAt:start+1});put('abandoned','public',{...team,startedAt:start,abandonedAt:start+2});
 assert.equal(await activePlayerCount(db,'private'),1);assert.equal((await expireAttempts(db,start+limit-1)).meta.changes,0);
 assert.equal((await expireAttempts(db,start+limit)).meta.changes,2);assert.equal(await activePlayerCount(db,'private'),0);assert.equal(await activePlayerCount(db,'public'),0);
 for(const id of ['legacy','active']){const row=native.prepare('SELECT * FROM patrac_teams WHERE id=?').get(id),p=JSON.parse(row.payload);assert.equal(row.version,1);assert.equal(p.finishedAt,null);assert.equal(p.abandonedAt,start+limit);assert.equal(p.events.length,1);assert.equal(p.events[0].type,'timeout');}
 for(const id of ['waiting','completed','abandoned'])assert.equal(native.prepare('SELECT version FROM patrac_teams WHERE id=?').get(id).version,0);
 assert.equal((await expireAttempts(db,start+limit*2)).meta.changes,0);native.close();
});
test('author and automatic estimates have a 24-hour limit without silently clamping long routes',()=>{
 const short=[{lat:0,lng:0}],long=[{lat:0,lng:0},{lat:0,lng:2}];
 assert.equal(validatedRouteInfo({timeEstimateOverride:1440},short).routeInfo.estimatedMinutes,1440);
 assert.throws(()=>validatedRouteInfo({timeEstimateOverride:1441},short));
 assert.throws(()=>validatedRouteInfo({timeEstimateOverride:null},long),/24 hodin/);
 assert.equal(validatedRouteInfo({timeEstimateOverride:1440},long).routeInfo.timeEstimateSource,'author');
});
