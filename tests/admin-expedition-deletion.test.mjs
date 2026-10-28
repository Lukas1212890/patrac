import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createAdminService} from '../worker/lib/adminService.mjs';
import {creatorNotices} from '../worker/lib/creatorNotices.mjs';
import {removeExpedition} from '../worker/lib/expeditionLifecycle.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');native.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql','0005_public_expeditions.sql','0006_public_reviews.sql','0007_creator_rewards.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const stamp=Date.now();for(const id of ['admin','creator','other'])native.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',stamp,stamp);
 native.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').run('admin',stamp);
 let photoFailure=false,finalFailure=false,initialFailure=false;
 const statement=(sql,values=[])=>({sql,bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...values)||null;},async all(){return{results:native.prepare(sql).all(...values)};},execute(){return{meta:{changes:Number(native.prepare(sql).run(...values).changes)}};},async run(){return this.execute();}});
 const db={prepare:sql=>statement(sql),async batch(statements){native.exec('BEGIN');try{const out=[];for(const s of statements){out.push(s.execute());if(initialFailure&&s.sql.includes('INSERT OR IGNORE INTO patrac_admin_audit')){initialFailure=false;throw Error('initial transaction interrupted');}if(finalFailure&&s.sql.includes("SET status='success'")){finalFailure=false;throw Error('final transaction interrupted');}}native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const photos=new Set(['hints/ABCDEFG/photo','hints/HJKLMNP/keep']);const bucket={async list({prefix}){if(photoFailure)throw Error('R2 temporarily unavailable');return{objects:[...photos].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};},async delete(keys){keys.forEach(k=>photos.delete(k));}};
 for(const code of ['ABCDEFG','HJKLMNP']){native.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').run(code,'owner-'+code,JSON.stringify({name:'Výprava '+code,status:'running',visibility:'public',published:true,stations:[]}));native.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').run(code,code==='ABCDEFG'?'creator':'other',stamp);}
 native.prepare('INSERT INTO patrac_teams VALUES(?,?,?,?,?,0)').run('team','ABCDEFG','token','name',JSON.stringify({finishedAt:stamp,startedAt:stamp-1000}));native.prepare("INSERT INTO patrac_public_attempts VALUES('attempt','ABCDEFG','other','team',?,'test')").run(stamp);native.prepare("INSERT INTO patrac_public_reviews VALUES('ABCDEFG','other','test',5,'Pěkné',?,?)").run(stamp,stamp);
 native.prepare("INSERT INTO patrac_access VALUES('creator','test',?,1)").run(stamp+99999999);native.prepare("INSERT INTO patrac_creator_rewards VALUES('ABCDEFG','creator','test',100,'Výprava ABCDEFG',2,?,?,'activation')").run(stamp,stamp+99999999);
 const sessions={admin:{user:{id:'admin',emailVerified:true},session:{createdAt:stamp}},creator:{user:{id:'creator',emailVerified:true},session:{createdAt:stamp}},stale:{user:{id:'admin',emailVerified:true},session:{createdAt:stamp-3600000}}};
 const api=createAdminService({db,bucket,getSession:async req=>sessions[req],sendReset:async()=>{},sendVerification:async()=>{},now:()=>stamp});
 const input={action:'delete-expedition',id:'creator',code:'ABCDEFG',version:0,confirmation:'ABCDEFG',reason:'Výprava vede na uzavřený soukromý pozemek.',requestKey:'request-key-delete-123456'};
 return{native,db,api,input,photos,photoFailure:value=>photoFailure=value,initialFailure:()=>initialFailure=true,finalFailure:()=>finalFailure=true};
}
test('admin deletion requires a fresh real role, reason, confirmation, ownership and current revision',async()=>{
 const f=fixture();for(const [session,status] of [[null,401],['creator',403],['stale',428]])await assert.rejects(()=>f.api.change(session,f.input),e=>e.status===status);
 for(const change of [{reason:''},{reason:'a'.repeat(501)},{confirmation:'HJKLMNP'},{version:-1}])await assert.rejects(()=>f.api.change('admin',{...f.input,...change}),e=>e.status===400);
 await assert.rejects(()=>f.api.change('admin',{...f.input,id:'other'}),e=>e.status===404);await assert.rejects(()=>f.api.change('admin',{...f.input,version:9}),e=>e.status===409);
 assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_admin_audit').get().n,0);assert.equal(f.photos.size,2);f.native.close();
});
test('deletion cleans only the selected route and atomically creates one private creator notice with the reason',async()=>{
 const f=fixture(),expiry=f.native.prepare("SELECT expires_at FROM patrac_access WHERE user_id='creator'").get().expires_at;
 assert.equal((await f.api.change('admin',f.input)).ok,true);assert.equal(f.native.prepare("SELECT code FROM patrac_expeditions WHERE code='ABCDEFG'").get(),undefined);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_public_attempts').get().n,0);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_public_reviews').get().n,0);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_teams').get().n,0);
 assert.deepEqual([...f.photos],['hints/HJKLMNP/keep']);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_creator_rewards').get().n,1);assert.equal(f.native.prepare("SELECT expires_at FROM patrac_access WHERE user_id='creator'").get().expires_at,expiry);
 const notices=await creatorNotices(f.db,'creator');assert.equal(notices.notices.length,1);assert.equal(notices.notices[0].reason,f.input.reason);assert.equal(notices.notices[0].name,'Výprava ABCDEFG');assert.equal((await creatorNotices(f.db,'other')).notices.length,0);const text=JSON.stringify(notices);for(const secret of ['actor_id','admin@example.com','creator@example.com','token','owner-'])assert.equal(text.includes(secret),false);
 const audit=f.native.prepare('SELECT * FROM patrac_admin_audit').get();assert.equal(audit.actor_id,'admin');assert.equal(audit.target_id,'creator');assert.equal(audit.status,'success');
 assert.equal((await f.api.change('admin',f.input)).ok,true);assert.equal((await creatorNotices(f.db,'creator')).notices.length,1);await assert.rejects(()=>f.api.change('admin',{...f.input,reason:'Odlišný důvod pro tutéž akci.'}),e=>e.status===409);f.native.close();
});
test('failed photo cleanup retains ownership, reason and retry key; notification appears only after successful retry',async()=>{
 const f=fixture();f.photoFailure(true);await assert.rejects(()=>f.api.change('admin',f.input),e=>e.code==='ADMIN_DELETE_PENDING');assert.equal((await creatorNotices(f.db,'creator')).notices.length,0);
 const detail=await f.api.detail('admin','creator');assert.equal(detail.games[0].status,'deleting');assert.equal(detail.games[0].deletion.reason,f.input.reason);assert.equal(detail.games[0].deletion.requestKey,f.input.requestKey);assert.equal(detail.games[0].version,1);
 f.photoFailure(false);await f.api.change('admin',f.input);assert.equal((await creatorNotices(f.db,'creator')).notices.length,1);f.native.close();
});
test('transaction failures do not publish false notices and owner completion also finalizes a pending admin deletion',async()=>{
 const f=fixture();f.initialFailure();await assert.rejects(()=>f.api.change('admin',f.input));assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_admin_audit').get().n,0);assert.equal(JSON.parse(f.native.prepare("SELECT payload FROM patrac_expeditions WHERE code='ABCDEFG'").get().payload).status,'running');
 f.finalFailure();await assert.rejects(()=>f.api.change('admin',f.input));assert.equal((await creatorNotices(f.db,'creator')).notices.length,0);assert.equal(f.native.prepare('SELECT COUNT(*) AS n FROM patrac_teams').get().n,1);
 const row=f.native.prepare("SELECT version FROM patrac_expeditions WHERE code='ABCDEFG'").get();await removeExpedition(f.db,{list:async()=>({objects:[],truncated:false}),delete:async()=>{}},{code:'ABCDEFG',userId:'creator',version:row.version,confirmation:'ABCDEFG'});assert.equal((await creatorNotices(f.db,'creator')).notices.length,1);assert.equal((await f.api.change('admin',f.input)).ok,true);f.native.close();
});
