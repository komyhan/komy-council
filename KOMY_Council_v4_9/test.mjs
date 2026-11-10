import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync('worker.mjs','utf8').replace('/*HTML*/','"test"');
const {default:worker,validate}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
test('reject fabricated agent authors and invalid decisions',()=>{
 assert.throws(()=>validate({version:0,type:'message',payload:{topicId:'scope',text:'fake',author:'agent'}}));
 assert.throws(()=>validate({version:0,type:'decision',payload:{topicId:'scope',text:'yes',status:'anything'}}));
});
test('reject absent authentication and cross-origin writes',async()=>{
 let r=await worker.fetch(new Request('https://test/api/events'),{});assert.equal(r.status,401);
 r=await worker.fetch(new Request('https://test/api/events',{method:'POST',headers:{'oai-authenticated-user-id':'u','Origin':'https://evil','Content-Type':'application/json'},body:'{}'}),{DB:{}});assert.equal(r.status,403);
});
test('stale writes return conflict and do not claim success',async()=>{
 const req=new Request('https://test/api/events',{method:'POST',headers:{'oai-authenticated-user-id':'u','Origin':'https://test','Content-Type':'application/json'},body:JSON.stringify({version:0,type:'direction',payload:{text:'goal'}})});
 const DB={prepare:()=>({bind:()=>({run:async()=>({meta:{changes:0}})})})};
 const r=await worker.fetch(req,{DB});assert.equal(r.status,409);
});
test('embedded browser script parses',()=>{
 const html=readFileSync('app.html','utf8');const script=html.match(/<script>([\s\S]*)<\/script>/)[1];assert.doesNotThrow(()=>new Function(script));
});

test('discussion timeline puts new opinions and decisions above older runs without changing records',async()=>{
 const {orderTimeline}=await import('./timeline-layout.mjs');
 const records=[{key:'run-old',date:'2026-11-09T08:00:00Z'},{key:'decision-new',date:'2026-11-09T10:00:00Z'},{key:'message-middle',date:'2026-11-09T09:00:00Z'}];
 const result=orderTimeline(records);assert.deepEqual(result.map(r=>r.key),['decision-new','message-middle','run-old']);assert.equal(records[0].key,'run-old');assert.equal(result[0],records[1]);
});
