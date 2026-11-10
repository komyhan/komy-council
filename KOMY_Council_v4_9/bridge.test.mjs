import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {migrate} from './debate.mjs';
import {migrateProjects} from './projects.mjs';
import {WorkshopBridge,fireURL,reserveCost} from './workshop-bridge.mjs';
const sha='a'.repeat(40),base='b'.repeat(40),url='https://api.anthropic.com/v1/claude_code/routines/trig_test/fire';
async function fixture(options={}){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE council_events(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT,type TEXT,payload TEXT,created_at TEXT)');migrateProjects(db);migrate(db);
 const add=(type,payload)=>db.prepare('INSERT INTO council_events(actor,type,payload,created_at) VALUES(?,?,?,?)').run('local',type,JSON.stringify({projectId:'erp',...payload}),'2026-11-09T00:00:00Z');
 add('topic',{topicId:'test',title:'예약 기능',text:'가상 자료'});add('message',{topicId:'test',author:'sean',text:'중복 예약을 막아줘'});add('decision',{topicId:'test',status:'approved',text:'가상 자료 시험만 허용'});
 let saved=null,id=null,apiCalls=0,captured=null,reviewPrompt=null;
 const vault={load:async()=>saved,save:async v=>saved=v};
 const fetcher=async(u,init={})=>{
  if(u===url){captured=JSON.parse(init.body);id=JSON.parse(captured.text).marker.slice(5);if(options.dispatchStatus)return Response.json({error:{type:'authentication_error',message:'private-code cloud-secret'}},{status:options.dispatchStatus});return Response.json(options.badSession?{unexpected:'format'}:{claude_code_session_url:'https://claude.ai/code/session_test'});}
  if(u==='https://api.openai.com/v1/responses'){apiCalls++;reviewPrompt=JSON.parse(JSON.parse(init.body).input);if(options.fail)throw Error('network');return Response.json({status:options.incomplete?'incomplete':'completed',usage:{input_tokens:2000,output_tokens:500},output:[{type:'message',content:[{type:'output_text',text:'검토 의견: 중복 입력 시험 추가 필요. 정확성 인증 아님.'}]}]});}
  if(u.includes('/pulls?'))return Response.json([{number:1,body:'KOMY-'+id}]);
  if(u.endsWith('/pulls/1')&&init.headers.Accept.includes('diff'))return new Response('diff --git a/reserve.js b/reserve.js\n+ checkDuplicate(id)');
  if(u.endsWith('/pulls/1'))return Response.json({number:1,state:'open',title:'예약',body:'KOMY-'+id,html_url:'https://github.com/owner/repo/pull/1',head:{sha,repo:{full_name:'owner/repo'}},base:{sha:base}});
  if(u.includes('/check-runs'))throw Error('Checks API must never be called with this integration');
  if(u.includes('/status?'))return Response.json({total_count:options.pending||options.statusFailed?1:0,statuses:options.pending?[{context:'unit',state:'pending'}]:options.statusFailed?[{context:'unit',state:'failure'}]:[]});throw Error('unexpected URL '+u);
 };
 const bridge=new WorkshopBridge(db,{vault,fetcher,getConfig:()=>({openaiKey:'test-key'}),clock:()=> '2026-11-09T12:00:00Z'});await bridge.ready;
 await bridge.connect({projectId:'erp',url,repo:'owner/repo',token:'cloud-secret',githubToken:'github-secret'});
 const send=()=>bridge.dispatch({projectId:'erp',topicId:'test',version:3,instruction:'30분 이내. 가상 시험과 초안 PR 1개만.',acknowledged:true});
 const enable=(patch={})=>bridge.policy({enabled:true,daily:1,monthly:10,calls:10,model:'gpt-5.4-mini',acknowledged:true,...patch});
 return {db,bridge,add,send,enable,calls:()=>apiCalls,payload:()=>captured,reviewPrompt:()=>reviewPrompt};
}
test('official endpoint only; reject token forwarding and arbitrary URLs',()=>{
 assert.equal(fireURL(url),url);for(const bad of ['https://evil.test/fire',url+'?x=1',url+'#foo','http://api.anthropic.com/v1/claude_code/routines/a/fire','https://x@api.anthropic.com/v1/claude_code/routines/a/fire'])assert.throws(()=>fireURL(bad));
 assert.ok(reserveCost('한글 '.repeat(20000),'gpt-5.4-mini').inputBound>20000);
});
test('latest instructions and consent travel, secrets stay out, no duplicate dispatch',async()=>{
 const f=await fixture();await f.send();const text=f.payload().text;assert.match(text,/중복 예약/);assert.match(text,/가상 자료 시험만 허용/);assert.doesNotMatch(text,/cloud-secret|github-secret|test-key/);assert.doesNotMatch(JSON.stringify(f.bridge.list('erp')),/cloud-secret|github-secret|test-key/);await assert.rejects(f.send(),/이미 전달/);assert.equal(f.calls(),0);assert.equal(f.bridge.settings().enabled,false);f.db.close();
});
test('PR discovered; one paid review per code version; actual cost includes all output',async()=>{
 const f=await fixture();f.enable();await f.send();await f.bridge.poll();await f.bridge.poll();const r=f.bridge.list('erp').requests[0];assert.equal(f.calls(),1);assert.equal(r.reviews[0].status,'completed');assert.equal(r.reviews[0].commit_sha,sha);assert.equal(r.reviews[0].source_version,3);assert.ok(Math.abs(f.bridge.spend().day-.00375)<1e-9);f.db.close();
});
test('daily, monthly, and call budgets block before billable API request',async()=>{
 for(const patch of [{daily:.00001},{monthly:.00001}]){const f=await fixture();f.enable(patch);await f.send();await f.bridge.poll();assert.equal(f.calls(),0);assert.match(f.bridge.list('erp').requests[0].result.error,/한도/);f.db.close();}
 const f=await fixture();f.enable({calls:1});await f.send();await f.bridge.poll();await assert.rejects(f.bridge.review({id:'other'},'another',JSON.stringify({commit:sha,assignment:{version:3}})),/한도/);assert.equal(f.calls(),1);f.db.close();
});
test('uncertain charges reserve the maximum; no automatic API retry',async()=>{
 const f=await fixture({fail:true});f.enable();await f.send();await f.bridge.poll();const spend=f.bridge.spend().day;assert.ok(spend>0);await f.bridge.poll();assert.equal(f.calls(),1);assert.equal(f.bridge.list('erp').requests[0].reviews[0].status,'unknown');assert.equal(f.bridge.spend().day,spend);f.db.close();
});
test('incomplete output never presented as completed review',async()=>{
 const f=await fixture({incomplete:true});f.enable();await f.send();await f.bridge.poll();const r=f.bridge.list('erp').requests[0];assert.equal(r.reviews[0].status,'incomplete');assert.equal(r.result.reviewStatus,'incomplete');f.db.close();
});
test('changed instructions and running CI postpone review without API charge',async()=>{
 const f=await fixture();f.enable();await f.send();f.add('message',{topicId:'test',text:'추가 조건'});await f.bridge.poll();assert.equal(f.calls(),0);assert.match(f.bridge.list('erp').requests[0].result.error,/지시가 변경/);f.db.close();
 const g=await fixture({pending:true});g.enable();await g.send();await g.bridge.poll();assert.equal(g.calls(),0);assert.match(g.bridge.list('erp').requests[0].result.error,/CI 시험/);g.db.close();
});
test('project isolation, stale transmission and policy consent',async()=>{
 const f=await fixture();assert.throws(()=>f.bridge.policy({enabled:true,daily:1,monthly:10,calls:10,model:'gpt-5.4-mini'}),/확인/);await assert.rejects(f.bridge.dispatch({projectId:'erp',topicId:'test',version:0,instruction:'do',acknowledged:true}),/변경/);await f.send();assert.equal(f.bridge.list('workshop').requests.length,0);assert.throws(()=>f.bridge.close({projectId:'workshop',id:f.bridge.list('erp').requests[0].id}));f.db.close();
});
test('combined browser script parses',()=>{
 const names=['project-ui.js','debate-ui.js','jobs-ui.js','bridge-ui.js'];const source=names.map(n=>readFileSync(n,'utf8')).join('\n');assert.doesNotThrow(()=>new Function(source));
});
test('closing monitoring cannot be undone by an in-flight poll result',async()=>{
 const f=await fixture();const id=await f.send();f.bridge.close({projectId:'erp',id});f.bridge.update(id,'sent',{error:'late response'});assert.equal(f.bridge.list('erp').requests[0].status,'closed');f.db.close();
});
test('fine-grained token reviews code without Checks API and explicitly preserves missing CI evidence',async()=>{
 const f=await fixture();f.enable();await f.send();await f.bridge.poll();assert.equal(f.calls(),1);const ci=f.reviewPrompt().ci;assert.equal(ci.checks,null);assert.equal(ci.checksState,'unavailable');assert.deepEqual(ci.statuses,[]);assert.match(ci.notice,/미확인/);assert.match(f.bridge.list('erp').requests[0].result.ciWarning,/미확인/);f.db.close();
});
test('failed commit status is provided to reviewer and never converted to success',async()=>{
 const f=await fixture({statusFailed:true});f.enable();await f.send();await f.bridge.poll();assert.equal(f.reviewPrompt().ci.statuses[0].state,'failure');assert.equal(f.reviewPrompt().ci.checksState,'unavailable');f.db.close();
});
test('real HTTP rejection is recorded safely and blocked from duplicate transmission',async()=>{
 const f=await fixture({dispatchStatus:401});await assert.rejects(f.send(),/HTTP 401/);const r=f.bridge.list('erp').requests[0];assert.equal(r.status,'dispatch_unknown');assert.equal(r.result.status,401);assert.ok(r.result.requestBytes>0);assert.doesNotMatch(JSON.stringify(r.result),/private-code|cloud-secret/);await assert.rejects(f.send(),/이미 전달/);f.db.close();
});
test('unexpected successful response remains unknown and does not claim delivery',async()=>{
 const f=await fixture({badSession:true});await assert.rejects(f.send(),/HTTP 200/);assert.equal(f.bridge.list('erp').requests[0].status,'dispatch_unknown');f.db.close();
});
test('connection metadata exposes presence flags only; blank token saves keep real credentials',async()=>{
 const f=await fixture();await f.bridge.connect({projectId:'erp',url,repo:'owner/repo',token:'',githubToken:''});const data=f.bridge.list('erp');assert.equal(data.connection.tokenPresent,true);assert.equal(data.connection.githubTokenPresent,true);assert.equal(data.api.openaiKeyPresent,true);assert.doesNotMatch(JSON.stringify(data),/cloud-secret|github-secret|test-key/);await assert.rejects(f.bridge.connect({projectId:'erp',url,repo:'owner/repo',token:'********'}),/별표/);await f.send();assert.equal(f.bridge.list('erp').requests[0].status,'sent');f.db.close();
});


