import {buildPushPayload} from '@block65/webcrypto-web-push';
import {GameError} from './patrac-engine.mjs';
const ready=new WeakMap();
export async function ensureAdminPush(db){
 if(!ready.has(db))ready.set(db,(async()=>{
  for(const sql of SCHEMA)await db.prepare(sql).run();
 })().catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
}
export const SCHEMA=[
 `CREATE TABLE IF NOT EXISTS patrac_push_config(id INTEGER PRIMARY KEY CHECK(id=1),public_key TEXT NOT NULL,private_key TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS patrac_admin_push(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS patrac_push_events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS patrac_push_deliveries(event_id TEXT NOT NULL REFERENCES patrac_push_events(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES patrac_admin_push(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,done_at INTEGER,claim TEXT,PRIMARY KEY(event_id,subscription_id))`,
 `CREATE INDEX IF NOT EXISTS patrac_push_due ON patrac_push_deliveries(done_at,next_at)`
];
async function encryptionKey(secret){if(!secret||secret.length<32)throw new GameError('Upozornění zatím nejsou připravená.',503);return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('patrac-admin-push:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(value,secret){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(secret),data=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value));return Buffer.from(iv).toString('base64url')+'.'+Buffer.from(data).toString('base64url');}
async function unseal(value,secret){const [iv,data]=value.split('.'),key=await encryptionKey(secret);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(iv,'base64url')},key,Buffer.from(data,'base64url')));}
export async function pushConfig(db,secret){
 await ensureAdminPush(db);
 let row=await db.prepare('SELECT * FROM patrac_push_config WHERE id=1').first();
 if(!row){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.privateKey),keys={publicKey:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url'),privateKey:jwk.d};await db.prepare('INSERT OR IGNORE INTO patrac_push_config VALUES(1,?,?,?)').bind(keys.publicKey,await seal(keys.privateKey,secret),Date.now()).run();row=await db.prepare('SELECT * FROM patrac_push_config WHERE id=1').first();}
 return row;
}
export async function validateSubscription(input){
 const s=input?.subscription;
 if(!s||typeof s.endpoint!=='string'||s.endpoint.length>2048)throw new GameError('Neplatné zařízení.');
 let url;try{url=new URL(s.endpoint);}catch{throw new GameError('Neplatné zařízení.');}
 const host=url.hostname;
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||!(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com')))throw new GameError('Nepodporovaná služba upozornění.');
 if(!/^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth||''))throw new GameError('Neplatný klíč zařízení.');
 try{await crypto.subtle.importKey('raw',Buffer.from(s.keys.p256dh,'base64url'),{name:'ECDH',namedCurve:'P-256'},false,[]);}catch{throw new GameError('Neplatný klíč zařízení.');}
 return s;
}
export async function savePushSubscription(db,userId,input,secret){
 const s=await validateSubscription(input);await pushConfig(db,secret);
 const other=await db.prepare('SELECT user_id FROM patrac_admin_push WHERE endpoint=?').bind(s.endpoint).first();
 if(other&&other.user_id!==userId)throw new GameError('Zařízení je připojené k jinému správci. Nejprve v něm vypněte upozornění.',409);
 const result=await db.prepare(`INSERT INTO patrac_admin_push(id,user_id,endpoint,p256dh,auth,created_at) SELECT ?,?,?,?,?,? WHERE ((SELECT COUNT(*) FROM patrac_admin_push WHERE user_id=?)<10 OR EXISTS(SELECT 1 FROM patrac_admin_push WHERE endpoint=? AND user_id=?)) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth WHERE patrac_admin_push.user_id=excluded.user_id`).bind(crypto.randomUUID(),userId,s.endpoint,s.keys.p256dh,s.keys.auth,Date.now(),userId,s.endpoint,userId).run();
 if(!result.meta.changes)throw new GameError('Lze připojit nejvýše 10 zařízení.',409);
 return{ok:true};
}
export async function removePushSubscription(db,userId,endpoint){
 await ensureAdminPush(db);if(typeof endpoint!=='string'||endpoint.length>2048)throw new GameError('Neplatné zařízení.');
 await db.batch([db.prepare('DELETE FROM patrac_push_deliveries WHERE subscription_id IN (SELECT id FROM patrac_admin_push WHERE user_id=? AND endpoint=?)').bind(userId,endpoint),db.prepare('DELETE FROM patrac_admin_push WHERE user_id=? AND endpoint=?').bind(userId,endpoint)]);return{ok:true};
}
// Recover committed registrations/payments after an interrupted request as well.
export async function captureAdminPush(db){
 await ensureAdminPush(db);
 const config=await db.prepare('SELECT created_at FROM patrac_push_config WHERE id=1').first();if(!config)return;
 const users=await db.prepare("SELECT u.id,u.name,u.createdAt FROM patrac_auth_user u WHERE u.createdAt>=? AND NOT EXISTS(SELECT 1 FROM patrac_push_events e WHERE e.id='registration:'||u.id) ORDER BY u.createdAt LIMIT 100").bind(config.created_at).all();
 const orders=await db.prepare("SELECT o.id,o.months,o.amount,o.environment,o.paid_at,u.name AS nickname FROM patrac_orders o LEFT JOIN patrac_auth_user u ON u.id=o.user_id WHERE o.paid_at>=? AND NOT EXISTS(SELECT 1 FROM patrac_push_events e WHERE e.id='payment:'||o.id) ORDER BY o.paid_at LIMIT 100").bind(config.created_at).all();
 const date=stamp=>new Date(stamp).toLocaleString('cs-CZ',{timeZone:'Europe/Prague',dateStyle:'short',timeStyle:'short'});
 const events=[...users.results.map(u=>({id:'registration:'+u.id,at:u.createdAt,title:'Nový hráč v Pátrači',body:u.name+' · registrace '+date(u.createdAt)+'.'})),...orders.results.map(o=>({id:'payment:'+o.id,at:o.paid_at,title:o.environment==='test'?'TESTOVACÍ PLATBA – Pátrač':'Nová platba – Pátrač',body:(o.nickname||'Odstraněný účet')+' · '+(o.amount/100).toLocaleString('cs-CZ')+' Kč · '+o.months+' '+(o.months===3?'měsíce':'měsíců')+' · '+date(o.paid_at)+'.'}))];
 for(const event of events){
  const {id,at,...payload}=event;
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO patrac_push_events VALUES(?,?,?)').bind(id,JSON.stringify({...payload,tag:id,url:'/admin?notice='+encodeURIComponent(id)}),at),
   db.prepare(`INSERT OR IGNORE INTO patrac_push_deliveries(event_id,subscription_id) SELECT ?,s.id FROM patrac_admin_push s JOIN patrac_admin_accounts a ON a.user_id=s.user_id WHERE s.created_at<=?`).bind(id,at)
  ]);
 }
}
export async function sendAdminPush(db,secret,{fetcher=fetch,now=Date.now(),limit=10,eventId=null}={}){
 await ensureAdminPush(db);
 const config=await db.prepare('SELECT * FROM patrac_push_config WHERE id=1').first();if(!config)return [];
 const outcomes=[];
 const due=await db.prepare(`SELECT d.*,s.endpoint,s.p256dh,s.auth,e.payload FROM patrac_push_deliveries d JOIN patrac_admin_push s ON s.id=d.subscription_id JOIN patrac_admin_accounts a ON a.user_id=s.user_id JOIN patrac_auth_user u ON u.id=s.user_id JOIN patrac_push_events e ON e.id=d.event_id WHERE d.done_at IS NULL AND d.next_at<=? AND d.attempts<5 AND u.emailVerified=1 AND e.created_at>? AND (? IS NULL OR e.id=?) ORDER BY e.created_at LIMIT ?`).bind(now,now-24*3600000,eventId,eventId,limit).all();
 const privateKey=await unseal(config.private_key,secret);
 for(const row of due.results){
  const claim=crypto.randomUUID();
  const reserved=await db.prepare('UPDATE patrac_push_deliveries SET claim=?,attempts=attempts+1,next_at=? WHERE event_id=? AND subscription_id=? AND done_at IS NULL AND next_at<=?').bind(claim,now+120000,row.event_id,row.subscription_id,now).run();if(!reserved.meta.changes)continue;
  let stage='PUSH_ENCRYPTION';
  try{
   const request=await buildPushPayload({data:row.payload,options:{ttl:3600,urgency:'normal'}},{endpoint:row.endpoint,expirationTime:null,keys:{p256dh:row.p256dh,auth:row.auth}},{subject:'mailto:patrac@stopik.cz',publicKey:config.public_key,privateKey});
   stage='PUSH_NETWORK';
   const headers=new Headers(request.headers);headers.delete('content-length');
   const response=await fetcher(row.endpoint,{method:'POST',headers,body:request.body,redirect:'manual',signal:AbortSignal.timeout(8000)});
   if(response.status===404||response.status===410){await removeExpiredPush(db,row.subscription_id);outcomes.push({eventId:row.event_id,code:'PUSH_SUBSCRIPTION_EXPIRED',status:response.status});continue;}
   if(!response.ok){let reason='';try{const text=(await response.text()).slice(0,1024);let candidate;try{candidate=JSON.parse(text).reason;}catch{candidate=text;}if(typeof candidate==='string'&&/^[A-Za-z0-9_. -]{1,80}$/.test(candidate))reason=candidate;}catch{}throw Object.assign(Error('Push provider rejected request'),{pushCode:'PUSH_HTTP_'+response.status,pushStatus:response.status,pushReason:reason});}
   await db.prepare('UPDATE patrac_push_deliveries SET done_at=? WHERE event_id=? AND subscription_id=? AND claim=?').bind(now,row.event_id,row.subscription_id,claim).run();
   outcomes.push({eventId:row.event_id,code:'PUSH_SENT',status:response.status});
  }catch(error){const failure={eventId:row.event_id,code:error.pushCode||(['AbortError','TimeoutError'].includes(error.name)?'PUSH_TIMEOUT':stage),status:error.pushStatus||null,reason:error.pushReason||''};outcomes.push(failure);console.warn('Admin push failed',{code:failure.code,status:failure.status,reason:failure.reason});await db.prepare('UPDATE patrac_push_deliveries SET next_at=? WHERE event_id=? AND subscription_id=? AND claim=?').bind(now+Math.min(3600000,60000*2**row.attempts),row.event_id,row.subscription_id,claim).run();}
 }
 return outcomes;
}
async function removeExpiredPush(db,id){await db.batch([db.prepare('DELETE FROM patrac_push_deliveries WHERE subscription_id=?').bind(id),db.prepare('DELETE FROM patrac_admin_push WHERE id=?').bind(id)]);}
export async function runAdminPush(db,secret){try{await captureAdminPush(db);await sendAdminPush(db,secret);await db.batch([db.prepare('DELETE FROM patrac_push_deliveries WHERE event_id IN (SELECT id FROM patrac_push_events WHERE created_at<?)').bind(Date.now()-30*86400000),db.prepare("UPDATE patrac_push_events SET payload='{}' WHERE created_at<? AND payload<>'{}'").bind(Date.now()-30*86400000)]);}catch{console.error('Admin push processing deferred');}}
export async function testAdminPush(db,secret,userId,endpoint){
 await ensureAdminPush(db);const s=await db.prepare('SELECT id FROM patrac_admin_push WHERE user_id=? AND endpoint=?').bind(userId,endpoint).first();if(!s)throw new GameError('Nejprve zapněte upozornění na tomto zařízení.',409);
 const recent=await db.prepare("SELECT COUNT(*) AS n FROM patrac_push_events WHERE id LIKE ? AND created_at>?").bind('test:'+userId+':%',Date.now()-60000).first();if(recent.n>=3)throw new GameError('Zkoušku opakujte za minutu.',429);
 const id='test:'+userId+':'+crypto.randomUUID(),stamp=Date.now();await db.batch([db.prepare('INSERT INTO patrac_push_events VALUES(?,?,?)').bind(id,JSON.stringify({title:'Pátrač – upozornění fungují',body:'Sem vám budou chodit nové registrace a potvrzené platby.',tag:id,url:'/admin'}),stamp),db.prepare('INSERT INTO patrac_push_deliveries(event_id,subscription_id) VALUES(?,?)').bind(id,s.id)]);
 const outcomes=await sendAdminPush(db,secret,{eventId:id}),outcome=outcomes.find(o=>o.eventId===id);
 const result=await db.prepare('SELECT done_at FROM patrac_push_deliveries WHERE event_id=?').bind(id).first();if(!result?.done_at){const code=outcome?.code||'PUSH_PENDING',detail=outcome?.reason?' ('+outcome.reason+')':'';const message=code==='PUSH_SUBSCRIPTION_EXPIRED'?'Odběr tohoto zařízení už není platný. Zapněte upozornění znovu.':code.startsWith('PUSH_HTTP_')?'Služba upozornění odmítla odeslání. Kód: '+code+detail+'. Oprávnění telefonu je povolené.':code==='PUSH_ENCRYPTION'?'Server nedokázal připravit šifrované upozornění. Kód: '+code+'.':code==='PUSH_NETWORK'||code==='PUSH_TIMEOUT'?'Server se nedokázal spojit se službou upozornění. Kód: '+code+'.':'Zkušební zpráva zatím nebyla odeslána. Kód: '+code+'.';throw Object.assign(new GameError(message,503),{code});}
 return{ok:true};
}
