import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('push displays a tagged notification and a tap opens only admin, never a payload-supplied URL',async()=>{
 const listeners={},shown=[],opened=[];
 const self={addEventListener:(name,fn)=>listeners[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),{self,URL,console});
 let pending;
 listeners.push({data:{json:()=>({title:'Nová platba',body:'Zaplaceno 199 Kč',tag:'payment:one',url:'https://example.com/private'})},waitUntil:p=>pending=p});await pending;
 assert.equal(shown[0][0],'Nová platba');assert.equal(shown[0][1].tag,'payment:one');assert.equal(shown[0][1].data.id,'payment:one');
 let closed=false;listeners.notificationclick({notification:{close:()=>closed=true,data:{url:'https://example.com'}},waitUntil:p=>pending=p});await pending;assert.equal(closed,true);assert.deepEqual(opened,['/admin']);listeners.notificationclick({notification:{close(){},data:{id:'payment:one'}},waitUntil:p=>pending=p});await pending;assert.equal(opened[1],'/admin?notice=payment%3Aone');
});
