// Source records are additive grants. Future expiry includes queued extensions.
export async function subscriptionQuery(db,environment,stamp){
 const rewards=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='patrac_creator_rewards'").first();
 const details="CASE WHEN json_valid(a.details) THEN a.details ELSE '{}' END";
 const value=key=>`json_extract(${details},'$.${key}')`;
 return {bindings:[environment,stamp],sql:`WITH context(environment,stamp) AS (VALUES (?,?)),
 access_rows AS (SELECT a.* FROM patrac_access a,context c WHERE a.environment=c.environment),
 grants AS (
 SELECT o.user_id AS userId,'paid' AS source,o.months,o.paid_at AS grantedAt,o.access_until AS accessUntil,o.amount,o.id AS reference,'' AS reason FROM patrac_orders o,context c WHERE o.environment=c.environment AND o.paid_at IS NOT NULL
 UNION ALL
 SELECT a.target_id,'admin',${value('months')},a.created_at,
 CASE WHEN c.environment='live' AND ${value('environment')}='test' THEN ${value('liveExpiresAt')} ELSE ${value('expiresAt')} END,
 0,a.id,COALESCE(${value('reason')},'')
 FROM patrac_admin_audit a,context c WHERE a.action='access' AND a.status='success' AND (${value('environment')}=c.environment OR (c.environment='live' AND ${value('environment')}='test' AND ${value('liveApplied')} IS NOT NULL))
 ${rewards?"UNION ALL SELECT r.user_id,'reward',r.months,r.granted_at,r.access_until,0,r.code||':'||r.milestone,r.expedition_name FROM patrac_creator_rewards r,context c WHERE r.environment=c.environment":''}
 ), relevant AS (
 SELECT g.* FROM grants g LEFT JOIN access_rows a ON a.user_id=g.userId,context c
 WHERE (COALESCE(a.expires_at,0)>c.stamp AND g.accessUntil>c.stamp) OR COALESCE(a.expires_at,0)<=c.stamp
 ), source_summary AS (
 SELECT userId,GROUP_CONCAT(DISTINCT source) AS sources,COUNT(DISTINCT source) AS sourceCount,
 SUM(CASE WHEN source='paid' THEN months ELSE 0 END) AS paidMonths,
 SUM(CASE WHEN source='admin' THEN months ELSE 0 END) AS adminMonths,
 SUM(CASE WHEN source='reward' THEN months ELSE 0 END) AS rewardMonths
 FROM relevant GROUP BY userId
 ) `};
}
export function subscriptionSummary(row,environment,stamp){
 const expiresAt=row.expires_at||null;
 return {environment,expiresAt,active:(expiresAt||0)>stamp,sources:row.sources?row.sources.split(',').sort():[],paidMonths:row.paidMonths||0,adminMonths:row.adminMonths||0,rewardMonths:row.rewardMonths||0};
}
export async function subscriptionHistory(db,userId,environment,stamp){
 const query=await subscriptionQuery(db,environment,stamp);
 const rows=await db.prepare(query.sql+'SELECT * FROM grants WHERE userId=? ORDER BY grantedAt DESC,reference DESC LIMIT 100').bind(...query.bindings,userId).all();
 const summary=await db.prepare(query.sql+'SELECT a.expires_at,s.* FROM (SELECT ? AS userId) u LEFT JOIN access_rows a ON a.user_id=u.userId LEFT JOIN source_summary s ON s.userId=u.userId').bind(...query.bindings,userId).first();
 return {...subscriptionSummary(summary,environment,stamp),history:rows.results};
}
