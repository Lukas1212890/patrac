import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {reserveExpedition,removeExpedition,expeditionCount} from '../worker/lib/expeditionLifecycle.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const statement=(sql,values=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async run(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};}});
 const db={prepare:sql=>statement(sql),async batch(statements){native.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());native.exec('COMMIT');return results;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const objects=new Map(),calls=[];let fail=false;
 const bucket={async list({prefix,cursor}){if(fail)throw Error('offline');calls.push(prefix);const all=[...objects.keys()].filter(k=>k.startsWith(prefix)&&(!cursor||k>cursor)).sort(),keys=all.slice(0,2);return{objects:keys.map(key=>({key})),truncated:all.length>2,...(all.length>2?{cursor:keys.at(-1)}:{})};},async delete(keys){for(const key of keys)objects.delete(key);}};
 async function add(code,userId='owner',status='waiting'){return reserveExpedition(db,{code,userId,ownerHash:'hash-'+code,payload:JSON.stringify({name:code,status,stations:[]}),now:Date.now()});}
 return{native,db,bucket,objects,calls,add,setFail:v=>fail=v};
}
test('the author limit counts every stored expedition including games with finished teams',async()=>{
 const f=fixture();for(const [code,status]of[['ABCDEFG','waiting'],['HJKLMNP','running'],['QRSTUVX','running']])assert.equal((await f.add(code,'owner',status))[1].meta.changes,1);
 f.native.prepare('INSERT INTO patrac_teams VALUES(?,?,?,?,?,0)').run('done','QRSTUVX','hash-token','done',JSON.stringify({finishedAt:Date.now()}));
 const denied=await f.add('YZABCDE');assert.equal(denied[0].meta.changes,0);assert.equal(await expeditionCount(f.db,'owner'),3);assert.equal(f.native.prepare("SELECT code FROM patrac_expeditions WHERE code='YZABCDE'").get(),undefined);
 assert.equal((await f.add('YZABCDE','other'))[1].meta.changes,1);f.native.close();
});
test('manual deletion removes teams, ownership and all photo pages only for its code and frees a slot',async()=>{
 const f=fixture();await f.add('ABCDEFG');await f.add('HJKLMNP');await f.add('QRSTUVX');
 f.native.prepare('INSERT INTO patrac_teams VALUES(?,?,?,?,?,0)').run('team','ABCDEFG','token','team','{}');
 for(let i=0;i<5;i++)f.objects.set('hints/ABCDEFG/photo'+i,'image');f.objects.set('hints/HJKLMNP/keep','other');
 const result=await removeExpedition(f.db,f.bucket,{code:'ABCDEFG',userId:'owner',version:0,confirmation:'ABCDEFG'});assert.equal(result.deleted,true);
 assert.equal(f.native.prepare("SELECT COUNT(*) AS n FROM patrac_teams WHERE code='ABCDEFG'").get().n,0);assert.equal(await expeditionCount(f.db,'owner'),2);
 assert.deepEqual([...f.objects.keys()],['hints/HJKLMNP/keep']);assert.equal(f.calls.length,3);assert.equal((await f.add('YZABCDE'))[1].meta.changes,1);f.native.close();
});
test('wrong owner, stale version and missing confirmation cannot erase anything',async()=>{
 const f=fixture();await f.add('ABCDEFG');f.objects.set('hints/ABCDEFG/photo','image');
 for(const args of [{userId:'other',version:0,confirmation:'ABCDEFG'},{userId:'owner',version:5,confirmation:'ABCDEFG'},{userId:'owner',version:0,confirmation:'wrong'}])await assert.rejects(()=>removeExpedition(f.db,f.bucket,{code:'ABCDEFG',...args}));
 assert.equal(await expeditionCount(f.db,'owner'),1);assert.equal(f.objects.size,1);assert.equal(f.calls.length,0);assert.equal(JSON.parse(f.native.prepare('SELECT payload FROM patrac_expeditions').get().payload).status,'waiting');f.native.close();
});
test('interrupted photo cleanup retains ownership and a quota slot until retry completes',async()=>{
 const f=fixture();await f.add('ABCDEFG');f.objects.set('hints/ABCDEFG/photo','image');f.setFail(true);
 await assert.rejects(()=>removeExpedition(f.db,f.bucket,{code:'ABCDEFG',userId:'owner',version:0,confirmation:'ABCDEFG'}),e=>e.status===503);
 assert.equal(await expeditionCount(f.db,'owner'),1);const row=f.native.prepare('SELECT * FROM patrac_expeditions').get();assert.equal(JSON.parse(row.payload).status,'deleting');assert.equal(row.version,1);
 f.setFail(false);await removeExpedition(f.db,f.bucket,{code:'ABCDEFG',userId:'owner',version:1,confirmation:'ABCDEFG'});assert.equal(await expeditionCount(f.db,'owner'),0);assert.equal(f.objects.size,0);f.native.close();
});
