export async function creatorNotices(db,userId){
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_admin_audit'").first())return{notices:[]};
 const rows=await db.prepare(`SELECT id,json_extract(details,'$.code') AS code,json_extract(details,'$.name') AS name,
  json_extract(details,'$.reason') AS reason,created_at AS createdAt FROM patrac_admin_audit
  WHERE target_id=? AND action='delete-expedition' AND status='success' ORDER BY created_at DESC,id DESC LIMIT 20`).bind(userId).all();
 return{notices:rows.results};
}
