import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {upgradePublicLimits} from '../worker/lib/publicLimitUpgrade.mjs';import {creatorLimits} from '../worker/lib/creatorLimits.mjs';
test('upgrade raises every lower public limit once, preserves private and higher limits, and defaults new accounts to ten',async()=>{
 const n=new DatabaseSync(':memory:');for(const f of ['0002_creator_auth.sql','0003_account_admin.sql','0008_creator_limits.sql'])n.exec(readFileSync('drizzle/'+f,'utf8'));
 for(const id of ['default','low','high'])n.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,1,1)').run(id,id,id+'@example.com');
 n.exec("INSERT INTO patrac_creator_limits VALUES('low',20,0,7,1),('high',30,25,4,1)");
 const stmt=(sql,v=[])=>({bind:(...x)=>stmt(sql,x),async first(){return n.prepare(sql).get(...v)||null;},async all(){return {results:n.prepare(sql).all(...v)};},async run(){return {meta:{changes:Number(n.prepare(sql).run(...v).changes)}};}});
 const db={prepare:sql=>stmt(sql),async batch(a){n.exec('BEGIN');try{for(const s of a)await s.run();n.exec('COMMIT');}catch(e){n.exec('ROLLBACK');throw e;}}};
 await upgradePublicLimits(db);assert.equal((await creatorLimits(db,'default')).public,10);assert.deepEqual(await creatorLimits(db,'low'),{ready:true,private:20,public:10,version:8});assert.deepEqual(await creatorLimits(db,'high'),{ready:true,private:30,public:25,version:4});
 assert.equal(n.prepare('SELECT COUNT(*) n FROM patrac_admin_audit').get().n,2);
 n.exec("UPDATE patrac_creator_limits SET public_limit=4 WHERE user_id='low'");await upgradePublicLimits(db);assert.equal((await creatorLimits(db,'low')).public,4);
 n.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,1,1)').run('new','new','new@example.com');assert.equal((await creatorLimits(db,'new')).public,10);n.close();
});
