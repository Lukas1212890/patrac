import {verifyPassword} from 'better-auth/crypto';
const ready=new WeakMap();
export async function requireAdminPassword({db,actor,password,now,ErrorType}){
 if(typeof password!=='string'||!password||password.length>128)throw new ErrorType('Pro tuto akci zadejte heslo správce.',428,'ADMIN_PASSWORD_REQUIRED');
 if(!ready.has(db))ready.set(db,db.prepare('CREATE TABLE IF NOT EXISTS patrac_admin_password_attempts(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,created_at INTEGER NOT NULL)').run().catch(e=>{ready.delete(db);throw e;}));
 await ready.get(db);
 const stamp=now(),id=crypto.randomUUID();
 const result=await db.batch([
 db.prepare('DELETE FROM patrac_admin_password_attempts WHERE actor_id=? AND created_at<?').bind(actor.id,stamp-300000),
 db.prepare('INSERT INTO patrac_admin_password_attempts SELECT ?,?,? WHERE (SELECT COUNT(*) FROM patrac_admin_password_attempts WHERE actor_id=? AND created_at>=?)<5').bind(id,actor.id,stamp,actor.id,stamp-300000)
 ]);
 if(!result[1].meta.changes)throw new ErrorType('Příliš mnoho chybných pokusů o heslo správce. Počkejte 5 minut.',429,'ADMIN_PASSWORD_RATE_LIMIT');
 const account=await db.prepare("SELECT password FROM patrac_auth_account WHERE userId=? AND providerId='credential'").bind(actor.id).first();
 const valid=account?.password&&await verifyPassword({hash:account.password,password}).catch(()=>false);
 if(!valid)throw new ErrorType('Heslo správce nesouhlasí.',403,'ADMIN_PASSWORD_INVALID');
 await db.prepare('DELETE FROM patrac_admin_password_attempts WHERE id=?').bind(id).run();
}
