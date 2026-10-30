import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {adminInbox,readAdminInbox} from '../worker/lib/adminInbox.mjs';
function fixture(){const native=new DatabaseSync(':memory:');for(const f of ['0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql'])native.exec(readFileSync('drizzle/'+f,'utf8'));const stmt=(sql,v=[])=>({bind:(...v)=>stmt(sql,v),async first(){return native.prepare(sql).get(...v)||null;},async all(){return{results:native.prepare(sql).all(...v)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...v).changes)}};}});const db={prepare:stmt,async batch(ss){native.exec('BEGIN');try{const results=[];for(const s of ss)results.push(await s.run());native.exec('COMMIT');return results;}catch(e){native.exec('ROLLBACK');throw e;}}};for(const id of ['admin','second'])native.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,1,1)').run(id,id,id+'@example.com');return{native,db};}
test('admin inbox hydrates who, when, paid length and expiry; survives dismissed push and read state persists per admin',async()=>{
 const f=fixture(),secret='local-admin-inbox-secret-not-for-production';
 await adminInbox(f.db,'admin',{secret});const stamp=f.native.prepare('SELECT created_at FROM patrac_push_config').get().created_at+1;
 f.native.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)').run('player','Hráč','player@example.com',stamp,stamp);
 f.native.prepare("INSERT INTO patrac_orders(id,user_id,environment,request_key,months,amount,price_id,created_at,paid_at,access_until) VALUES('order1','player','live','key',6,34900,'price',?,?,?)").run(stamp,stamp+1,stamp+100000);
 let inbox=await adminInbox(f.db,'admin',{secret});assert.equal(inbox.unread,2);assert.equal(inbox.events[0].nickname,'Hráč');assert.equal(inbox.events[0].email,'player@example.com');assert.equal(inbox.events[0].months,6);assert.equal(inbox.events[0].paidAt,stamp+1);assert.equal(inbox.events[0].accessUntil,stamp+100000);assert.equal(inbox.events[0].amount,34900);
 const payload=JSON.parse(f.native.prepare("SELECT payload FROM patrac_push_events WHERE id='payment:order1'").get().payload);assert.match(payload.body,/Hráč/);assert.match(payload.body,/6 měsíců/);assert.equal(JSON.stringify(payload).includes('player@example.com'),false);
 await readAdminInbox(f.db,'admin',{action:'read',id:'payment:order1'});assert.equal((await adminInbox(f.db,'admin',{secret})).unread,1);assert.equal((await adminInbox(f.db,'second',{secret})).unread,2);
 f.native.prepare("UPDATE patrac_push_events SET payload='{}'").run();inbox=await adminInbox(f.db,'admin',{secret,notice:'payment:order1'});assert.equal(inbox.selected.months,6);assert.equal(inbox.selected.read,true);
 const watermark=inbox.latest;f.native.prepare("INSERT INTO patrac_push_events VALUES('registration:newer','{}',?)").run(stamp); // A new event with an older timestamp must stay unread too.

 await readAdminInbox(f.db,'admin',{action:'read-all',latest:watermark});assert.equal((await adminInbox(f.db,'admin',{secret})).unread,1);
 inbox=await adminInbox(f.db,'admin',{secret});await readAdminInbox(f.db,'admin',{action:'read-all',latest:inbox.latest});assert.equal((await adminInbox(f.db,'admin',{secret})).unread,0);
 await assert.rejects(()=>readAdminInbox(f.db,'admin',{action:'read',id:'test:untrusted'}));await assert.rejects(()=>adminInbox(f.db,'admin',{secret,page:-1}));f.native.close();
});
