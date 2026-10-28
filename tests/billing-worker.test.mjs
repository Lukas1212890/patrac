import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {hashPassword} from 'better-auth/crypto';
import {validateExpedition,newTeam} from '../worker/lib/patrac-engine.mjs';
test('real Worker requires account and paid access, verifies webhook signature, and preserves anonymous play',async()=>{
 const built=await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],write:false,logLevel:'silent'});
 const secret='whsec_local_worker_fixture';
 const mf=new Miniflare({modules:[{type:'ESModule',path:process.cwd()+'/worker/billing-test.mjs',contents:built.outputFiles[0].text}],modulesRoot:process.cwd(),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],cf:false,d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{PATRAC_AUTH_SECRET:'local-billing-worker-test-key-never-used-in-production',PATRAC_AUTH_BASE_URL:'http://localhost:8790',PATRAC_ALLOWED_ORIGINS:'http://localhost:3000',PATRAC_REGISTRATION_READY:'false',PATRAC_BILLING_ENABLED:'true',PATRAC_STRIPE_MODE:'test',STRIPE_WEBHOOK_SECRET:secret}});
 const request=(path,body,token,origin='http://localhost:3000')=>mf.dispatchFetch('http://localhost:8790'+path,{method:body?'POST':'GET',headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json',...(token?{'X-Patrac-Account':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
  assert.equal((await request('/api/billing')).status,401);
  const db=await mf.getD1Database('DB');
  for(const file of ['0000_common_silverclaw.sql','0001_strange_vanisher.sql','0002_creator_auth.sql','0003_account_admin.sql','0004_billing.sql'])for(const sql of readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const stamp=Date.now(),password='native-worker-billing-test-password',hash=await hashPassword(password);
  await db.prepare("INSERT INTO patrac_auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('user','Tester','user@example.com',1,?,?)").bind(stamp,stamp).run();
  await db.prepare("INSERT INTO patrac_auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES('user','user','credential','user',?,?,?)").bind(hash,stamp,stamp).run();
  const login=await request('/api/auth/sign-in/email',{email:'user@example.com',password});assert.equal(login.status,200);const token=login.headers.get('set-auth-token');
  const state=await request('/api/billing',null,token);assert.equal(state.status,200);assert.equal((await state.json()).active,false);
  assert.equal((await request('/api/billing/checkout',{months:3,requestKey:crypto.randomUUID()},token,'')).status,403);
  assert.equal((await request('/api/expeditions',{name:'Cannot create'},token)).status,402);
  const game={...validateExpedition({name:'Saved game',mode:'race',stations:[{name:'Dub',lat:49.3,lng:17.39,radius:25,question:'Otázka',answer:'stín',hints:[]}]}),status:'waiting',startedAt:null};
  await db.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').bind('ABCDEFG','old-owner-hash',JSON.stringify(game)).run();
  await db.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').bind('ABCDEFG','user',stamp).run();
  assert.equal((await request('/api/expeditions/ABCDEFG',null,token)).status,200);
  assert.equal((await request('/api/expeditions/ABCDEFG',{action:'save',game},token)).status,402);
  assert.equal((await request('/api/expeditions/ABCDEFG',{action:'start'},token)).status,402);
  const teamToken='a'.repeat(64);assert.equal((await request('/api/expeditions/ABCDEFG',{action:'join',name:'Anonymous team',teamToken})).status,201);
  game.status='running';game.startedAt=Date.now();await db.prepare('UPDATE patrac_expeditions SET payload=? WHERE code=?').bind(JSON.stringify(game),'ABCDEFG').run();
  const arrive=await mf.dispatchFetch('http://localhost:8790/api/expeditions/ABCDEFG',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',Authorization:'Bearer '+teamToken},body:JSON.stringify({action:'arrive',index:0,position:{lat:49.3,lng:17.39,acc:5,timestamp:Date.now()}})});assert.equal(arrive.status,200,await arrive.clone().text());
  assert.equal((await request('/api/billing/webhook',{type:'checkout.session.completed'},null,'')).status,400);
  const raw=JSON.stringify({type:'unrelated.event',livemode:false}),time=Math.floor(Date.now()/1000);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(time+'.'+raw))).toString('hex');
  const hook=await mf.dispatchFetch('http://localhost:8790/api/billing/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${time},v1=${signature}`},body:raw});assert.equal(hook.status,200);
  const grant={action:'access',id:'user',environment:'test',months:3,reason:'Native Worker test grant',version:0,requestKey:crypto.randomUUID()};
  assert.equal((await request('/api/admin/users',grant,token)).status,403);
  await db.prepare('INSERT INTO patrac_admin_accounts VALUES(?,?)').bind('user',Date.now()).run();
  const detail=await request('/api/admin/users/user',null,token);assert.equal(detail.status,200);assert.equal((await detail.json()).billing.environment,'test');
  const granted=await request('/api/admin/users',grant,token);assert.equal(granted.status,200,await granted.clone().text());
  assert.equal((await request('/api/admin/users',grant,token)).status,200);
  const paidState=await(await request('/api/billing',null,token)).json();assert.equal(paidState.active,true);
  const updated=await(await request('/api/admin/users/user',null,token)).json();assert.equal(updated.billing.version,1);assert.equal(updated.audit.filter(a=>a.action==='access').length,1);

  // An attached team has not received a route before start: the author can still edit everything.
  const waiting={...game,status:'waiting',startedAt:null,stations:[...game.stations,{...game.stations[0],id:'s1',name:'Druhé místo'}]};
  await db.prepare('INSERT INTO patrac_expeditions VALUES(?,?,?,0)').bind('HJKLMNP','owner-hash',JSON.stringify(waiting)).run();
  await db.prepare('INSERT INTO patrac_creator_games VALUES(?,?,?)').bind('HJKLMNP','user',stamp).run();
  assert.equal((await request('/api/expeditions/HJKLMNP',{action:'join',name:'Waiting team',teamToken:'b'.repeat(64)})).status,201);
  const edited={...waiting,name:'Celá upravená výprava',mode:'treasure',stations:[{...waiting.stations[0],question:'Nová hádanka',answer:'nová odpověď'}]};
  const saved=await request('/api/expeditions/HJKLMNP',{action:'save',game:edited,version:0},token);assert.equal(saved.status,200,await saved.clone().text());
  const newGame=(await(await request('/api/expeditions/HJKLMNP',null,token)).json()).game;
  assert.equal(newGame.name,edited.name);assert.equal(newGame.mode,'treasure');assert.equal(newGame.stations.length,1);assert.equal(newGame.stations[0].question,'Nová hádanka');
  assert.equal((await request('/api/expeditions/HJKLMNP',{action:'save',game:waiting,version:0},token)).status,409);
  assert.equal((await request('/api/expeditions/HJKLMNP',{action:'start'},token)).status,200);
  assert.equal((await request('/api/expeditions/HJKLMNP',{action:'save',game:waiting,version:1},token)).status,409);

  // Finishing does not close the route, and a later team gets its own clock.
  await db.prepare("UPDATE patrac_teams SET payload=json_set(payload,'$.finishedAt',?,'$.index',1) WHERE code=?").bind(Date.now()-1000,'HJKLMNP').run();
  const lateJoin=await request('/api/expeditions/HJKLMNP',{action:'join',name:'Další skupina',teamToken:'c'.repeat(64)});assert.equal(lateJoin.status,201);
  const late=await db.prepare("SELECT payload FROM patrac_teams WHERE code=? AND name_key=?").bind('HJKLMNP','dalsi skupina').first();assert.ok(JSON.parse(late.payload).startedAt>=stamp);
  const profile=await(await request('/api/account',null,token)).json();assert.equal(profile.expeditionCount,2);assert.equal(profile.expeditionLimit,3);
  // The final free slot is reserved atomically even from simultaneous requests.
  const creations=await Promise.all([request('/api/expeditions',edited,token),request('/api/expeditions',edited,token)]);
  assert.deepEqual(creations.map(r=>r.status).sort(),[201,409]);assert.equal((await(await request('/api/account',null,token)).json()).expeditionCount,3);
  assert.equal((await request('/api/expeditions/HJKLMNP',{action:'delete',version:2,confirmation:'HJKLMNP'})).status,401);
  assert.equal((await request('/api/expeditions/HJKLMNP',{action:'delete',version:2,confirmation:'WRONG'} ,token)).status,400);
  assert.equal((await request('/api/expeditions/HJKLMNP',{action:'delete',version:0,confirmation:'HJKLMNP'},token)).status,409);
  const bucket=await mf.getR2Bucket('BUCKET');await bucket.put('hints/HJKLMNP/old-orphan','image');await bucket.put('hints/ABCDEFG/keep','other-image');
  await db.prepare("UPDATE patrac_access SET expires_at=0 WHERE user_id='user'").run();
  const deleted=await request('/api/expeditions/HJKLMNP',{action:'delete',version:2,confirmation:'HJKLMNP'},token);assert.equal(deleted.status,200,await deleted.clone().text());
  assert.equal(await bucket.head('hints/HJKLMNP/old-orphan'),null);assert.ok(await bucket.head('hints/ABCDEFG/keep'));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM patrac_teams WHERE code=?').bind('HJKLMNP').first()).n,0);
  assert.equal((await(await request('/api/account',null,token)).json()).expeditionCount,2);
  assert.equal((await request('/api/expeditions/HJKLMNP',null,token)).status,404);
  await db.prepare("UPDATE patrac_access SET expires_at=? WHERE user_id='user'").bind(Date.now()+3600000).run();
  assert.equal((await request('/api/expeditions',edited,token)).status,201);

 }finally{await mf.dispose();}
});
