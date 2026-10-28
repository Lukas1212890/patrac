import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
test('creator notice and admin preview render the actual reason as safe text; deletion starts disabled',async()=>{
 const built=await build({stdin:{contents:"export {default as Card} from './CreatorNoticeCard.jsx';export {default as Dialog} from './AdminDeleteExpedition.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const notice={type:'delete-expedition',name:'Lesní výprava',code:'ABCDEFG',reason:'Uzavřený pozemek <script>alert(1)</script>',createdAt:Date.now(),actorEmail:'private-admin@example.com'};
 const html=renderToStaticMarkup(createElement(mod.exports.Card,{notice}));assert.ok(html.includes('Výpravu odstranil správce'));assert.ok(html.includes('Lesní výprava'));assert.ok(html.includes('Důvod:'));assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);assert.equal(html.includes('private-admin@example.com'),false);
 const dialog=renderToStaticMarkup(createElement(mod.exports.Dialog,{game:{...notice,version:0,deletion:{reason:notice.reason,requestKey:'test-render-request-key'}},userId:'creator',busy:false,onChange(){},onClose(){}}));assert.ok(dialog.includes('Takto oznámení uvidí tvůrce:'));assert.ok(dialog.includes('Uzavřený pozemek &lt;script&gt;'));assert.ok(dialog.includes('disabled=""'));assert.ok(dialog.includes('Pro potvrzení opište kód'));assert.equal(dialog.includes('<script>'),false);
});

test('account profile renders reward, access and quota notices with historical values and safe text',async()=>{
 const built=await build({stdin:{contents:"export {default as ProfileNotices} from './AccountNotifications.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const notices=[{id:'reward',type:'reward',name:'<script>bad</script>',code:'ABCDEFG',months:2,milestone:200,expiresAt:1799999999999,createdAt:1790000000000},{id:'access',type:'access',months:3,expiresAt:1799999999999},{id:'limits',type:'limits',oldPrivateLimit:3,privateLimit:5,oldPublicLimit:2,publicLimit:4}];
 const html=renderToStaticMarkup(createElement(mod.exports.ProfileNotices,{notices}));for(const text of ['Oznámení','200','měsíce zdarma','Správce prodloužil váš přístup','3 → 5','2 → 4','&lt;script&gt;'])assert.ok(html.includes(text),text);assert.equal(html.includes('<script>'),false);
 const empty=renderToStaticMarkup(createElement(mod.exports.ProfileNotices,{}));assert.ok(empty.includes('Zatím nemáte žádná oznámení.'));
 const failed=renderToStaticMarkup(createElement(mod.exports.ProfileNotices,{error:'Nelze načíst'}));assert.ok(failed.includes('role="alert"'));assert.equal(failed.includes('Zatím nemáte'),false);
});

test('lowering private/public quotas from 20/30 to 3/2 never renders a deletion message; every event keeps its own type',async()=>{
 const built=await build({stdin:{contents:"export {default as Card} from './CreatorNoticeCard.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const render=notice=>renderToStaticMarkup(createElement(mod.exports.Card,{notice}));
 const lowered=render({type:'limits',oldPrivateLimit:20,privateLimit:3,oldPublicLimit:30,publicLimit:2});
 for(const text of ['Správce snížil vaše limity výprav','20 → 3','30 → 2'])assert.ok(lowered.includes(text));
 for(const text of ['Výpravu odstranil správce','Důvod:','Kód'])assert.equal(lowered.includes(text),false);
 assert.ok(render({type:'limits',oldPrivateLimit:3,privateLimit:20,oldPublicLimit:2,publicLimit:30}).includes('Správce navýšil vaše limity výprav'));
 for(const notice of [{},{type:'future-event'},{type:'access',months:3,expiresAt:1799999999999},{type:'reward',months:2,milestone:100,expiresAt:1799999999999}])assert.equal(render(notice).includes('Výpravu odstranil správce'),false);
 const oneChange=render({type:'limits',oldPrivateLimit:20,privateLimit:3,oldPublicLimit:2,publicLimit:2});assert.equal(oneChange.includes('Veřejné výpravy:'),false);
});

test('red badges show the same unread count in profile and notices; read history remains visible after the count reaches zero',async()=>{
 const built=await build({stdin:{contents:"export {default as Badge} from './NoticeBadge.jsx';export {default as Notices} from './AccountNotifications.jsx';export {default as Banner} from './CreatorNotices.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const render=(Component,props)=>renderToStaticMarkup(createElement(Component,props));
 const notices=[{id:'a',type:'access',months:3,expiresAt:1799999999999},{id:'b',type:'limits',oldPrivateLimit:20,privateLimit:3,oldPublicLimit:30,publicLimit:2}];
 const badge=render(mod.exports.Badge,{count:2});assert.ok(badge.includes('2 nepřečtených oznámení'));assert.ok(badge.includes('p-notice-count'));
 const unread=render(mod.exports.Notices,{notices,unreadNotices:notices,unreadCount:2});assert.ok(unread.includes('2 nepřečtených oznámení'));assert.ok(unread.includes('Označit všechna jako přečtená'));assert.equal((unread.match(/>Označit jako přečtené</g)||[]).length,2);
 const read=render(mod.exports.Notices,{notices,unreadNotices:[],unreadCount:0});assert.equal(read.includes('p-notice-count'),false);assert.equal(read.includes('Označit jako přečtené'),false);assert.ok(read.includes('Správce prodloužil váš přístup'));
 assert.equal(render(mod.exports.Badge,{count:0}),'');assert.equal(render(mod.exports.Banner,{notices:[]}), '');
});

test('review notices and single creator replies render safe text and correct actions without a chat thread',async()=>{
 const built=await build({stdin:{contents:"export {default as Card} from './CreatorNoticeCard.jsx';export {default as Reviews} from './ExpeditionReviews.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 for(const type of ['review','review-reply']){
  const html=renderToStaticMarkup(createElement(mod.exports.Card,{notice:{id:'x',type,name:'Les',code:'ABCDEFG',nickname:'Pavel',stars:5,comment:'<script>text</script>',reply:'Děkuji',createdAt:Date.now()}}));
  assert.equal(html.includes('Výpravu odstranil správce'),false);assert.equal(html.includes('<script>'),false);assert.ok(html.includes(type==='review'?'Nový komentář a hodnocení':'Tvůrce odpověděl'));
 }
 const reviews={ready:true,repliesReady:true,count:1,average:5,canReview:false,items:[{reviewKey:'a',nickname:'Pavel',stars:5,comment:'Pěkná cesta',reply:'<b>Děkuji</b>',replyVersion:1,createdAt:Date.now(),updatedAt:Date.now()}]};
 const owner=renderToStaticMarkup(createElement(mod.exports.Reviews,{code:'ABCDEFG',reviews,isAuthor:true,user:{id:'owner'}}));assert.ok(owner.includes('Upravit odpověď'));assert.ok(owner.includes('Odpověď tvůrce'));assert.ok(owner.includes('&lt;b&gt;'));
 const visitor=renderToStaticMarkup(createElement(mod.exports.Reviews,{code:'ABCDEFG',reviews,isAuthor:false,user:{id:'player'}}));assert.ok(visitor.includes('Odpověď tvůrce'));assert.equal(visitor.includes('Upravit odpověď'),false);assert.equal(visitor.includes('Odpovědět na komentář'),false);
});
