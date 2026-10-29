import {noticeReadId} from '../../shared/noticeReadState.mjs';
import {GameError} from './patrac-engine.mjs';
const prepared=new WeakMap();
// Additive, idempotent schema setup lets existing installations upgrade automatically.
export async function ensureNoticeReads(db){
 if(!prepared.has(db))prepared.set(db,db.prepare(`CREATE TABLE IF NOT EXISTS patrac_notice_reads (
  user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
  notice_key TEXT NOT NULL,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, notice_key)
)`).run().catch(error=>{prepared.delete(db);throw error;}));
 await prepared.get(db);
}
export async function noticeReads(db,userId,notices){
 await ensureNoticeReads(db);
 if(!notices.length)return [];
 const keys=notices.map(noticeReadId);
 const rows=await db.prepare(`SELECT notice_key FROM patrac_notice_reads WHERE user_id=? AND notice_key IN (${keys.map(()=>'?').join(',')})`).bind(userId,...keys).all();
 return rows.results.map(row=>row.notice_key);
}
export async function markNoticeReads(db,userId,notices,requested){
 if(!Array.isArray(requested)||requested.length>250||requested.some(id=>typeof id!=='string'||id.length>300))throw new GameError('Neplatný seznam oznámení.');
 await ensureNoticeReads(db);
 const allowed=new Set(notices.map(noticeReadId));
 const keys=[...new Set(requested)].filter(key=>allowed.has(key));
 if(keys.length)await db.batch(keys.map(key=>db.prepare('INSERT OR IGNORE INTO patrac_notice_reads(user_id,notice_key,read_at) VALUES(?,?,?)').bind(userId,key,Date.now())));
 return noticeReads(db,userId,notices);
}
