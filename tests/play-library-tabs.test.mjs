import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const profile={games:[{code:'A',name:'Vytvořená veřejná',visibility:'public',totalStations:2},{code:'B',name:'Vytvořená soukromá',visibility:'private',totalStations:2}],privateGames:[{code:'C',gameName:'Hraná soukromá'}],privateHistory:[{id:'old',name:'Staré hraní',finishedAt:1000,totalMs:1000}]};
async function render(section,filter){
 const b=await build({entryPoints:['app/components/PlayLibrary.jsx'],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent',plugins:[{name:'fixture',setup(b){b.onLoad({filter:/PlayLibrary\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace("useState('created')",`useState('${section}')`).replaceAll("useState('all')",`useState('${filter}')`).replace('[profile,setProfile]=useState(null)',`[profile,setProfile]=useState(${JSON.stringify(profile)})`).replace('[checkingPrivate,setCheckingPrivate]=useState(true)','[checkingPrivate,setCheckingPrivate]=useState(false)').replace('[attempts,setAttempts]=useState(null)',`[attempts,setAttempts]=useState([{id:'p',code:'D',name:'Hraná veřejná',index:0,totalStations:2}])`)}));}}]});
 const m={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports);return renderToStaticMarkup(React.createElement(m.exports.default,{user:{id:'user'},saved:[]}));
}
test('created and played sections filter public and private games without leaking other panels',async()=>{
 const created=await render('created','all');assert.match(created,/Vytvořená veřejná/);assert.match(created,/Vytvořená soukromá/);assert.ok(!created.includes('Hraná veřejná'));assert.ok(!created.includes('Obnovit přístup ze zálohy'));
 const pub=await render('created','public');assert.match(pub,/Vytvořená veřejná/);assert.ok(!pub.includes('Vytvořená soukromá'));
 const priv=await render('created','private');assert.match(priv,/Vytvořená soukromá/);assert.ok(!priv.includes('Vytvořená veřejná'));
 const played=await render('played','all');assert.match(played,/Hraná veřejná/);assert.match(played,/Hraná soukromá/);assert.match(played,/Staré hraní/);assert.ok(!played.includes('Vytvořená veřejná'));
 const playedPub=await render('played','public');assert.match(playedPub,/Hraná veřejná/);assert.ok(!playedPub.includes('Hraná soukromá'));assert.ok(!playedPub.includes('Staré hraní'));assert.ok(!playedPub.includes('Obnovit přístup ze zálohy'));
 const playedPriv=await render('played','private');assert.match(playedPriv,/Hraná soukromá/);assert.ok(!playedPriv.includes('Hraná veřejná'));assert.match(playedPriv,/Obnovit přístup ze zálohy/);
});
