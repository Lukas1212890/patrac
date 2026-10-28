import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createCreatorRewards} from '../worker/lib/creatorRewards.mjs';
import {addMonths} from '../worker/lib/billing.mjs';
import {removeExpedition} from '../worker/lib/expeditionLifecycle.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0004_billing.sql','0005_public_expeditions.sql','0007_creator_rewards.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 let stamp=Date.UTC(2026,9,28,12),fail=false,beforeBatch=null;
 const statement=(sql,values=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async all(){return{results:native.prepare(sql).all(...values)};},execute(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};},async run(){return this.execute();}});
 const db={prepare:sql=>statement(sql),async batch(statements){if(beforeBatch){const run=beforeBatch;beforeBatch=null;run();}native.exec('BEGIN');try{const out=[];for(let i=0;i<statements.length;i++){if(fail&&i===1){fail=false;throw Error('simulated transaction failure');}out.push(statements[i].execute());}native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const user=id=>native.prepare('INSERT OR IGNORE INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',stamp,stamp);
 user('author');user('other');
 function game(code,owner='author',visibility='public') {native.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').run(code,'owner-'+code,JSON.stringify({name:'Výprava '+code,visibility,status:'running',published:true,stations:[]}));native.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').run(code,owner,stamp);}
 function players(code,count,environment='test',finished=true,owner=false){for(let i=0;i<count;i++){const id=owner?'author':'player-'+i;user(id);const key=code+'-'+environment+'-'+i+(owner?'-author':'')+(finished?'':'-unfinished');native.prepare('INSERT OR IGNORE INTO patrac_teams VALUES(?,?,?,?,?,0)').run(key,code,'token-'+key,'name-'+key,JSON.stringify({startedAt:stamp-1000,finishedAt:finished?stamp:null}));native.prepare('INSERT OR IGNORE INTO patrac_public_attempts VALUES(?,?,?,?,?,?)').run(key,code,id,key,stamp,environment);if(finished)native.prepare("UPDATE patrac_teams SET payload=json_set(payload,'$.finishedAt',?) WHERE id=(SELECT team_id FROM patrac_public_attempts WHERE code=? AND user_id=? AND environment=?)").run(stamp,code,id,environment);}}
 const env={PATRAC_STRIPE_MODE:'test',PATRAC_BILLING_ENABLED:'true'},api=createCreatorRewards({db,env,now:()=>stamp});
 const access=(environment='test')=>native.prepare('SELECT * FROM patrac_access WHERE user_id=? AND environment=?').get('author',environment);
 return{native,db,env,api,game,players,access,now:()=>stamp,tick:ms=>stamp+=ms,fail:()=>fail=true,interleave:fn=>beforeBatch=fn};
}
test('99 completions do not reward; 100, 200 and 300 each add two months once, including concurrent retries',async()=>{
 const f=fixture();f.game('ABCDEFG');f.players('ABCDEFG',99);assert.equal((await f.api.rewardExpedition('ABCDEFG')).granted,0);assert.equal(f.access(),undefined);
 f.players('ABCDEFG',100);const results=await Promise.all([f.api.rewardExpedition('ABCDEFG'),f.api.rewardExpedition('ABCDEFG')]);assert.equal(results.reduce((n,r)=>n+r.granted,0),1);assert.equal(f.access().expires_at,addMonths(f.now(),2));assert.equal(f.access().version,1);
 f.players('ABCDEFG',300);assert.equal((await f.api.rewardExpedition('ABCDEFG')).granted,2);let expected=f.now();for(let i=0;i<3;i++)expected=addMonths(expected,2);assert.equal(f.access().expires_at,expected);assert.equal(f.access().version,3);assert.equal((await f.api.rewardExpedition('ABCDEFG')).granted,0);
 const summary=await f.api.summary('author');assert.equal(summary.awardedMonths,6);assert.equal(summary.history.length,3);assert.equal(summary.expeditions[0].completed,300);assert.equal(summary.expeditions[0].nextMilestone,400);assert.equal(summary.expeditions[0].remaining,100);assert.equal((await f.api.summary('other')).history.length,0);f.native.close();
});
test('each public expedition and environment is independent; unfinished, private and author attempts do not count',async()=>{
 const f=fixture();f.game('ABCDEFG');f.game('HJKLMNP');f.game('QRSTUVX','author','private');f.players('ABCDEFG',99);f.players('ABCDEFG',1,'test',true,true);f.players('HJKLMNP',1);f.players('QRSTUVX',100);
 assert.equal((await f.api.sweep()).checked,0);assert.equal(f.access(),undefined);
 f.players('ABCDEFG',100,'test',false);assert.equal((await f.api.rewardExpedition('ABCDEFG')).granted,0);
 f.players('ABCDEFG',100);await f.api.rewardExpedition('ABCDEFG');assert.equal(f.access().version,1);assert.equal(f.access('live'),undefined);
 f.players('HJKLMNP',100);await f.api.rewardExpedition('HJKLMNP');assert.equal(f.access().version,2);
 f.players('ABCDEFG',100,'live');const live=createCreatorRewards({db:f.db,env:{PATRAC_STRIPE_MODE:'live'},now:f.now});await live.rewardExpedition('ABCDEFG');assert.equal(f.access('live').expires_at,addMonths(f.now(),2));assert.equal((await live.summary('author')).awardedMonths,2);assert.equal((await f.api.summary('author')).awardedMonths,4);f.native.close();
});
test('transaction failures retry safely and concurrent access extensions are not overwritten',async()=>{
 const f=fixture();f.game('ABCDEFG');f.players('ABCDEFG',100);f.fail();await assert.rejects(()=>f.api.rewardExpedition('ABCDEFG'));assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_creator_rewards').get().n,0);assert.equal(f.access().expires_at,0);
 const paidUntil=addMonths(f.now(),3);f.interleave(()=>f.native.prepare('UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id=?').run(paidUntil,'author'));
 await f.api.rewardExpedition('ABCDEFG');assert.equal(f.access().expires_at,addMonths(paidUntil,2));assert.equal(f.access().version,2);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_creator_rewards').get().n,1);f.native.close();
});
test('hourly recovery catches missed grants on hidden expeditions; deletion preserves awarded time and reward history',async()=>{
 const f=fixture();f.game('ABCDEFG');f.players('ABCDEFG',200);f.native.exec("UPDATE patrac_expeditions SET payload=json_set(payload,'$.published',0) WHERE code='ABCDEFG'");
 assert.equal((await f.api.summary('author')).expeditions[0].pendingMonths,4);assert.equal((await f.api.sweep()).checked,1);assert.equal(f.access().version,2);assert.equal((await f.api.sweep()).checked,0);
 const until=f.access().expires_at;await removeExpedition(f.db,{list:async()=>({objects:[],truncated:false}),delete:async()=>{}},{code:'ABCDEFG',userId:'author',version:0,confirmation:'ABCDEFG'});assert.equal(f.access().expires_at,until);const summary=await f.api.summary('author');assert.equal(summary.history.length,2);assert.equal(summary.awardedMonths,4);assert.deepEqual(summary.expeditions,[]);f.native.close();
});
test('expired access restarts on award date and a missing migration leaves gameplay-compatible reads',async()=>{
 const f=fixture();f.game('ABCDEFG');f.players('ABCDEFG',100);f.native.prepare("INSERT INTO patrac_access VALUES('author','test',?,0)").run(f.now()-86400000);await f.api.rewardExpedition('ABCDEFG');assert.equal(f.access().expires_at,addMonths(f.now(),2));
 f.native.exec('DROP TABLE patrac_creator_rewards');assert.equal((await f.api.rewardExpedition('ABCDEFG')).ready,false);assert.equal((await f.api.summary('author')).ready,false);assert.equal((await f.api.sweep()).ready,false);f.native.close();
});
