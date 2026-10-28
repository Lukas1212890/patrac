// Only a confirmed missing/deleted expedition removes a saved access key.
// Offline, timeout, authentication and server errors must preserve it.
const sameAccess=(a,b)=>a.code===b.code&&a.role===b.role&&a.token===b.token;
export async function checkPrivateHistory(entries,load,signal){
 const pending=entries.filter(s=>s.role==='team'&&!s.pending),checked=[];let index=0,unverified=false;
 await Promise.all(Array.from({length:Math.min(3,pending.length)},async()=>{
  while(index<pending.length&&!signal?.aborted){
   const session=pending[index++];
   try{
    const value=await load(session,signal);
    if(value.role==='team')checked.push({session,gameName:value.game.name,name:value.team.name,finishedAt:value.team.finishedAt,abandonedAt:value.team.abandonedAt,endReason:value.team.endReason,index:value.team.index,totalStations:value.game.totalStations});
    else unverified=true;
   }catch(error){if([404,410].includes(error.status))checked.push({session,removed:true});else unverified=true;}
  }
 }));
 return{checked,unverified};
}
export function mergePrivateHistory(current,checked){
 return current.flatMap(session=>{
  const result=checked.find(item=>sameAccess(item.session,session));
  if(!result)return[session];if(result.removed)return[];
  const {session:original,removed,...metadata}=result;
  return[{...session,...metadata,name:metadata.name||session.name}];
 });
}