test('followup carries the reviewed commit, original limits and user note, closes parent only once',async()=>{
 const f=await fixture();f.enable();await f.send();await f.bridge.poll();const parent=f.bridge.list('erp').requests[0],review=parent.reviews[0];
 const args={projectId:'erp',id:parent.id,reviewId:review.id,note:'필수 지적만 보완. 기존 한도 유지.',acknowledged:true,executionChecked:true,version:3};
 const id=await f.bridge.followup(args);const payload=JSON.parse(f.payload().text);assert.equal(payload.assignment.followup.parentId,parent.id);assert.equal(payload.assignment.followup.commit,sha);assert.equal(payload.assignment.followup.review,review.report);assert.match(payload.assignment.instruction,/30분/);assert.match(payload.assignment.instruction,/필수 지적만/);assert.equal(f.calls(),1);
 const old=f.bridge.list('erp').requests.find(r=>r.id===parent.id);assert.equal(old.status,'closed');assert.equal(old.result.followupId,id);await assert.rejects(f.bridge.followup(args),/이미/);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bridge_requests').get().n,2);f.db.close();
});
test('invalid followup cannot close parent or send another job',async()=>{
 const f=await fixture();f.enable();await f.send();await f.bridge.poll();const r=f.bridge.list('erp').requests[0];const args={projectId:'erp',id:r.id,reviewId:r.reviews[0].id,note:'보완',acknowledged:true,executionChecked:true,version:3};
 for(const patch of [{executionChecked:false},{reviewId:'wrong'},{version:0},{note:''},{projectId:'workshop'}])await assert.rejects(f.bridge.followup({...args,...patch}));
 assert.equal(f.bridge.list('erp').requests[0].status,'sent');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM bridge_requests').get().n,1);f.db.close();
});
test('changed PR commit blocks followup and uncertain dispatch preserves a single successor',async()=>{
 const f=await fixture();f.enable();await f.send();await f.bridge.poll();const r=f.bridge.list('erp').requests[0],args={projectId:'erp',id:r.id,reviewId:r.reviews[0].id,note:'보완',acknowledged:true,executionChecked:true,version:3};
 const original=f.bridge.fetch;f.bridge.fetch=async(u,init)=>u.endsWith('/pulls/1')?Response.json({state:'open',head:{sha:'c'.repeat(40),repo:{full_name:'owner/repo'}}}):original(u,init);
 await assert.rejects(f.bridge.followup(args),/바뀌/);assert.equal(f.bridge.list('erp').requests[0].status,'sent');
 f.bridge.fetch=async(u,init)=>u===url?Response.json({error:{type:'authentication_error'}},{status:401}):original(u,init);
 await assert.rejects(f.bridge.followup(args),/401/);await assert.rejects(f.bridge.followup(args),/이미/);
 const rows=f.bridge.list('erp').requests;assert.equal(rows.length,2);assert.equal(rows.find(x=>x.id!==r.id).status,'dispatch_unknown');assert.equal(rows.find(x=>x.id===r.id).status,'closed');f.db.close();
});
