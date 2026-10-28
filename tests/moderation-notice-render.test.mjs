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
 const notice={name:'Lesní výprava',code:'ABCDEFG',reason:'Uzavřený pozemek <script>alert(1)</script>',createdAt:Date.now(),actorEmail:'private-admin@example.com'};
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
