export const ATTEMPT_LIMIT_MS = 48 * 60 * 60 * 1000;
export const MAX_ROUTE_MINUTES = 24 * 60;
export function attemptStartedAt(game,team){return team.individualStart===true?(team.startedAt??null):(team.startedAt??game.startedAt??null);}
export function expireAttempt(game, team, now) {
  const start = attemptStartedAt(game,team);
  if (team.finishedAt != null || team.abandonedAt != null || start == null || now < start + ATTEMPT_LIMIT_MS) return team;
  const at = start + ATTEMPT_LIMIT_MS;
  return {...team, abandonedAt: at, endReason: 'timeout', events: [...team.events, {type: 'timeout', index: team.index, at}]};
}

// Only undo the former pre-start cancellation bug; never restore a started attempt.
export function restoreUnstartedDeparture(game,team){
 if(!team.abandonedAt||team.finishedAt||team.arrivedAt||team.lastWrongAt||team.endReason==='timeout'||attemptStartedAt(game,team)!==null||team.index!==0||team.penaltyMs>0||(team.events||[]).some(e=>e.type!=='abandon'))return team;
 const restored={...team,individualStart:true,events:(team.events||[]).filter(e=>e.type!=='abandon')};
 delete restored.abandonedAt;delete restored.endReason;return restored;
}
