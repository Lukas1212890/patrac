import {ATTEMPT_LIMIT_MS} from '../../shared/playLimits.mjs';
// One atomic update: concurrent gameplay uses the same version counter, so it cannot
// overwrite expiration. Completed/abandoned attempts and unstarted players are untouched.
export async function expireAttempts(db, now = Date.now()) {
  const start = "COALESCE(json_extract(t.payload,'$.startedAt'),json_extract(e.payload,'$.startedAt'))";
  return db.prepare(`WITH overdue AS (
    SELECT t.id, ${start} + ? AS deadline
    FROM patrac_teams t JOIN patrac_expeditions e ON e.code=t.code
    WHERE json_extract(t.payload,'$.finishedAt') IS NULL
      AND json_extract(t.payload,'$.abandonedAt') IS NULL
      AND ${start} <= ?
  ) UPDATE patrac_teams SET payload=json_set(payload,
    '$.abandonedAt',(SELECT deadline FROM overdue WHERE overdue.id=patrac_teams.id),
    '$.endReason','timeout',
    '$.events',json_insert(COALESCE(json_extract(payload,'$.events'),'[]'),'$[#]',
      json_object('type','timeout','index',json_extract(payload,'$.index'),'at',(SELECT deadline FROM overdue WHERE overdue.id=patrac_teams.id)))),
    version=version+1 WHERE id IN (SELECT id FROM overdue)`)
    .bind(ATTEMPT_LIMIT_MS, now - ATTEMPT_LIMIT_MS).run();
}
