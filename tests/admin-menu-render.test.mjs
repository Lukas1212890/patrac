import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
async function render(section){
 const built=await build({entryPoints:['app/components/AccountAdmin.jsx'],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent',plugins:[{name:'admin-state-fixture',setup(b){b.onLoad({filter:/AccountAdmin\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace("useState('loading')","useState('ready')").replace("[section,setSection]=useState('menu')",`[section,setSection]=useState('${section}')`)}));b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
 const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);return renderToStaticMarkup(React.createElement(module.exports.default));
}
test('admin landing is a menu and functional panels appear only in their own sections',async()=>{
 const home=await render('menu');assert.match(home,/Sekce administrace/);assert.equal((home.match(/class="pa-menu-item"/g)||[]).length,5);assert.equal(home.includes('class="pa-users"'),false);assert.equal(home.includes('pa-card pa-inbox'),false);assert.equal(home.includes('pa-card pa-push'),false);assert.equal(home.includes('Načítám nastavení'),false);
 const players=await render('players');assert.match(players,/pa-card pa-users/);assert.equal(players.includes('pa-card pa-push'),false);assert.match(players,/Zpět do menu/);
 const events=await render('events');assert.match(events,/Načítám události/);assert.equal(events.includes('pa-card pa-users'),false);
 const push=await render('push');assert.match(push,/Zapnout upozornění/);assert.equal(push.includes('pa-card pa-inbox'),false);
 const runtime=await render('runtime');assert.match(runtime,/Načítám nastavení/);assert.equal(runtime.includes('pa-card pa-users'),false);
 const reports=await render('reports');assert.match(reports,/<details[^>]*open/);assert.equal(reports.includes('pa-card pa-push'),false);
});
