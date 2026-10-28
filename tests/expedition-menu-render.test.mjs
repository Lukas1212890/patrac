import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
test('expedition menu separates section navigation from permanent ending and hides ending before start',async()=>{
 const built=await build({entryPoints:['app/components/ExpeditionMenu.jsx'],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,mod,mod.exports);
 const html=renderToStaticMarkup(createElement(mod.exports.default,{running:true,canAbandon:true,online:true}));
 for(const text of ['Mapa','Moje hry a výpravy','Žebříčky','Ukončit výpravu','Čas běží dál'])assert.ok(html.includes(text),text);
 assert.equal(html.includes('Ano, trvale ukončit můj pokus'),false);
 const preparing=renderToStaticMarkup(createElement(mod.exports.default,{running:false,canAbandon:false,online:true}));
 assert.equal(preparing.includes('Ukončit výpravu'),false);assert.equal(preparing.includes('Čas běží dál'),false);
});
