import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {removeExpedition} from '../worker/lib/expeditionLifecycle.mjs';
import {deleteOwnAccount,deletedAccount,sweepDeletedAccounts} from '../worker/lib/accountDeletion.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())native.exec(readFileSync('drizzle/'+file,'utf8'));
 const statement=(sql,values=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async all(){return {results:native.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(native.prepare(sql).run(...values).changes)}};}});
 const db={prepare:sql=>statement(sql),async batch(stmts){native.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());native.exec('COMMIT');return r;}catch(e){native.exec('ROLLBACK');throw e;}}};
 for(const id of ['owner','player'])native.prepare('INSERT INTO patrac_auth_user(id,name,nicknameKey,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,1,1,1)').run(id,id,id,id+'@example.com');
 const user={id:'owner',nickname:'owner',email:'owner@example.com'},input={confirmation:'SMAZAT ÚČET',acknowledge:true,password:'correct-password'},verifyPassword=async p=>{if(p!=='correct-password')throw Error('Wrong');};
 return {native,db,user,input,verifyPassword,remove:(extra={})=>deleteOwnAccount({db,user,input,verifyPassword,now:1000000,...extra})};
}
function seedGame(f){
 f.native.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').run('ABCDEFG','old-owner-hash',JSON.stringify({name:'Výprava',visibility:'public',status:'running',published:true,stations:[{name:'Místo',lat:49,lng:18}]}));
 f.native.prepare('INSERT INTO patrac_creator_games VALUES(?,?,1)').run('ABCDEFG','owner');
 for(const id of ['owner','player']){f.native.prepare('INSERT INTO patrac_teams(id,code,token_hash,name_key,payload,user_id) VALUES(?,?,?,?,?,?)').run(id,'ABCDEFG',id,id,JSON.stringify({id,name:id,startedAt:900000,individualStart:true,index:0,events:[]}),id);f.native.prepare('INSERT INTO patrac_public_attempts VALUES(?,?,?, ?,1,?)').run(id,'ABCDEFG',id,id,'test');}
 f.native.prepare("INSERT INTO patrac_public_reviews(code,user_id,environment,stars,comment,created_at,updated_at) VALUES('ABCDEFG','owner','test',5,'Komentář',1,1)").run();
 f.native.prepare("INSERT INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at,paid_at) VALUES('paid','owner','live','req',3,19900,'price_x',1,2)").run();
 f.native.prepare("INSERT INTO patrac_legal_acceptance VALUES('owner','purchase-immediate','paid','old','ACCEPTED TERMS',1)").run();
 f.native.prepare("INSERT INTO patrac_legal_acceptance VALUES('owner','signup','account','old','SIGNUP',1)").run();
 f.native.prepare("INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES('owner','owner','credential','owner','hash',1,1)").run();
 for(const id of ['session1','session2'])f.native.prepare('INSERT INTO patrac_auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,99999999,?,1,1,?)').run(id,id,'owner');
}
test('deletion requires explicit confirmation and own password; incorrect attempts are limited',async()=>{
 const f=fixture();await assert.rejects(()=>f.remove({input:{...f.input,acknowledge:false}}),e=>e.status===400);
 for(let i=0;i<5;i++)await assert.rejects(()=>f.remove({input:{...f.input,password:'wrong'}}),e=>e.status===401);
 await assert.rejects(()=>f.remove(),e=>e.status===429);assert.equal(f.native.prepare("SELECT name FROM patrac_auth_user WHERE id='owner'").get().name,'owner');f.native.close();
});
test('account data is removed atomically while payment evidence and other players remain intact',async()=>{
 const f=fixture();seedGame(f);
 f.native.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON patrac_auth_account BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
 await assert.rejects(()=>f.remove());assert.equal(await deletedAccount(f.db,'owner'),null);assert.equal(f.native.prepare("SELECT email FROM patrac_auth_user WHERE id='owner'").get().email,'owner@example.com');assert.equal(f.native.prepare("SELECT COUNT(*) n FROM patrac_auth_session").get().n,2);
 f.native.exec('DROP TRIGGER fail_delete');await f.remove();
 const retained=f.native.prepare("SELECT * FROM patrac_auth_user WHERE id='owner'").get();assert.equal(retained.emailVerified,0);assert.equal(retained.nicknameKey,null);assert.ok(!retained.email.includes('example.com'));assert.notEqual(retained.name,'owner');
 for(const table of ['patrac_auth_account','patrac_auth_session','patrac_public_reviews'])assert.equal(f.native.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 assert.equal(f.native.prepare("SELECT COUNT(*) n FROM patrac_teams WHERE user_id='owner'").get().n,0);assert.equal(f.native.prepare("SELECT COUNT(*) n FROM patrac_teams WHERE user_id='player'").get().n,1);
 const game=f.native.prepare("SELECT * FROM patrac_expeditions WHERE code='ABCDEFG'").get();assert.equal(JSON.parse(game.payload).deleteAt,1000000+72*3600000);assert.equal(JSON.parse(game.payload).published,true);assert.notEqual(game.owner_hash,'old-owner-hash');
 assert.equal(f.native.prepare("SELECT terms_snapshot FROM patrac_legal_acceptance WHERE reference='paid'").get().terms_snapshot,'ACCEPTED TERMS');assert.equal(f.native.prepare("SELECT COUNT(*) n FROM patrac_legal_acceptance WHERE kind='signup'").get().n,0);assert.equal((await deletedAccount(f.db,'owner')).billing_email,'owner@example.com');
 assert.equal(f.native.prepare("SELECT COUNT(*) n FROM patrac_orders WHERE id='paid'").get().n,1);
 await sweepDeletedAccounts(f.db);assert.ok(f.native.prepare("SELECT id FROM patrac_auth_user WHERE id='owner'").get());f.native.close();
});
test('an account without orders or expeditions is physically removed and does not affect another account',async()=>{
 const f=fixture();await f.remove();assert.equal(f.native.prepare("SELECT id FROM patrac_auth_user WHERE id='owner'").get(),undefined);assert.ok(f.native.prepare("SELECT id FROM patrac_auth_user WHERE id='player'").get());assert.equal((await deletedAccount(f.db,'owner')).billing_email,null);f.native.close();
});

test('scheduled expedition cleanup removes photos and its temporary owner after other players finish',async()=>{
 const f=fixture();seedGame(f);f.native.exec("DELETE FROM patrac_legal_acceptance;DELETE FROM patrac_orders");await f.remove();let deleted=[];
 const bucket={list:async()=>({objects:[{key:'hints/ABCDEFG/photo'}],truncated:false}),delete:async keys=>{deleted.push(...keys);}};
 await assert.rejects(()=>removeExpedition(f.db,bucket,{code:'ABCDEFG',userId:'owner',version:1,confirmation:'ABCDEFG',now:1000000+73*3600000}),e=>e.status===409);assert.equal(deleted.length,0);
 f.native.exec("UPDATE patrac_teams SET payload=json_set(payload,'$.finishedAt',1000001) WHERE user_id='player'");
 await removeExpedition(f.db,bucket,{code:'ABCDEFG',userId:'owner',version:1,confirmation:'ABCDEFG',now:1000000+73*3600000});await sweepDeletedAccounts(f.db);
 assert.deepEqual(deleted,['hints/ABCDEFG/photo']);assert.equal(f.native.prepare("SELECT code FROM patrac_expeditions WHERE code='ABCDEFG'").get(),undefined);assert.equal(f.native.prepare("SELECT id FROM patrac_auth_user WHERE id='owner'").get(),undefined);assert.ok(f.native.prepare("SELECT id FROM patrac_auth_user WHERE id='player'").get());f.native.close();
});
