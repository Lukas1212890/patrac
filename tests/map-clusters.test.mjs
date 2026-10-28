import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterMapPoints,clusterNeedsList} from '../app/lib/mapClusters.mjs';
import {filterMapExpeditions} from '../app/lib/mapPlayStatus.mjs';
import {project} from '../app/lib/mapProjection.mjs';
const items=[{code:'A',name:'První',lat:49.3,lng:17.39},{code:'B',name:'Druhá',lat:49.3001,lng:17.3901,playStatus:'completed'},{code:'C',name:'Třetí',lat:50,lng:18,playStatus:'abandoned'}];
test('nearby starts cluster at low zoom and split when zoomed in, preserving every expedition once',()=>{
 const groups=clusterMapPoints(items,p=>project(p,10));assert.equal(groups.length,2);assert.equal(groups[0].items.length,2);
 assert.equal(clusterMapPoints(items,p=>project(p,19)).length,3);
 assert.deepEqual(groups.flatMap(g=>g.items).map(x=>x.code).sort(),['A','B','C']);
 assert.deepEqual(clusterMapPoints([...items].reverse(),p=>project(p,10)),groups);
});
test('filters apply before counting and coincident starts open a list without endless zooming',()=>{
 const selected=filterMapExpeditions(items,['completed']);assert.equal(clusterMapPoints(selected,p=>project(p,6))[0].items.length,1);
 assert.deepEqual(clusterMapPoints([],p=>project(p,6)),[]);
 assert.equal(clusterNeedsList([items[0],{...items[0],code:'D'}],6,19),true);
 assert.equal(clusterNeedsList(items,18,19),false);assert.equal(clusterNeedsList(items,19,19),true);
});
test('dense map groups do not overlap touch targets and contain all 150 loaded items',()=>{
 const dense=Array.from({length:150},(_,i)=>({code:String(i).padStart(3,'0'),x:(i%15)*11,y:Math.floor(i/15)*11}));
 const groups=clusterMapPoints(dense,p=>p);assert.ok(groups.length<20);
 assert.equal(groups.flatMap(g=>g.items).length,150);
 for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)assert.ok(Math.hypot(groups[i].x-groups[j].x,groups[i].y-groups[j].y)>=44);
});
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('fallback map uses numbered clusters and shared-start picker shows individual status and safe titles',async()=>{
 const built=await build({stdin:{contents:"export {RasterMap} from './PatracMap.jsx';export {default as Picker} from './MapClusterPicker.jsx';",resolveDir:process.cwd()+'/app/components',loader:'jsx'},bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',write:false,logLevel:'silent'});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const shared=[items[0],{...items[0],code:'B',name:'<script>test</script>',playStatus:'completed'}];
 const map=renderToStaticMarkup(createElement(mod.exports.RasterMap,{overview:true,points:shared,baseMap:'map'}));
 assert.equal((map.match(/class="p-community-pin /g)||[]).length,1);assert.ok(map.includes('is-cluster'));assert.ok(map.includes('2 výprav'));
 const picker=renderToStaticMarkup(createElement(mod.exports.Picker,{items:shared}));assert.ok(picker.includes('První'));assert.ok(picker.includes('Dokončeno'));assert.ok(picker.includes('&lt;script&gt;'));assert.equal(picker.includes('<script>'),false);
});
