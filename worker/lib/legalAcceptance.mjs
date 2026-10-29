import {LEGAL_VERSION,termsText} from '../../shared/legal.mjs';
const prepared=new WeakMap();
export const validSignupAcceptance=input=>input?.adultConfirmed===true&&input?.termsVersion===LEGAL_VERSION;
export const validPurchaseAcceptance=input=>input?.immediateAccess===true&&input?.termsVersion===LEGAL_VERSION;
export async function recordAcceptance(db,userId,kind,reference){
 if(!prepared.has(db))prepared.set(db,db.prepare(`CREATE TABLE IF NOT EXISTS patrac_legal_acceptance(user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE, kind TEXT NOT NULL, reference TEXT NOT NULL, version TEXT NOT NULL, terms_snapshot TEXT NOT NULL, accepted_at INTEGER NOT NULL, PRIMARY KEY(user_id,kind,reference,version))`).run().catch(e=>{prepared.delete(db);throw e;}));
 await prepared.get(db);
 await db.prepare('INSERT OR IGNORE INTO patrac_legal_acceptance(user_id,kind,reference,version,terms_snapshot,accepted_at) VALUES(?,?,?,?,?,?)').bind(userId,kind,reference,LEGAL_VERSION,termsText,Date.now()).run();
}
