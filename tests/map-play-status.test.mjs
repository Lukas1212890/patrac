import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPlayStatus} from '../app/lib/mapPlayStatus.mjs';
test('map uses distinct symbols and accessible labels, retaining normal discovery pins',()=>{
 assert.deepEqual(mapPlayStatus('completed'),{symbol:'✓',label:'Dokončeno',className:'is-completed'});
 assert.deepEqual(mapPlayStatus('abandoned'),{symbol:'×',label:'Ukončeno bez dokončení',className:'is-abandoned'});
 assert.equal(mapPlayStatus(null).symbol,'✦');assert.equal(mapPlayStatus('unknown').className,'');
});

import {filterMapExpeditions,MAP_FILTER_GROUPS,parseMapFilters} from '../app/lib/mapPlayStatus.mjs';
test('map filters combine categories, support none and retain ordinary and running expeditions',()=>{
 const items=[{code:'new'},{code:'running',playStatus:null},{code:'done',playStatus:'completed'},{code:'ended',playStatus:'abandoned'}];
 assert.deepEqual(filterMapExpeditions(items,MAP_FILTER_GROUPS),items);
 assert.deepEqual(filterMapExpeditions(items,[]),[]);
 assert.deepEqual(filterMapExpeditions(items,['completed','abandoned']).map(x=>x.code),['done','ended']);
 assert.deepEqual(filterMapExpeditions(items,['available']).map(x=>x.code),['new','running']);
 assert.deepEqual(parseMapFilters('[]'),[]);assert.deepEqual(parseMapFilters('["completed"]'),['completed']);
 for(const value of [null,'bad','{}','["unknown"]'])assert.deepEqual(parseMapFilters(value),MAP_FILTER_GROUPS);
});

import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('filter dialog offers four accessible checkboxes and explains an empty selection',async()=>{
 const built=await build({entryPoints:['app/components/MapFilters.jsx'],bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const html=renderToStaticMarkup(createElement(mod.exports.default,{selected:['completed'],onChange(){},onClose(){}}));
 assert.equal((html.match(/type="checkbox"/g)||[]).length,4);assert.equal((html.match(/checked=""/g)||[]).length,1);
 for(const text of ['Všechny výpravy','Nezahájené a rozehrané','Ukončené bez dokončení','Dokončené','Zobrazit výpravy'])assert.ok(html.includes(text));
 const none=renderToStaticMarkup(createElement(mod.exports.default,{selected:[],onChange(){},onClose(){}}));assert.ok(none.includes('Není vybraná žádná skupina'));
});
