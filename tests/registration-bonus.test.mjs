import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerBonusEligibility,grantRegistrationBonus} from '../worker/lib/registrationBonus.mjs';
import {addMonths} from '../worker/lib/billing.mjs';
import {subscriptionHistory} from '../worker/lib/adminSubscriptions.mjs';
import {creatorNotices} from '../worker/lib/creatorNotices.mjs';
function fixture(){
 const native=new DatabaseSync(':memory:');
 for(const f of ['0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql'])native.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 let fail=false;
 const statement=(sql,v=[])=>({bind:(...v)=>statement(sql,v),async first(){return native.prepare(sql).get(...v)||null;},async all(){return{results:native.prepare(sql).all(...v)};},async run(){return{meta:{changes:Number(native.prepare(sql).run(...v).changes)}};}});
 const db={prepare:statement,async batch(statements){native.exec('BEGIN');try{const out=[];for(const s of statements){out.push(await s.run());if(fail){fail=false;throw Error('transaction failure');}}native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}}};
 const now=Date.UTC(2026,9,31,12);
 for(const id of ['new','old','live'])native.prepare('INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)').run(id,id,id+'@example.com',now,now);
 return{native,db,now,fail:()=>fail=true};
}
test('only newly registered test accounts receive one verified three calendar month grant, with distinct admin history and notice',async()=>{
 const f=fixture();
 await registerBonusEligibility(f.db,'new','test',f.now);await registerBonusEligibility(f.db,'live','live',f.now);
 assert.equal(await grantRegistrationBonus(f.db,'new',f.now),false);
 f.native.exec('UPDATE patrac_auth_user SET emailVerified=1');
 assert.equal(await grantRegistrationBonus(f.db,'old',f.now),false);assert.equal(await grantRegistrationBonus(f.db,'live',f.now),false);
 assert.equal(await grantRegistrationBonus(f.db,'new',f.now),true);
 const expected=addMonths(f.now,3),access=f.native.prepare('SELECT * FROM patrac_access').get();assert.equal(access.expires_at,expected);assert.equal(access.environment,'test');
 await registerBonusEligibility(f.db,'new','test',f.now+1000);assert.equal(await grantRegistrationBonus(f.db,'new',expected+1000),false);assert.equal(f.native.prepare('SELECT version FROM patrac_access').get().version,1);
 const summary=await subscriptionHistory(f.db,'new','test',f.now);assert.deepEqual(summary.sources,['registration']);assert.equal(summary.registrationMonths,3);assert.equal(summary.history[0].source,'registration');
 assert.equal((await creatorNotices(f.db,'new','test')).notices[0].type,'registration-bonus');assert.equal((await creatorNotices(f.db,'new','live')).notices.length,0);
 assert.equal((await subscriptionHistory(f.db,'new','live',f.now)).active,false);f.native.close();
});
test('rollback leaves bonus retryable and existing access is extended rather than replaced',async()=>{
 const f=fixture();f.native.exec("UPDATE patrac_auth_user SET emailVerified=1 WHERE id='new'");await registerBonusEligibility(f.db,'new','test',f.now);
 const paidUntil=addMonths(f.now,6);f.native.prepare("INSERT INTO patrac_access VALUES('new','test',?,4)").run(paidUntil);
 f.fail();await assert.rejects(()=>grantRegistrationBonus(f.db,'new',f.now));assert.equal(f.native.prepare('SELECT granted_at FROM patrac_registration_bonus').get().granted_at,null);assert.equal(f.native.prepare('SELECT expires_at FROM patrac_access').get().expires_at,paidUntil);
 assert.equal(await grantRegistrationBonus(f.db,'new',f.now),true);assert.equal(f.native.prepare('SELECT expires_at FROM patrac_access').get().expires_at,addMonths(paidUntil,3));f.native.close();
});
