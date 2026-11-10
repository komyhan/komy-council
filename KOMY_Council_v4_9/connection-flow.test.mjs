import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyConnection} from './connection-flow.mjs';
test('list action applies settings, queries both providers and reports progress and counts',async()=>{
 const calls=[],statuses=[],received=[];
 await applyConnection({remember:true},'models',{post:async(path,body)=>{calls.push([path,body]);return path.endsWith('settings')?{saved:true}:{models:[{id:'model-1',name:'Model'}]};},onStatus:(...args)=>statuses.push(args),onModels:(...args)=>received.push(args)});
 assert.deepEqual(calls.map(c=>c[0]),['/api/debate/settings','/api/debate/models','/api/debate/models']);
 assert.deepEqual(calls.slice(1).map(c=>c[1]),[{provider:'claude'},{provider:'gpt'}]);assert.equal(received.length,2);assert.ok(statuses.some(s=>s[0]==='claude'&&s[1].includes('조회 중')));assert.ok(statuses.some(s=>s[0]==='gpt'&&s[1].includes('1개')));
});
test('one provider failure remains visible while the other provider still loads',async()=>{
 const states={};let modelCount=0;
 await applyConnection({},'models',{post:async(path,body)=>{if(path.endsWith('settings'))return {saved:true};if(body.provider==='claude')throw Error('권한 없음 (403)');return {models:[{id:'gpt-test'}]};},onStatus:(key,text,error)=>states[key]={text,error},onModels:()=>modelCount++});
 assert.equal(states.claude.error,true);assert.match(states.claude.text,/403/);assert.match(states.claude.text,/직접 입력/);assert.match(states.gpt.text,/1개/);assert.equal(modelCount,1);
});
test('settings failure prevents list requests and save action never queries models',async()=>{
 let calls=0;await assert.rejects(()=>applyConnection({},'models',{post:async()=>{calls++;throw Error('vault failed');},onStatus:()=>{},onModels:()=>{}}),/vault failed/);assert.equal(calls,1);
 calls=0;await applyConnection({},'save',{post:async()=>{calls++;return {saved:false};},onStatus:()=>{},onModels:()=>{throw Error('not expected');}});assert.equal(calls,1);
});
test('empty lists produce explicit status rather than silent success',async()=>{
 const messages=[];await applyConnection({},'models',{post:async path=>path.endsWith('settings')?{saved:false}:{models:[]},onStatus:(key,text)=>messages.push(text),onModels:()=>{}});assert.equal(messages.filter(t=>t.includes('비어 있어')).length,2);
});
test('built page scripts parse and model buttons use explicit click actions',async()=>{
 const source=readFileSync('debate-ui.js','utf8');assert.match(source,/id="loadModels"/);assert.ok(source.includes("document.querySelector('#loadModels').onclick=()=>action('models')"));assert.ok(!source.includes('e.submitter'));
 const worker=(await import('./dist/server/index.js?qa=3.1')).default;const html=await (await worker.fetch(new Request('https://test/'),{})).text();const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,2);for(const script of scripts)assert.doesNotThrow(()=>new Function(script[1]));
});
