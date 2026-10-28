export const ATTEMPT_LIMIT_MS = 48 * 60 * 60 * 1000;
export const MAX_ROUTE_MINUTES = 24 * 60;
export function expireAttempt(game, team, now) {
  const start = team.startedAt ?? game.startedAt;
  if (team.finishedAt != null || team.abandonedAt != null || start == null || now < start + ATTEMPT_LIMIT_MS) return team;
  const at = start + ATTEMPT_LIMIT_MS;
  return {...team, abandonedAt: at, endReason: 'timeout', events: [...team.events, {type: 'timeout', index: team.index, at}]};
}
