import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url),user={id:'profile-fixture',name:'Hráč',email:'profile@example.com'};
async function render(section='menu',props={}){
 const built=await build({entryPoints:['app/components/CreatorAccount.jsx'],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent',plugins:[{name:'profile-fixture',setup(b){b.onLoad({filter:/CreatorAccount\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace("[profileSection,setProfileSection]=useState('menu')",`[profileSection,setProfileSection]=useState('${section}')`)}));}}]});
 const m={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,m,m.exports);return renderToStaticMarkup(React.createElement(m.exports.default,{user,notificationState:{unreadCount:4},...props}));
}
test('signed-in profile starts with six buttons and badge, with other account panels hidden',async()=>{
 const html=await render();assert.equal((html.match(/class="p-profile-menu-item"/g)||[]).length,6);assert.match(html,/4 nepřečtených oznámení/);assert.match(html,/profile@example.com/);assert.equal(html.includes('aria-label="Oznámení účtu"'),false);assert.equal(html.includes('Současné heslo'),false);assert.equal(html.includes('Provozovatel'),false);
});
test('individual profile sections expose only their controls; logged-out users and recovery retain auth forms',async()=>{
 const notices=await render('notifications');assert.match(notices,/aria-label="Oznámení účtu"/);assert.equal(notices.includes('class="p-profile-menu-item"'),false);
 const details=await render('details');assert.match(details,/Změnit přezdívku/);assert.equal(details.includes('aria-label="Oznámení účtu"'),false);
 const password=await render('password');assert.match(password,/Současné heslo/);assert.match(password,/Nové heslo znovu/);assert.equal(password.includes('class="p-profile-menu-item"'),false);
 const info=await render('info');assert.match(info,/14286467/);assert.match(info,/604 204 639/);assert.match(info,/Obchodní podmínky/);
 const removal=await render('delete');assert.match(removal,/SMAZAT ÚČET/);assert.match(removal,/Vaše současné heslo/);assert.match(removal,/72 hodin/);assert.match(removal,/disabled/);
 const guest=await render('menu',{user:null});assert.match(guest,/Přihlášení/);assert.equal(guest.includes('class="p-profile-menu-item"'),false);
 const recovery=await render('menu',{recovery:true});assert.match(recovery,/Nové heslo/);assert.equal(recovery.includes('class="p-profile-menu-item"'),false);
});
