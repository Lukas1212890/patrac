import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createAdminService} from '../worker/lib/adminService.mjs';
import {subscriptionHistory} from '../worker/lib/adminSubscriptions.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');
 for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql'])native.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const stamp=Date.UTC(2026,9,29,12),day=86400000;
 const statement=(sql,args=[])=>({bind:(...a)=>statement(sql,a),async first(){return native.prepare(sql).get(...args)||null;},async all(){return{results:native.prepare(sql).all(...args)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...args).changes)}};}});
 const db={prepare:sql=>statement(sql),async batch(items){native.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const user=(id,until=0,env='test')=>{native.prepare('INSERT OR IGNORE INTO patrac_auth_user VALUES(?,?,?,1,NULL,?,?)').run(id,id,id+'@example.com',stamp,stamp);native.prepare('INSERT OR REPLACE INTO patrac_access(user_id,environment,expires_at) VALUES(?,?,?)').run(id,env,until);};
 user('admin');native.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').run('admin',stamp);
 const paid=(id,months,until,{env='test',unpaid=false}={})=>native.prepare('INSERT INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at,paid_at,access_until) VALUES(?,?,?,?,?,?,?,?,?,?)').run('paid-'+id+'-'+env,id,env,'request-'+id,months,19900,'price_fixture',stamp-1000,unpaid?null:stamp-1000,until);
 const gift=(id,months,until,{env='test',status='success',liveUntil=null}={})=>native.prepare('INSERT INTO patrac_admin_audit VALUES(?,?,?,?,?,?,?)').run('gift-'+id+'-'+env,'admin',id,'access',JSON.stringify({environment:env,months,expiresAt:until,reason:'Za testování',...(liveUntil?{liveApplied:'transfer',liveExpiresAt:liveUntil}:{})}),status,stamp-500);
 const api=mode=>createAdminService({db,billingMode:mode,getSession:async r=>r==='admin'?{user:{id:'admin',emailVerified:true},session:{createdAt:stamp}}:r==='regular'?{user:{id:'paid',emailVerified:true},session:{createdAt:stamp}}:null,now:()=>stamp});
 return{native,db,stamp,day,user,paid,gift,api};
}
test('admin list classifies paid, gifted, mixed, expired, unpaid and unknown access and filters before pagination',async()=>{
 const f=fixture(),{stamp,day}=f;
 f.user('paid',stamp+60*day);f.paid('paid',3,stamp+60*day);
 f.user('gift',stamp+365*day);f.gift('gift',12,stamp+365*day);
 f.user('mixed',stamp+400*day);f.paid('mixed',3,stamp+30*day);f.gift('mixed',12,stamp+400*day);
 f.user('old-paid-new-gift',stamp+15*day);f.paid('old-paid-new-gift',3,stamp-day);f.gift('old-paid-new-gift',6,stamp+15*day);
 f.user('expired',stamp-day);f.paid('expired',6,stamp-day);
 f.user('never');f.paid('never',3,null,{unpaid:true});
 f.user('unknown',stamp+day);f.gift('unknown',12,stamp+day,{status:'failed'});
 for(let i=0;i<27;i++){const id='extra-'+i;f.user(id,stamp+365*day);f.gift(id,12,stamp+365*day);}
 const api=f.api('test'),list=q=>api.list('admin',q),ids=result=>result.users.map(u=>u.id).sort();
 assert.deepEqual(ids(await list({source:'paid',status:'active'})),['mixed','paid']);
 assert.deepEqual(ids(await list({source:'mixed'})),['mixed']);
 assert.deepEqual(ids(await list({status:'expired',source:'paid',months:'6'})),['expired']);
 assert.deepEqual(ids(await list({source:'admin',ending:'30'})),['old-paid-new-gift']);
 assert.equal((await list({source:'admin',months:'12'})).total,29);
 assert.equal((await list({source:'admin',months:'12',page:1})).users.length,9);
 assert.equal((await list({source:'paid',months:'12'})).total,0); // 12 months on mixed belongs to admin, not payment.
 assert.deepEqual(ids(await list({source:'unknown'})),['unknown']);
 assert.deepEqual(ids(await list({q:'never',status:'none'})),['never']);
 const paid=(await list({q:'paid',source:'paid',status:'active'})).users[0].subscription;assert.equal(paid.environment,'test');assert.deepEqual(paid.sources,['paid']);assert.equal(paid.paidMonths,3);
 const detail=await api.detail('admin','mixed');assert.deepEqual(detail.billing.subscription.sources,['admin','paid']);assert.equal(detail.billing.subscription.history.length,2);
 const gifts=(await list({q:'old-paid-new-gift'})).users[0].subscription;assert.deepEqual(gifts.sources,['admin']);assert.equal(gifts.adminMonths,6);
 for(const q of [{source:'bad'},{status:'sql'},{months:'100'},{ending:'-1'},{page:-1}])await assert.rejects(()=>list(q),e=>e.status===400);
 for(const role of [null,'regular'])await assert.rejects(()=>api.list(role,{}),e=>e.status===401||e.status===403);
 f.native.close();
});
test('live sources include carried admin gifts once, exclude sandbox payments, preserve exact grant history and optional rewards',async()=>{
 const f=fixture(),{stamp,day}=f;f.user('gift',stamp+500*day);f.user('gift',stamp+30*day,'live');f.paid('gift',12,stamp+500*day);f.gift('gift',3,stamp+500*day,{liveUntil:stamp+30*day});
 const live=await f.api('live').list('admin',{q:'gift'});assert.deepEqual(live.users[0].subscription.sources,['admin']);assert.equal(live.users[0].subscription.paidMonths,0);assert.equal(live.users[0].subscription.adminMonths,3);
 let history=await subscriptionHistory(f.db,'gift','live',stamp);assert.equal(history.history.length,1);assert.equal(history.history[0].reason,'Za testování');assert.equal(history.history[0].accessUntil,stamp+30*day);
 f.native.exec('CREATE TABLE patrac_creator_rewards(user_id TEXT,environment TEXT,months INTEGER,granted_at INTEGER,access_until INTEGER,code TEXT,milestone INTEGER,expedition_name TEXT)');
 f.native.prepare('INSERT INTO patrac_creator_rewards VALUES(?,?,?,?,?,?,?,?)').run('gift','live',2,stamp,stamp+90*day,'CODE',100,'Moje výprava');
 const result=await f.api('live').list('admin',{source:'reward',months:'2'});assert.equal(result.total,1);assert.deepEqual(result.users[0].subscription.sources,['admin','reward']);
 history=await subscriptionHistory(f.db,'gift','live',stamp);assert.equal(history.history.length,2);assert.equal(history.history[0].months,2);
 f.native.close();
});
test('accounts remain listable without billing enabled or billing tables',async()=>{
 const f=fixture();f.native.exec('DROP TABLE patrac_orders;DROP TABLE patrac_access');const result=await f.api('').list('admin',{});assert.equal(result.users[0].subscription,null);assert.equal(result.billingEnvironment,null);f.native.close();
});
