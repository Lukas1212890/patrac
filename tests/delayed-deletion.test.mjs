import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reserveExpedition,removeExpedition,expeditionCount,sweepDeletedExpeditions,DELETION_DELAY_MS} from '../worker/lib/expeditionLifecycle.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const statement=(sql,values=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async run(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};}});
 const db={prepare:sql=>statement(sql),async batch(statements){native.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());native.exec('COMMIT');return results;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const objects=new Map(),calls=[];let fail=false;
 const bucket={async list({prefix,cursor}){if(fail)throw Error('offline');calls.push(prefix);const all=[...objects.keys()].filter(k=>k.startsWith(prefix)&&(!cursor||k>cursor)).sort(),keys=all.slice(0,2);return{objects:keys.map(key=>({key})),truncated:all.length>2,...(all.length>2?{cursor:keys.at(-1)}:{})};},async delete(keys){for(const key of keys)objects.delete(key);}};
 async function add(code,userId='owner',status='waiting'){return reserveExpedition(db,{code,userId,ownerHash:'hash-'+code,payload:JSON.stringify({name:code,status,stations:[]}),now:Date.now()});}
 return{native,db,bucket,objects,calls,add,setFail:v=>fail=v};
}
test('deletion keeps all data for 72 hours, retries preserve deadline and sweep removes only due games',async()=>{
 const f=fixture();await f.add('ABCDEFG');await f.add('HJKLMNP');
 f.objects.set('hints/ABCDEFG/photo','photo');
 const now=Date.now();
 const scheduled=await removeExpedition(f.db,f.bucket,{code:'ABCDEFG',userId:'owner',version:0,confirmation:'ABCDEFG',now});
 assert.equal(scheduled.scheduled,true);assert.equal(scheduled.deleteAt,now+DELETION_DELAY_MS);assert.equal(f.objects.size,1);
 const row=f.native.prepare("SELECT * FROM patrac_expeditions WHERE code='ABCDEFG'").get();assert.equal(JSON.parse(row.payload).status,'waiting');
 const again=await removeExpedition(f.db,f.bucket,{code:'ABCDEFG',userId:'owner',version:row.version,confirmation:'ABCDEFG',now:now+1000});assert.equal(again.deleteAt,scheduled.deleteAt);
 // fixture's D1 adapter also needs all() for the scheduled sweep.
 const adapter={prepare(sql){const st=f.db.prepare(sql);const wrap=(args=[])=>({bind:(...a)=>wrap(a),async all(){return{results:f.native.prepare(sql).all(...args)};}});return sql.startsWith('SELECT e.code,e.version,c.creator_id')?wrap():st;},batch:f.db.batch};
 await sweepDeletedExpeditions(adapter,f.bucket,now+DELETION_DELAY_MS-1);assert.equal(f.objects.size,1);
 await sweepDeletedExpeditions(adapter,f.bucket,now+DELETION_DELAY_MS);assert.equal(f.objects.size,0);assert.equal(f.native.prepare("SELECT code FROM patrac_expeditions WHERE code='ABCDEFG'").get(),undefined);assert.ok(f.native.prepare("SELECT code FROM patrac_expeditions WHERE code='HJKLMNP'").get());
 f.native.close();
});
