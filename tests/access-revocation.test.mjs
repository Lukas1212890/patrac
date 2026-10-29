import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createAdminService} from '../worker/lib/adminService.mjs';
import {addMonths} from '../worker/lib/billing.mjs';
import {carryAdminAccess} from '../worker/lib/adminAccessCarryover.mjs';
import {creatorNotices} from '../worker/lib/creatorNotices.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 let stamp=Date.UTC(2026,0,31,12),serial=0;
 for(const id of ['admin','user'])native.prepare('INSERT INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',stamp,stamp);
 native.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').run('admin',stamp);
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),async first(){return native.prepare(sql).get(...args)||null;},async all(){return{results:native.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...args).changes)}};}});
 const db={prepare:sql=>statement(sql),async batch(items){native.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const current=mode=>native.prepare('SELECT * FROM patrac_access WHERE user_id=? AND environment=?').get('user',mode);
 const api=mode=>createAdminService({db,billingMode:mode,now:()=>stamp,getSession:async role=>role?{user:{id:role==='admin'||role==='stale'?'admin':'user',emailVerified:true},session:{createdAt:role==='stale'?stamp-3600000:stamp}}:null});
 async function gift(months=12,mode='test'){
  const key='test-gift-request-'+(++serial),result=await api(mode).change('admin',{action:'access',id:'user',environment:mode,months,version:current(mode)?.version??0,reason:'Za testování',requestKey:key});assert.equal(result.ok,true);return 'access_'+key;
 }
 function pay(months=3,mode='test'){
  native.prepare('INSERT OR IGNORE INTO patrac_access(user_id,environment) VALUES(?,?)').run('user',mode);
  const until=addMonths(Math.max(stamp,current(mode).expires_at),months),id='order-'+(++serial);
  native.prepare('INSERT INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at,paid_at,access_until) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'user',mode,id,months,19900,'price_fixture',stamp,stamp,until);
  native.prepare('UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id=? AND environment=?').run(until,'user',mode);return id;
 }
 async function input(reference,mode='test'){const preview=await api(mode).previewAccess('admin','user',reference);return{action:'access-revoke',id:'user',environment:mode,reference,reason:'Oprava omylem přiděleného přístupu',versions:Object.fromEntries(preview.plans.map(p=>[p.environment,p.version])),requestKey:'test-revoke-request-'+(++serial)};}
 return{native,db,current,api,gift,pay,input,get stamp(){return stamp;},advance:days=>stamp+=days*86400000};
}
test('admin gift is removed once in test and live, with a specific notification and no carryover resurrection',async()=>{
 const f=fixture();try{
 const ref=await f.gift(12);f.advance(7);const input=await f.input(ref);const api=f.api('test');
 assert.equal((await api.change('admin',input)).ok,true);
 for(const mode of ['test','live']){assert.equal(f.current(mode).expires_at,f.stamp);const notices=await creatorNotices(f.db,'user',mode);const notice=notices.notices.find(n=>n.type==='access-revoke');assert.ok(notice);assert.equal(notice.reason,input.reason);assert.equal(notice.expiresAt,f.stamp);}
 const version=f.current('test').version;await api.change('admin',input);assert.equal(f.current('test').version,version);
 await carryAdminAccess(f.db,'user');assert.equal(f.current('live').expires_at,f.stamp);
 const detail=await api.detail('admin','user');assert.ok(detail.billing.subscription.history.find(g=>g.reference===ref).revokedAt);assert.deepEqual(detail.billing.subscription.sources,[]);
 await assert.rejects(()=>api.change('admin',{...input,reason:'Jiný důvod'}),e=>e.status===409);
 }finally{f.native.close();}
});
test('removing a partially consumed gift preserves subsequent paid duration, other gifts and later new payments',async()=>{
 const f=fixture();try{
 const ref=await f.gift(3);f.advance(10);const paid=f.pay(6);f.advance(5);const laterGift=await f.gift(3);
 const original=f.native.prepare('SELECT * FROM patrac_orders WHERE id=?').get(paid),giftEnd=addMonths(Date.UTC(2026,0,31,12),3),removed=giftEnd-f.stamp,old=f.current('test').expires_at;
 await f.api('test').change('admin',await f.input(ref));assert.equal(f.current('test').expires_at,old-removed);
 assert.deepEqual(f.native.prepare('SELECT * FROM patrac_orders WHERE id=?').get(paid),original);
 let detail=await f.api('test').detail('admin','user');assert.deepEqual(detail.billing.subscription.sources,['admin','paid']);assert.equal(detail.billing.subscription.paidMonths,6);assert.equal(detail.billing.subscription.adminMonths,3);
 f.advance(1);f.pay(3);const before=f.current('test').expires_at,preview=await f.api('test').previewAccess('admin','user',laterGift),delta=preview.plans.find(p=>p.environment==='test').removedMs;
 await f.api('test').change('admin',await f.input(laterGift));assert.equal(f.current('test').expires_at,before-delta);
 detail=await f.api('test').detail('admin','user');assert.deepEqual(detail.billing.subscription.sources,['paid']);assert.equal(detail.billing.subscription.paidMonths,9);
 }finally{f.native.close();}
});
test('paid access before a future gift is never removed; creator rewards retain their duration',async()=>{
 const f=fixture();try{
 f.pay(3,'live');const paidEnd=f.current('live').expires_at,ref=await f.gift(12,'live'),giftEnd=f.current('live').expires_at;
 f.native.exec('CREATE TABLE patrac_creator_rewards(user_id TEXT,environment TEXT,months INTEGER,granted_at INTEGER,access_until INTEGER,code TEXT,milestone INTEGER,expedition_name TEXT)');
 const rewardEnd=addMonths(giftEnd,2);f.native.prepare('INSERT INTO patrac_creator_rewards VALUES(?,?,?,?,?,?,?,?)').run('user','live',2,f.stamp,rewardEnd,'CODE',100,'Odměněná výprava');f.native.prepare("UPDATE patrac_access SET expires_at=?,version=version+1 WHERE user_id='user' AND environment='live'").run(rewardEnd);
 f.advance(1);await f.api('live').change('admin',await f.input(ref,'live'));assert.equal(f.current('live').expires_at,paidEnd+(rewardEnd-giftEnd));
 const detail=await f.api('live').detail('admin','user');assert.deepEqual(detail.billing.subscription.sources,['paid','reward']);assert.equal(detail.billing.subscription.rewardMonths,2);
 assert.equal(f.current('test'),undefined);
 }finally{f.native.close();}
});
test('stale preview, wrong role, expired admin login and non-admin grants cannot revoke access',async()=>{
 const f=fixture();try{
 const ref=await f.gift(12),input=await f.input(ref);f.pay(3);
 await assert.rejects(()=>f.api('test').change('admin',input),e=>e.status===409);assert.equal(JSON.parse(f.native.prepare('SELECT details FROM patrac_admin_audit WHERE id=?').get(ref).details).revokedAt,undefined);
 for(const [role,status]of [[null,401],['user',403],['stale',428]])await assert.rejects(()=>f.api('test').change(role,input),e=>e.status===status);
 await assert.rejects(()=>f.api('test').previewAccess('admin','user','order-999'),e=>e.status===404);
 const fresh=await f.input(ref);await assert.rejects(()=>f.api('test').change('admin',{...fresh,reason:''}),e=>e.status===400);
 }finally{f.native.close();}
});
test('failed transaction rolls back expiry, audit, grant marker and segment overrides together',async()=>{
 const f=fixture();try{
 const ref=await f.gift(12),input=await f.input(ref),before=f.current('test').expires_at;
 f.native.exec("CREATE TRIGGER fail_revoke BEFORE UPDATE ON patrac_access BEGIN SELECT RAISE(ABORT,'simulated failure');END");
 await assert.rejects(()=>f.api('test').change('admin',input),/simulated failure/);
 assert.equal(f.current('test').expires_at,before);assert.equal(f.native.prepare("SELECT COUNT(*) n FROM patrac_admin_audit WHERE action='access-revoke'").get().n,0);assert.equal(f.native.prepare('SELECT COUNT(*) n FROM patrac_access_segments').get().n,0);
 assert.equal(JSON.parse(f.native.prepare('SELECT details FROM patrac_admin_audit WHERE id=?').get(ref).details).revokedAt,undefined);
 f.native.exec('DROP TRIGGER fail_revoke');await f.api('test').change('admin',input);assert.equal(f.current('test').expires_at,f.stamp);
 }finally{f.native.close();}
});
test('fully consumed gifts cannot shorten an unrelated newer paid period',async()=>{
 const f=fixture();try{
 const ref=await f.gift(3);f.advance(150);f.pay(6);const until=f.current('test').expires_at;
 await assert.rejects(()=>f.api('test').previewAccess('admin','user',ref),/vyčerpané/);assert.equal(f.current('test').expires_at,until);
 }finally{f.native.close();}
});
