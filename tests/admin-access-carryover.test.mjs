import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {carryAdminAccess} from '../worker/lib/adminAccessCarryover.mjs';
import {accessState,addMonths} from '../worker/lib/billing.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('CREATE TABLE patrac_access(user_id TEXT,environment TEXT,expires_at INTEGER DEFAULT 0,version INTEGER DEFAULT 0,PRIMARY KEY(user_id,environment));CREATE TABLE patrac_admin_audit(id TEXT PRIMARY KEY,target_id TEXT,action TEXT,status TEXT,details TEXT,created_at INTEGER)');
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),async first(){return native.prepare(sql).get(...args);},async all(){return{results:native.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...args).changes)}};}});
 let fail=false;const db={prepare:sql=>statement(sql),async batch(items){native.exec('BEGIN');try{const result=[];for(const [i,s]of items.entries()){result.push(await s.run());if(fail&&i===0)throw Error('simulated');}native.exec('COMMIT');return result;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const start=Date.UTC(2026,9,28);const gift=(id,months,stamp=start,status='success')=>native.prepare('INSERT INTO patrac_admin_audit VALUES(?,?,?,?,?,?)').run(id,'user','access',status,JSON.stringify({environment:'test',months,expiresAt:addMonths(stamp,12)}),stamp);
 return{native,db,start,gift,setFail:v=>fail=v};
}
test('existing and new admin gifts survive live switch once, without sandbox payment time',async()=>{
 const f=fixture();f.native.prepare('INSERT INTO patrac_access VALUES(?,?,?,0)').run('user','test',addMonths(f.start,24));
 f.gift('one',3);f.gift('two',6,f.start+1000);f.gift('failed',12,f.start,'error');
 const state=await accessState(f.db,'user','live',f.start);assert.equal(state.expiresAt,addMonths(addMonths(f.start,3),6));assert.equal(state.active,true);
 await carryAdminAccess(f.db,'user');assert.deepEqual(await accessState(f.db,'user','live',f.start),state);
 assert.equal((await accessState(f.db,'other','live',f.start)).active,false);
 f.gift('three',3,f.start+2000);await carryAdminAccess(f.db,'user');assert.equal((await accessState(f.db,'user','live',f.start)).expiresAt,addMonths(state.expiresAt,3));
 f.native.close();
});
test('expired gifts do not restart at migration; transaction failure rolls back marker and access',async()=>{
 const f=fixture();f.gift('old',3);f.setFail(true);await assert.rejects(carryAdminAccess(f.db,'user'),/simulated/);assert.equal(JSON.parse(f.native.prepare('SELECT details FROM patrac_admin_audit').get().details).liveApplied,undefined);
 f.setFail(false);const state=await accessState(f.db,'user','live',addMonths(f.start,6));assert.equal(state.active,false);assert.equal(state.expiresAt,addMonths(f.start,3));f.native.close();
});
