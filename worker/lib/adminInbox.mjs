import {ensureAdminPush,captureAdminPush,pushConfig} from './adminPush.mjs';
import {ensureNoticeReads} from './noticeReads.mjs';
import {GameError} from './patrac-engine.mjs';
const eventKind="(e.id LIKE 'registration:%' OR e.id LIKE 'payment:%')";
const fields=`SELECT e.id,e.created_at AS createdAt,e.payload,r.read_at AS readAt,
 CASE WHEN COALESCE(reg.email,payer.email) LIKE '%@account.invalid' THEN NULL ELSE COALESCE(reg.id,payer.id) END AS userId,CASE WHEN COALESCE(reg.email,payer.email) LIKE '%@account.invalid' THEN 'Smazaný účet' ELSE COALESCE(reg.name,payer.name) END AS nickname,CASE WHEN COALESCE(reg.email,payer.email) LIKE '%@account.invalid' THEN NULL ELSE COALESCE(reg.email,payer.email) END AS email,
 o.id AS orderId,o.months,o.amount,o.environment,o.paid_at AS paidAt,o.access_until AS accessUntil
 FROM patrac_push_events e
 LEFT JOIN patrac_auth_user reg ON e.id='registration:'||reg.id
 LEFT JOIN patrac_orders o ON e.id='payment:'||o.id
 LEFT JOIN patrac_auth_user payer ON payer.id=o.user_id
 LEFT JOIN patrac_notice_reads r ON r.user_id=? AND r.notice_key='admin:'||e.id`;
const project=r=>({id:r.id,type:r.id.startsWith('payment:')?'payment':'registration',createdAt:r.createdAt,read:!!r.readAt,userId:r.userId,nickname:r.nickname||'Odstraněný účet',email:r.email||null,...(r.orderId?{orderId:r.orderId,months:r.months,amount:r.amount,environment:r.environment,paidAt:r.paidAt,accessUntil:r.accessUntil}:{})});
export function validAdminEvent(id){return typeof id==='string'&&/^(registration|payment):[A-Za-z0-9_-]{1,128}$/.test(id);}
/** @param {any} db @param {string} userId @param {{page?:number,notice?:string|null,secret?:string}} options */
export async function adminInbox(db,userId,{page=0,notice=null,secret}={}){
 if(!Number.isSafeInteger(page)||page<0||page>100000)throw new GameError('Neplatná stránka.');
 if(notice!==null&&!validAdminEvent(notice))throw new GameError('Neplatné oznámení.');
 await pushConfig(db,secret);await captureAdminPush(db);await ensureNoticeReads(db);
 const rows=await db.prepare(fields+` WHERE ${eventKind} ORDER BY e.created_at DESC,e.id DESC LIMIT 10 OFFSET ?`).bind(userId,page*10).all();
 const totals=await db.prepare(`SELECT COUNT(*) AS total,MAX(e.rowid) AS sequence,SUM(CASE WHEN r.read_at IS NULL THEN 1 ELSE 0 END) AS unread FROM patrac_push_events e LEFT JOIN patrac_notice_reads r ON r.user_id=? AND r.notice_key='admin:'||e.id WHERE ${eventKind}`).bind(userId).first();
 const latest=await db.prepare(`SELECT rowid AS sequence,id,created_at FROM patrac_push_events e WHERE ${eventKind} ORDER BY created_at DESC,id DESC LIMIT 1`).first();
 const selected=notice?await db.prepare(fields+` WHERE ${eventKind} AND e.id=?`).bind(userId,notice).first():null;
 return{events:rows.results.map(project),selected:selected?project(selected):null,total:totals.total,unread:totals.unread||0,page,hasMore:(page+1)*10<totals.total,latest:latest?{id:latest.id,at:latest.created_at,sequence:totals.sequence}:null};
}
export async function readAdminInbox(db,userId,input){
 await ensureAdminPush(db);await ensureNoticeReads(db);
 if(input.action==='read'){
  if(!validAdminEvent(input.id))throw new GameError('Neplatné oznámení.');
  await db.prepare(`INSERT OR IGNORE INTO patrac_notice_reads(user_id,notice_key,read_at) SELECT ?,'admin:'||e.id,? FROM patrac_push_events e WHERE ${eventKind} AND e.id=?`).bind(userId,Date.now(),input.id).run();
 }else if(input.action==='read-all'){
  if(!validAdminEvent(input.latest?.id)||(!Number.isSafeInteger(input.latest?.sequence)||input.latest.sequence<1))throw new GameError('Obnovte oznámení a zkuste to znovu.');
  await db.prepare(`INSERT OR IGNORE INTO patrac_notice_reads(user_id,notice_key,read_at) SELECT ?,'admin:'||e.id,? FROM patrac_push_events e WHERE ${eventKind} AND e.rowid<=?`).bind(userId,Date.now(),input.latest.sequence).run();
 }else throw new GameError('Neplatná akce.');
 return{ok:true};
}
