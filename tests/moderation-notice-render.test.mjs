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
