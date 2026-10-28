import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
test('pre-start compass presents navigation and explicit start with no running timer',async()=>{
 const built=await build({stdin:{contents:"export {default as Travel} from './TravelScreen.jsx';export {StartConfirmation} from './PublicExpeditionDetail.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const props={game:{name:'Les',mode:'race',totalStations:2},team:{name:'Hráč',index:0,penaltyMs:0,station:{name:'Start',lat:49.3,lng:17.39,radius:25}},position:{lat:49.3,lng:17.39,acc:5},heading:0,elapsed:0,total:0,preparing:true};
 const html=renderToStaticMarkup(createElement(mod.exports.Travel,props));
 for(const text of ['Čas neběží','Zahájit hru','Navigovat','Zpět na detail výpravy'])assert.ok(html.includes(text),text);
 assert.equal(html.includes('Ověřujeme příchod'),false);
 const running=renderToStaticMarkup(createElement(mod.exports.Travel,{...props,preparing:false,elapsed:120000}));
 assert.ok(running.includes('00:02:00'));assert.equal(running.includes('Zahájit hru'),false);
 const dialog=renderToStaticMarkup(createElement(mod.exports.StartConfirmation,{}));
 for(const text of ['jediný pokus','započítá se i cesta','Šifra se odemkne až po příchodu'])assert.ok(dialog.includes(text),text);
});
