import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
test('a prepared private expedition renders author edit and delete controls without crashing',async()=>{
 // Render the actual component with its actual imports, not a copy of its JSX.
 const contents=readFileSync(new URL('../app/components/PatracApp.jsx',import.meta.url),'utf8')+'\nexport {Owner};';
 const built=await build({stdin:{contents,resolveDir:process.cwd()+'/app/components',sourcefile:'PatracApp.jsx',loader:'jsx'},bundle:true,format:'cjs',platform:'node',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const props={data:{game:{code:'ABCDEFG',name:'Připravená výprava',mode:'race',status:'waiting',visibility:'private',stations:[{id:'s0',name:'Dub',lat:49.3,lng:17.39}],totalStations:1},teams:[]},now:Date.now(),busy:false,online:true,onAction(){},onEdit(){},onDelete(){},onShowPublic(){},onBackup(){}};
 const html=renderToStaticMarkup(createElement(mod.exports.Owner,props));
 assert.ok(html.includes('Připravená výprava'));assert.ok(html.includes('Upravit celou výpravu'));assert.ok(html.includes('Smazat celou výpravu'));assert.ok(html.includes('49.30000'));
 const publicHtml=renderToStaticMarkup(createElement(mod.exports.Owner,{...props,data:{...props.data,game:{...props.data.game,visibility:'public',published:false}}}));
 assert.ok(publicHtml.includes('Zveřejnit na mapě'));assert.ok(publicHtml.includes('Smazat celou výpravu'));
 for(const locked of [true,false]){
  const rendered=renderToStaticMarkup(createElement(mod.exports.Owner,{...props,data:{...props.data,publicLocked:locked,activePlayers:locked?2:0,game:{...props.data.game,visibility:'public',published:true,status:'running'}}}));
  const buttons=[...rendered.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
  for(const label of ['Skrýt z mapy','Upravit veřejnou výpravu','Smazat celou výpravu']){const button=buttons.find(b=>b[2].includes(label));assert.ok(button,label);assert.equal(button[1].includes('disabled=""'),locked,label);}
 }

});
