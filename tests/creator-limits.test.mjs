import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createAdminService} from '../worker/lib/adminService.mjs';
import {creatorLimits} from '../worker/lib/creatorLimits.mjs';
import {reserveExpedition,expeditionCount} from '../worker/lib/expeditionLifecycle.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0003_account_admin.sql','0008_creator_limits.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const stamp=Date.now();for(const id of ['admin','creator','other'])native.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',stamp,stamp);native.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').run('admin',stamp);
 let fail=false,before=null;
 const statement=(sql,values=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async all(){return{results:native.prepare(sql).all(...values)};},execute(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};},async run(){return this.execute();}});
 const db={prepare:sql=>statement(sql),async batch(statements){if(before){const fn=before;before=null;fn();}native.exec('BEGIN');try{const out=[];for(let i=0;i<statements.length;i++){if(fail&&i===1){fail=false;throw Error('transaction interrupted');}out.push(statements[i].execute());}native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const sessions={admin:{user:{id:'admin',emailVerified:true},session:{createdAt:stamp}},regular:{user:{id:'creator',emailVerified:true},session:{createdAt:stamp}},stale:{user:{id:'admin',emailVerified:true},session:{createdAt:stamp-3600000}}};
 const api=createAdminService({db,getSession:async r=>sessions[r],sendReset:async()=>{},sendVerification:async()=>{},now:()=>stamp});
 const input={action:'limits',id:'creator',privateLimit:5,publicLimit:4,reason:'Individuální dohoda se školou.',version:0,requestKey:'test-limits-request-12345'};
 const add=(code,visibility='private',userId='creator')=>reserveExpedition(db,{code,userId,ownerHash:'owner-'+code,payload:JSON.stringify({name:code,visibility,status:'waiting',stations:[]}),now:stamp});
 return{native,db,api,input,add,fail:()=>fail=true,interleave:fn=>before=fn};
}
test('only a fresh admin can set bounded whole-number limits with reason and revision; writes are audited and idempotent',async()=>{
 const f=fixture();assert.deepEqual(await creatorLimits(f.db,'creator'),{ready:true,private:3,public:2,version:0});
 for(const [session,status] of [[null,401],['regular',403],['stale',428]])await assert.rejects(()=>f.api.change(session,f.input),e=>e.status===status);
 for(const input of [{privateLimit:-1},{publicLimit:1001},{privateLimit:1.5},{publicLimit:'4'},{reason:''}])await assert.rejects(()=>f.api.change('admin',{...f.input,...input}),e=>e.status===400);
 assert.equal((await f.api.change('admin',f.input)).ok,true);assert.deepEqual(await creatorLimits(f.db,'creator'),{ready:true,private:5,public:4,version:1});assert.equal((await creatorLimits(f.db,'other')).private,3);
 await f.api.change('admin',f.input);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_admin_audit').get().n,1);
 await assert.rejects(()=>f.api.change('admin',{...f.input,privateLimit:99}),e=>e.status===409);await assert.rejects(()=>f.api.change('admin',{...f.input,requestKey:'test-limits-request-stale'}),e=>e.status===409);
 const detail=await f.api.detail('admin','creator');assert.equal(detail.limits.public,4);assert.equal(detail.audit[0].action,'limits');assert.equal(JSON.parse(detail.audit[0].details).reason,f.input.reason);f.native.close();
});
test('independent custom limits are enforced atomically, and zero or lowering a limit preserves existing games',async()=>{
 const f=fixture();await f.api.change('admin',{...f.input,privateLimit:2,publicLimit:1});
 for(const code of ['ABCDEFG','HJKLMNP'])assert.equal((await f.add(code))[1].meta.changes,1);assert.equal((await f.add('QRSTUVX'))[1].meta.changes,0);
 assert.equal((await f.add('YZABCDE','public'))[1].meta.changes,1);assert.equal((await f.add('FGHJKLM','public'))[1].meta.changes,0);
 await f.api.change('admin',{...f.input,privateLimit:0,publicLimit:0,version:1,requestKey:'test-limits-request-zero'});assert.equal(await expeditionCount(f.db,'creator'),2);assert.equal(await expeditionCount(f.db,'creator','public'),1);assert.equal((await f.add('QRSTUVX'))[1].meta.changes,0);assert.equal((await f.add('FGHJKLM','public'))[1].meta.changes,0);assert.equal((await f.add('NPQRSTU','private','other'))[1].meta.changes,1);
 await f.api.change('admin',{...f.input,privateLimit:3,publicLimit:2,version:2,requestKey:'test-limits-request-reset'});assert.equal((await f.add('QRSTUVX'))[1].meta.changes,1);f.native.close();
});
test('the reservation re-reads a concurrent limit change in its transaction; failed admin writes roll back audit and setting',async()=>{
 const f=fixture();await f.api.change('admin',{...f.input,privateLimit:1});
 f.interleave(()=>f.native.prepare("UPDATE patrac_creator_limits SET private_limit=0,version=version+1 WHERE user_id='creator'").run());assert.equal((await f.add('ABCDEFG'))[1].meta.changes,0);
 const before=await creatorLimits(f.db,'creator');f.fail();await assert.rejects(()=>f.api.change('admin',{...f.input,version:before.version,requestKey:'test-limits-request-failed'}));assert.deepEqual(await creatorLimits(f.db,'creator'),before);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_admin_audit').get().n,1);
 f.native.exec('DROP TABLE patrac_creator_limits');assert.equal((await creatorLimits(f.db,'creator')).ready,false);assert.equal((await f.add('ABCDEFG'))[1].meta.changes,1);await assert.rejects(()=>f.api.change('admin',f.input),e=>e.status===503);f.native.close();
});
