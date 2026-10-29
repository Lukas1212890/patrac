const prepared=new WeakMap();
export async function ensureAccessSegments(db){
 if(!prepared.has(db))prepared.set(db,db.prepare(`CREATE TABLE IF NOT EXISTS patrac_access_segments (
 user_id TEXT NOT NULL REFERENCES patrac_auth_user(id) ON DELETE CASCADE,
 environment TEXT NOT NULL, source TEXT NOT NULL, reference TEXT NOT NULL,
 start_at INTEGER NOT NULL,end_at INTEGER NOT NULL,revoked_at INTEGER,
 PRIMARY KEY(user_id,environment,source,reference))`).run().catch(e=>{prepared.delete(db);throw e;}));
 await prepared.get(db);
}
