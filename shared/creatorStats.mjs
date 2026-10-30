import {attemptStartedAt} from './playLimits.mjs';
// Counts attempts, never individual hint clicks. No new tracking or location history.
export function creatorStats(game, teams, now=Date.now()) {
  const stations=game.stations.map((s,index)=>({index,name:s.name,reached:0,solved:0,hints:0,solutions:0,ended:0,solvingMs:[]}));
  let started=0,completed=0,unfinished=0,active=0,waiting=0;
  const times=[];
  for(const t of teams){
    const start=attemptStartedAt(game,t);
    if(!start){if(!t.abandonedAt)waiting++;continue;}
    started++;
    const ended=!t.finishedAt&&(!!t.abandonedAt||now-start>=48*60*60*1000);
    if(t.finishedAt){completed++;const duration=t.finishedAt-start+(game.mode==='race'?(t.penaltyMs||0):0);if(duration>=0)times.push(duration);}
    else if(ended)unfinished++;else active++;
    const events=t.events||[];
    for(const s of stations){
      const es=events.filter(e=>e.index===s.index),arrive=es.find(e=>e.type==='arrive'),solve=es.find(e=>e.type==='solve');
      if(arrive)s.reached++;
      if(solve)s.solved++;
      if(es.some(e=>e.type==='hint'))s.hints++;
      if(es.some(e=>e.type==='solution'))s.solutions++;
      if(ended&&t.index===s.index)s.ended++;
      if(arrive&&solve&&solve.at>=arrive.at)s.solvingMs.push(solve.at-arrive.at);
    }
  }
  return {started,completed,unfinished,active,waiting,completionRate:started?Math.round(completed/started*100):null,averageMs:times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):null,stations:stations.map(({solvingMs,...s})=>({...s,averageSolveMs:solvingMs.length?Math.round(solvingMs.reduce((a,b)=>a+b,0)/solvingMs.length):null}))};
}
