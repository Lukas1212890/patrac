import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {creatorNotices} from '../worker/lib/creatorNotices.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');
 for(const file of ['0002_creator_auth.sql','0003_account_admin.sql','0007_creator_rewards.sql'])native.exec(readFileSync('drizzle/'+file,'utf8'));
 for(const id of ['player','other'])native.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)').run(id,id,id+'@example.com');
 const prepare=(sql,values=[])=>({bind:(...v)=>prepare(sql,v),async all(){return{results:native.prepare(sql).all(...values)};},async first(){return native.prepare(sql).get(...values)||null;}});
 const audit=(id,action,details,stamp,status='success',target='player')=>native.prepare('INSERT INTO patrac_admin_audit VALUES(?,?,?,?,?,?,?)').run(id,'secret-admin-id',target,action,JSON.stringify({...details,operation:'private-operation',reason:details.reason||'internal admin note'}),status,stamp);
 const reward=(code,environment,stamp,milestone=100,user='player')=>native.prepare('INSERT INTO patrac_creator_rewards VALUES(?,?,?,?,?,2,?,?,?)').run(code,user,environment,milestone,'Lesní výprava',stamp,stamp+100000,code+environment+milestone);
 return{native,db:{prepare},audit,reward};
}
test('profile notices combine successful admin changes and automatic rewards, isolate accounts/environments and expose only safe fields',async()=>{
 const f=fixture();
 f.audit('deleted','delete-expedition',{code:'ABCDEFG',name:'Smazaná výprava',reason:'Uzavřená cesta'},1000);
 f.audit('access-test','access',{environment:'test',months:3,expiresAt:123456},2000);
 f.audit('access-live','access',{environment:'live',months:12,expiresAt:987654},3000);
 f.audit('failed','access',{environment:'test',months:6},4000,'failed');
 f.audit('limits','limits',{oldPrivateLimit:3,privateLimit:5,oldPublicLimit:2,publicLimit:4},5000);
 f.audit('unchanged','limits',{oldPrivateLimit:5,privateLimit:5,oldPublicLimit:4,publicLimit:4},8000);
 f.audit('other','delete-expedition',{code:'PRIVATE',name:'Other account'},9000,'success','other');
 f.audit('pending','delete-expedition',{code:'PENDING'},10000,'reserved');
 f.reward('REWARD1','test',6000);f.reward('REWARD2','live',7000);f.reward('OTHER12','test',11000,100,'other');
 const result=await creatorNotices(f.db,'player','test');assert.deepEqual(result.notices.map(n=>n.type),['reward','limits','access','delete-expedition']);
 assert.equal(result.notices[0].milestone,100);assert.equal(result.notices[0].months,2);assert.equal(result.notices[1].privateLimit,5);assert.equal(result.notices[2].expiresAt,123456);assert.equal(result.notices[3].reason,'Uzavřená cesta');
 const text=JSON.stringify(result);for(const secret of ['secret-admin-id','internal admin note','private-operation','OTHER12','PRIVATE','PENDING','REWARD2','actor_id','user_id'])assert.equal(text.includes(secret),false,secret);
 assert.deepEqual(await creatorNotices(f.db,'player','test'),result);
 const live=await creatorNotices(f.db,'player','live');assert.ok(live.notices.some(n=>n.months===12));assert.equal(live.notices.some(n=>n.id==='access-test'||n.code==='REWARD1'),false);
 f.native.close();
});
test('notification history keeps only latest fifty events with stable ids and tolerates staged missing tables',async()=>{
 const empty=new DatabaseSync(':memory:');const db={prepare:sql=>({async all(){return{results:empty.prepare(sql).all()};}})};assert.deepEqual(await creatorNotices(db,'player','test'),{notices:[]});empty.close();
 const f=fixture();for(let i=0;i<60;i++)f.audit('event-'+i,'access',{environment:'test',months:3,expiresAt:i+100000},i+1);
 const result=await creatorNotices(f.db,'player','test');assert.equal(result.notices.length,50);assert.equal(result.notices[0].id,'event-59');assert.equal(result.notices.at(-1).id,'event-10');assert.deepEqual(await creatorNotices(f.db,'missing','test'),{notices:[]});f.native.close();
});
