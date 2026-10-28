import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_UPDATE_KEY,announceAccountUpdate,installNoticeRefresh} from '../app/lib/noticeRefresh.mjs';
import {noticeStorageKey,noticeReadId,parseNoticeReads,mergeNoticeReads,unreadNotices} from '../app/lib/noticeReadState.mjs';
function surface(){const win=new EventTarget(),doc=new EventTarget(),stored=new Map();doc.hidden=false;win.localStorage={setItem:(k,v)=>stored.set(k,v)};win.setInterval=(callback,ms)=>{win.tick=callback;win.intervalMs=ms;return 1;};win.clearInterval=()=>{win.tick=null;};return{win,doc,stored};}
test('notices refresh on returning to the app, cross-tab admin changes and visible polling; cleanup removes subscriptions',()=>{
 const {win,doc}=surface();let count=0;const stop=installNoticeRefresh(win,doc,'player',()=>count++);
 for(const name of ['focus','pageshow','online','patrac-notices-refresh'])win.dispatchEvent(new Event(name));assert.equal(count,4);assert.equal(win.intervalMs,15000);win.tick();assert.equal(count,5);
 const storage=(userId,key=ACCOUNT_UPDATE_KEY)=>win.dispatchEvent(Object.assign(new Event('storage'),{key,newValue:JSON.stringify({userId})}));
 storage('other');storage('player','unrelated');assert.equal(count,5);storage('player');assert.equal(count,6);
 doc.hidden=true;win.tick();storage('player');assert.equal(count,6);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(count,7);
 stop();assert.equal(win.tick,null);win.dispatchEvent(new Event('focus'));storage('player');assert.equal(count,7);
});
test('successful admin changes announce the affected account without failing when browser storage is unavailable',()=>{
 const {win,stored}=surface();let calls=0;win.addEventListener('patrac-notices-refresh',()=>calls++);announceAccountUpdate('player',win);assert.equal(calls,1);assert.equal(JSON.parse(stored.get(ACCOUNT_UPDATE_KEY)).userId,'player');
 win.localStorage.setItem=()=>{throw Error('Storage disabled');};assert.doesNotThrow(()=>announceAccountUpdate('player',win));assert.equal(calls,2);
});
test('unread counts decrease per message, survive reload, preserve previous acknowledgements and stay separated by account',()=>{
 const notices=[{id:'deleted',type:'delete-expedition'},{id:'access_1',type:'access'},{id:'reward:1',type:'reward'}];
 let read=parseNoticeReads(null);assert.equal(unreadNotices(notices,read).length,3);
 read=mergeNoticeReads(read,[noticeReadId(notices[1])]);assert.equal(unreadNotices(notices,read).length,2);
 read=parseNoticeReads(JSON.stringify(read));assert.equal(unreadNotices(notices,read).length,2);
 read=mergeNoticeReads(read,notices.map(noticeReadId));assert.equal(unreadNotices(notices,read).length,0);assert.equal(mergeNoticeReads(read,read).length,3);
 assert.notEqual(noticeStorageKey('player'),noticeStorageKey('other'));assert.equal(unreadNotices(notices,[]).length,3);
 assert.deepEqual(parseNoticeReads('bad json'),[]);assert.deepEqual(parseNoticeReads('{"id":"fake"}'),[]);assert.deepEqual(parseNoticeReads('[1,"real",null]'),['real']);
 assert.equal(unreadNotices(notices,['deleted','typed-v2:access_1','typed-v2:reward:1']).length,0);
});
