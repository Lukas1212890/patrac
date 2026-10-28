export const ACCOUNT_UPDATE_KEY='patrac-account-update-v1';
export function announceAccountUpdate(userId,win=window){
 try{win.localStorage.setItem(ACCOUNT_UPDATE_KEY,JSON.stringify({userId,at:Date.now(),nonce:crypto.randomUUID()}));}catch{}
 win.dispatchEvent(new Event('patrac-notices-refresh'));
}
export function installNoticeRefresh(win,doc,userId,load){
 const refresh=()=>{if(!doc.hidden)load();};
 const storage=event=>{if(event.key!==ACCOUNT_UPDATE_KEY||!event.newValue)return;try{if(JSON.parse(event.newValue).userId===userId)refresh();}catch{}};
 const events=['online','focus','pageshow','patrac-notices-refresh'];
 for(const name of events)win.addEventListener(name,refresh);
 win.addEventListener('storage',storage);doc.addEventListener('visibilitychange',refresh);
 const timer=win.setInterval(refresh,15000);
 return()=>{win.clearInterval(timer);for(const name of events)win.removeEventListener(name,refresh);win.removeEventListener('storage',storage);doc.removeEventListener('visibilitychange',refresh);};
}
