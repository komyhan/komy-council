import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DebateEngine,callProvider} from './debate.mjs';
function setup(call){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE council_events(id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, type TEXT, payload TEXT, created_at TEXT)');const e=new DebateEngine(db,{call});e.configure({claudeKey:'secret-c',openaiKey:'secret-o',claudeModel:'test-c',openaiModel:'test-o'});return {db,e};}
const output=(p,n=0)=>({text:'reply-'+p+'-'+n,model:'test-'+p,responseId:'id-'+n,usage:{input_tokens:12,output_tokens:15}});
function answer(p,prompt,n){
 const d=JSON.parse(prompt.split('\n')[1]),o=output(p,n),ref={source:'D1',quote:d.sources.D1||'not used'};
 if(d.stage===2||d.stage===3)o.text=JSON.stringify({observations:[{kind:'agree',claim:'작업 분배를 자동 허용하는 제안',refs:[ref]}],proposal:'reply-'+p+'-'+n,openQuestions:[]});
 if(d.stage===4)o.text=JSON.stringify({proposals:[{text:'작업 분배 허용 제안',refs:[ref]}],disagreements:[],assumptions:[],tests:['운영 권한 차단 시험'],decisions:['범위 확정']});
 if(d.stage===5)o.text=JSON.stringify({verdict:'pass',issues:[]});return o;
}
const topic={id:'authority',title:'자동 처리 범위',text:'중요 결정은 션오빠 승인'};
test('six grounded steps, independent drafts and reviews, no automatic approval, audit metadata',async()=>{
 const prompts=[];const {db,e}=setup(async(p,c,prompt)=>{prompts.push(prompt);return answer(p,prompt,prompts.length);});
 const id=e.start(topic,[],0,true);await e.pending;
 const run=e.list()[0];assert.equal(run.id,id);assert.equal(run.status,'awaiting_approval');assert.equal(run.attempts,6);assert.equal(run.outputs.length,6);
 assert.ok(!prompts[1].includes('reply-claude-1'));assert.ok(prompts[2].includes('reply-claude-1'));assert.ok(prompts[2].includes('reply-gpt-2'));assert.ok(!prompts[3].includes('reply-claude-3'));assert.ok(prompts[4].includes('reply-claude-3'));
 assert.equal(db.prepare('SELECT count(*) AS n FROM council_events').get().n,0);assert.equal(run.outputs[0].prompt_hash.length,64);assert.ok(!JSON.stringify(run).includes('secret-c'));db.close();
});
test('failed stage preserved, explicit resume skips completed output, attempts are bounded',async()=>{
 let n=0;const {db,e}=setup(async(p,c,prompt)=>{n++;if(n===2)throw Error('secret-c should never be saved');return answer(p,prompt,n);});
 const id=e.start(topic,[],0,true);await e.pending;assert.equal(e.list()[0].status,'failed');assert.equal(e.list()[0].step,1);assert.ok(!JSON.stringify(e.list()).includes('secret-c'));
 assert.throws(()=>e.resume(id,false));e.resume(id,true);await e.pending;assert.equal(e.list()[0].status,'awaiting_approval');assert.equal(e.list()[0].attempts,7);assert.equal(e.list()[0].outputs.length,6);db.close();
});
test('cancel aborts in-flight provider, never advances or marks approved',async()=>{
 const {db,e}=setup((p,c,t,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})));
 const id=e.start(topic,[],0,true);assert.throws(()=>e.start(topic,[],0,true));e.cancel(id);await e.pending;const r=e.list()[0];assert.equal(r.status,'cancelled');assert.equal(r.step,0);assert.equal(r.attempts,1);db.close();
});
test('new protocol failures stop at nine attempts, no automatic retry',async()=>{
 let n=0;const {db,e}=setup(async()=>{n++;throw Error('network');});const id=e.start(topic,[],0,true);await e.pending;
 assert.equal(n,1);for(let i=0;i<8;i++){e.resume(id,true);await e.pending;}assert.equal(n,9);assert.throws(()=>e.resume(id,true));db.close();
});
test('missing consent, stale version and oversized sources do not trigger a provider',()=>{
 const {db,e}=setup(async()=>{throw Error('not reached');});assert.throws(()=>e.start(topic,[],0,false));assert.throws(()=>e.start(topic,[],1,true));assert.throws(()=>e.start(topic,[{type:'direction',payload:{text:'a'.repeat(61000)}}],0,true));assert.equal(e.list().length,0);db.close();
});
test('server restart marks unfinished runs interrupted; does not auto-call',()=>{
 const {db,e}=setup(async()=>output('gpt'));const now=new Date().toISOString();db.prepare('INSERT INTO debate_runs(id,topic_id,snapshot,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('old','authority','{}','running',now,now);
 const second=new DebateEngine(db,{call:async()=>{throw Error('must not run');}});assert.equal(second.list()[0].status,'interrupted');assert.equal(second.info().configured,false);db.close();
});
test('provider adapters parse raw response JSON, use fixed official endpoints and reject truncated responses',async()=>{
 const config={claudeKey:'secret-c',openaiKey:'secret-o',claudeModel:'test-c',openaiModel:'test-o'};let body;
 const a=await callProvider('gpt',config,'prompt',undefined,async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');body=JSON.parse(opts.body);return Response.json({status:'completed',id:'r',model:'m',output:[{type:'message',content:[{type:'output_text',text:'valid'}]}]});});
 assert.equal(a.text,'valid');assert.equal(body.store,false);assert.equal(body.max_output_tokens,6000);assert.ok(!body.tools);
 const b=await callProvider('claude',config,'prompt',undefined,async(url,opts)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(JSON.parse(opts.body).max_tokens,4096);return Response.json({content:[{type:'text',text:'valid'}],stop_reason:'end_turn'});});assert.equal(b.text,'valid');
 await assert.rejects(()=>callProvider('gpt',config,'p',undefined,async()=>Response.json({status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'partial'}]}]})),/INCOMPLETE/);
 await assert.rejects(()=>callProvider('claude',config,'p',undefined,async()=>Response.json({content:[{type:'text',text:'partial'}],stop_reason:'max_tokens'})),/INCOMPLETE/);
 await assert.rejects(()=>callProvider('claude',config,'p',undefined,async()=>new Response('secret-c',{status:401})),/API_HTTP_401/);
});
