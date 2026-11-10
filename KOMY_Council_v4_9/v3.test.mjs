import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DebateEngine} from './debate.mjs';
import {documentsFrom,checkOutput,rejectionFeedback} from './protocol.mjs';
import {seedDocuments} from './seed.mjs';
import {createLocalAPI,approvalAllowed} from './local-api.mjs';
import {KeyVault} from './vault.mjs';
import {listModels,apiFailure,explainError} from './connections.mjs';
const topic={id:'scope',title:'작업 범위',text:'중요 결정은 승인한다.'};
const config={claudeKey:'dummy-c-secret',openaiKey:'dummy-o-secret',claudeModel:'test-c',openaiModel:'test-g'};
function database(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE council_events(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT,type TEXT,payload TEXT,created_at TEXT)');return db;}
function reply(provider,c,prompt){
 const d=JSON.parse(prompt.split('\n')[1]);let text;
 if(d.stage<2)text='작업 분배는 승인 범위 안에서 자동 허용한다.';
 else if(d.stage<4)text=JSON.stringify({observations:[{kind:'agree',claim:'두 초안은 작업 분배에 동의한다.',refs:[{source:'D1',quote:d.sources.D1},{source:'D2',quote:d.sources.D2}]}],proposal:'공통 제안 유지',openQuestions:[]});
 else if(d.stage===4)text=JSON.stringify({proposals:[{text:'범위 내 작업 분배 허용',refs:[{source:'D1',quote:d.sources.D1}]}],disagreements:[],assumptions:['운영 구조 미확인'],tests:['권한 차단 시험'],decisions:['허용 범위']});
 else text=JSON.stringify({verdict:'pass',issues:[]});
 return {text,model:'fake-'+provider,responseId:'test',usage:{input_tokens:1,output_tokens:1}};
}
test('fabricated quotes and one-sided disagreement are blocked',()=>{
 const snapshot={topic},results=[{step:0,text:'작업 분배는 범위 안에서 자동 허용한다.'},{step:1,text:'작업 분배는 승인 범위 안에서 자동 허용한다.'}];
 assert.throws(()=>checkOutput(snapshot,results,2,JSON.stringify({observations:[{kind:'disagree',claim:'없는 주장',refs:[{source:'D2',quote:'작업 분배를 조건부 허용하자고 했다.'}]}],proposal:'수정',openQuestions:[]})),/PROTOCOL_CITATION/);
 assert.throws(()=>checkOutput(snapshot,results,4,JSON.stringify({proposals:[{text:'유지',refs:[{source:'D1',quote:results[0].text}]}],disagreements:[{text:'양측 반대',refs:[{source:'D1',quote:results[0].text}]}],assumptions:[],tests:[],decisions:[]})),/PROTOCOL_DISAGREEMENT/);
});
test('semantic audit revise blocks approval, rather than treating AI agreement as proof',async()=>{
 const db=database(),e=new DebateEngine(db,{call:async(p,c,prompt)=>{const o=reply(p,c,prompt),d=JSON.parse(prompt.split('\n')[1]);if(d.stage===5)o.text=JSON.stringify({verdict:'revise',issues:[{claim:'오분류 점검',reason:'같은 원문에 반대라고 요약하면 안 됨',refs:[{source:'D1',quote:d.sources.D1}]}]});return o;}});e.configure(config);
 const id=e.start(topic,[],0,true);await e.pending;assert.equal(e.list()[0].status,'review_required');assert.equal(approvalAllowed(db,{runId:id,topicId:'scope'}),false);db.close();
});
test('invalid citation stops at review stage and never stores it as complete',async()=>{
 const db=database(),e=new DebateEngine(db,{call:async(p,c,prompt)=>{const o=reply(p,c,prompt),d=JSON.parse(prompt.split('\n')[1]);if(d.stage===2){const obj=JSON.parse(o.text);obj.observations[0].refs[0].quote='이 말은 실제 원문에 전혀 없다.';o.text=JSON.stringify(obj);}return o;}});e.configure(config);e.start(topic,[],0,true);await e.pending;const r=e.list()[0];assert.equal(r.status,'failed');assert.equal(r.step,2);assert.equal(r.outputs.length,2);assert.match(r.error,/PROTOCOL_CITATION/);db.close();
});
test('resume carries precise rejected citation feedback and keeps earlier steps intact',async()=>{
 const db=database();let broke=false,sawFeedback=false;
 const e=new DebateEngine(db,{call:async(p,c,prompt)=>{const o=reply(p,c,prompt),d=JSON.parse(prompt.split('\n')[1]);if(d.stage===3&&!broke){broke=true;const value=JSON.parse(o.text);value.observations[0].refs[0].quote='실제로 존재하지 않는 원문 문장';o.text=JSON.stringify(value);}else if(d.stage===3){sawFeedback=prompt.includes('실제로 존재하지 않는 원문 문장')&&prompt.includes('지정 원문에 이 연속 문구가 없음');}return o;}});
 e.configure(config);const id=e.start(topic,[],0,true);await e.pending;const old=e.list()[0].outputs.map(o=>o.response_id);assert.equal(e.list()[0].step,3);assert.equal(e.list()[0].attempts,4);
 e.resume(id,true);await e.pending;const run=e.list()[0];assert.equal(sawFeedback,true);assert.equal(run.status,'awaiting_approval');assert.equal(run.attempts,7);assert.deepEqual(run.outputs.slice(0,3).map(o=>o.response_id),old);assert.equal(run.rejections.length,1);db.close();
});
test('wrong-author citation and undersized headings stay invalid, with diagnostic feedback',()=>{
 const snapshot={topic,documents:[{text:'규칙 명세 → 테스트 → 무작위 시뮬레이션'}]},results=[{step:0,text:'승인된 범위 안에서 코드를 수정한다.'},{step:1,text:'main 병합·배포)은 션오빠 승인 대상. 권한 레이어.'}];
 const bad=JSON.stringify({observations:[{kind:'agree',claim:'양쪽 공통 의견',refs:[{source:'D1',quote:'규칙 명세 → 테스트 → 무작위 시뮬레이션'},{source:'D2',quote:'main 병합·배포)는 션오빠 승인 대상'},{source:'D2',quote:'권한 레이어'}]}],proposal:'제안',openQuestions:[]});
 assert.throws(()=>checkOutput(snapshot,results,3,bad),/PROTOCOL_CITATION/);const feedback=rejectionFeedback(snapshot,results,3,{text:bad,error_code:'PROTOCOL_CITATION'});assert.match(feedback,/S1/);assert.match(feedback,/8자보다 짧/);assert.match(feedback,/source 이름만 바꿔/);
});
test('reference seeding is once-only; disabled documents stay out of frozen snapshots',async()=>{
 const db=database();seedDocuments(db);const count=db.prepare('SELECT count(*) AS n FROM council_events').get().n;seedDocuments(db);assert.equal(db.prepare('SELECT count(*) AS n FROM council_events').get().n,count);assert.equal(count,3);
 const all=db.prepare('SELECT * FROM council_events ORDER BY id').all().map(e=>({...e,payload:JSON.parse(e.payload)}));const first=all[0].payload.sourceId;
 db.prepare('INSERT INTO council_events(actor,type,payload,created_at) VALUES(?,?,?,?)').run('user','source_toggle',JSON.stringify({sourceId:first,active:false}),new Date().toISOString());
 const events=db.prepare('SELECT * FROM council_events ORDER BY id').all().map(e=>({...e,payload:JSON.parse(e.payload)}));assert.equal(documentsFrom(events).length,2);
 const e=new DebateEngine(db,{call:async(p,c,prompt)=>reply(p,c,prompt)});e.configure(config);const id=e.start(topic,events,4,true);await e.pending;const run=e.list()[0];assert.equal(run.snapshot.documents.length,2);assert.equal(run.snapshot.documents.some(d=>d.sourceId===first),false);assert.ok(run.snapshot.documents.every(d=>d.hash.length===64));assert.equal(approvalAllowed(db,{runId:id,topicId:'scope'}),true);
 db.prepare('INSERT INTO council_events(actor,type,payload,created_at) VALUES(?,?,?,?)').run('user','direction','{"text":"new direction"}',new Date().toISOString());assert.equal(approvalAllowed(db,{runId:id,topicId:'scope'}),false);assert.equal(run.snapshot.documents.length,2);db.close();
});
test('legacy five-stage runs resume with original limit and existing outputs intact',async()=>{
 const db=database(),e=new DebateEngine(db,{call:async()=>({text:'legacy reply',model:'fake',responseId:null,usage:{}})});e.configure(config);const now=new Date().toISOString();db.prepare('INSERT INTO debate_runs VALUES(?,?,?,?,?,?,?,?,?)').run('old','scope',JSON.stringify({topic,sourceVersion:0}),'failed',2,3,null,now,now);
 for(let i=0;i<2;i++)db.prepare('INSERT INTO debate_outputs VALUES(?,?,?,?,?,?,?,?,?,?)').run('old',i,i?'gpt':'claude','독립 초안','old reply '+i,'old-model',null,'{}','old-hash',now);
 e.resume('old',true);await e.pending;const r=e.list()[0];assert.equal(r.status,'awaiting_approval');assert.equal(r.totalSteps,5);assert.equal(r.maxAttempts,8);assert.equal(r.outputs.length,5);assert.equal(r.outputs[0].text,'old reply 0');db.close();
});
test('settings preserve existing keys when blank, never return secrets, and require same-origin POST',async()=>{
 const db=database(),e=new DebateEngine(db);let saved=null;const vault={get exists(){return !!saved;},save:async c=>saved={...c},forget:()=>saved=null};const api=createLocalAPI(db,e,vault);
 const request=(path,body,origin='http://127.0.0.1:3217')=>new Request('http://127.0.0.1:3217'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await api(request('/api/debate/settings',config,'https://other'))).status,403);assert.equal(e.info().configured,false);
 assert.equal((await api(request('/api/debate/settings',{...config,remember:true}))).status,200);assert.equal(vault.exists,true);
 await api(request('/api/debate/settings',{claudeKey:'',openaiKey:'',claudeModel:'new-model',remember:true}));assert.equal(e.config.openaiKey,config.openaiKey);
 const state=await (await api(new Request('http://127.0.0.1:3217/api/debate'))).text();assert.ok(!state.includes('dummy-c-secret'));assert.ok(!state.includes('dummy-o-secret'));
 await api(request('/api/debate/forget',{}));assert.equal(e.info().configured,false);assert.equal(vault.exists,false);db.close();
});
test('model lookup paginates Claude and filters OpenAI candidates without generating replies',async()=>{
 let n=0;const c=await listModels('claude',config,async(url,opts)=>{n++;assert.equal(opts.method,undefined);assert.ok(url.startsWith('https://api.anthropic.com/v1/models'));if(n===2)assert.match(url,/after_id=one/);return Response.json({data:[{id:n===1?'claude-one':'claude-two'}],has_more:n===1,last_id:'one'});});assert.equal(c.length,2);
 const g=await listModels('gpt',config,async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/models');assert.equal(opts.method,undefined);return Response.json({data:[{id:'gpt-test'},{id:'gpt-audio'},{id:'gpt-image-1'},{id:'embedding-test'}]});});assert.deepEqual(g.map(m=>m.id),['gpt-test']);
 const e=await apiFailure(Response.json({error:{code:'insufficient_quota',message:'dummy-secret-must-not-leak'}},{status:429}));assert.match(explainError(e.message),/크레딧/);assert.ok(!e.message.includes('dummy-secret'));
});
test('Windows DPAPI survives a fresh vault instance and leaves no plaintext key on disk',{skip:process.platform!=='win32'},async()=>{
 const directory=mkdtempSync(join(process.cwd(),'komy-vault-test-')),path=join(directory,'keys.dpapi');try{const v=new KeyVault(path);await v.save(config);const bytes=readFileSync(path,'utf8');assert.ok(!bytes.includes('dummy-c-secret'));assert.ok(!bytes.includes('dummy-o-secret'));assert.deepEqual(await new KeyVault(path).load(),config);v.forget();assert.equal(v.exists,false);}finally{for(const f of [path,path+'.tmp']){try{unlinkSync(f);}catch{}}rmdirSync(directory);}
});

test('revision preserves original evidence, calls only summary and audit, and prevents duplicate revision',async()=>{
 const db=database();let revision=false;const seen=[];
 const e=new DebateEngine(db,{call:async(p,c,prompt)=>{const d=JSON.parse(prompt.split('\n')[1]);seen.push(d);const o=reply(p,c,prompt);if(d.stage===5&&!revision)o.text=JSON.stringify({verdict:'revise',issues:[{claim:'보완',reason:'시험 누락',refs:[{source:'D1',quote:d.sources.D1}]}]});return o;}});e.configure(config);
 const id=e.start(topic,[],0,true);await e.pending;const before=e.list().find(r=>r.id===id);
 assert.throws(()=>e.revise(id,false));revision=true;
 const child=e.revise(id,true);await e.pending;
 const rows=e.list(),r=rows.find(r=>r.id===child);
 assert.equal(r.status,'awaiting_approval');assert.equal(r.attempts,2);assert.equal(r.maxAttempts,2);
 assert.deepEqual(r.outputs.slice(0,4).map(o=>o.text),before.outputs.slice(0,4).map(o=>o.text));
 assert.equal(rows.find(r=>r.id===id).status,'review_required');
 assert.deepEqual(seen.slice(6).map(d=>d.stage),[4,5]);assert.ok(seen[6].revisionFeedback.audit);
 assert.throws(()=>e.revise(id,true),/이미/);db.close();
});
test('revision failures cannot exceed their two-attempt budget and do not approve',async()=>{
 const db=database();let fail=false;
 const e=new DebateEngine(db,{call:async(p,c,prompt)=>{if(fail)throw Error('API_HTTP_429');const o=reply(p,c,prompt),d=JSON.parse(prompt.split('\n')[1]);if(d.stage===5)o.text=JSON.stringify({verdict:'revise',issues:[{claim:'보완',reason:'누락',refs:[{source:'D1',quote:d.sources.D1}]}]});return o;}});e.configure(config);
 const id=e.start(topic,[],0,true);await e.pending;fail=true;const child=e.revise(id,true);await e.pending;e.resume(child,true);await e.pending;
 assert.throws(()=>e.resume(child,true),/2/);assert.equal(approvalAllowed(db,{runId:child,topicId:topic.id}),false);db.close();
});

test('summary retains nine or more planned tests and separates missing details',()=>{
 const results=[{step:0,text:'계산 결과는 독립 구현과 대조한다.'},{step:1,text:'승인 절차를 분리한다.'}];
 const summary={proposals:[{text:'검토 제안',refs:[{passage:'D1:L1'}]}],disagreements:[],missing:[{text:'한쪽만 제안한 검산 절차',refs:[{passage:'D1:L1'}]}],assumptions:[],tests:Array.from({length:12},(_,i)=>'[미실행 계획] 시험 '+i),decisions:Array.from({length:10},(_,i)=>'결정 '+i)};
 const checked=checkOutput({topic},results,4,JSON.stringify(summary));assert.equal(checked.tests.length,12);assert.equal(checked.missing.length,1);assert.equal(checked.disagreements.length,0);
 summary.tests=Array(25).fill('계획');assert.throws(()=>checkOutput({topic},results,4,JSON.stringify(summary)),/PROTOCOL_SCHEMA/);
});
test('legacy revision continues from latest audit, preserves history, and stops at round three',async()=>{
 const db=database();const prompts=[];
 const e=new DebateEngine(db,{call:async(p,c,prompt)=>{const d=JSON.parse(prompt.split('\n')[1]);prompts.push(d);const o=reply(p,c,prompt);if(d.stage===5)o.text=JSON.stringify({verdict:'revise',issues:[{claim:'남은 문제',reason:'검토 필요',refs:[{source:'D1',quote:d.sources.D1}]}]});return o;}});e.configure(config);
 const root=e.start(topic,[],0,true);await e.pending;let id=e.revise(root,true);await e.pending;
 const old=JSON.parse(db.prepare('SELECT snapshot FROM debate_runs WHERE id=?').get(id).snapshot);delete old.revisionRound;delete old.revisionRoot;db.prepare('UPDATE debate_runs SET snapshot=? WHERE id=?').run(JSON.stringify(old),id);
 const second=e.revise(id,true);await e.pending;assert.equal(e.list().find(r=>r.id===second).snapshot.revisionRound,2);
 assert.match(prompts.at(-2).revisionFeedback.audit,/남은 문제/);
 const third=e.revise(second,true);await e.pending;assert.throws(()=>e.revise(third,true),/3차례/);
 assert.equal(e.list().length,4);assert.equal(e.list().find(r=>r.id===root).status,'review_required');db.close();
});

test('specified correction changes only two items, preserves history, and audits once after explicit start',async()=>{
 const {CORRECTION_PLAN}=await import('./correction.mjs');
 const db=database();let auditCalls=0;
 const e=new DebateEngine(db,{call:async(p,c,prompt)=>{auditCalls++;assert.equal(p,'claude');assert.equal(JSON.parse(prompt.split('\n')[1]).stage,5);return {text:JSON.stringify({verdict:'pass',issues:[]}),model:'fake',responseId:'test',usage:{}};}});
 const snapshot={protocolVersion:3,topic:{...topic,id:'authority'},sourceVersion:0,documents:[],revisionParent:'older',revisionRound:3};
 db.prepare("INSERT INTO debate_runs(id,topic_id,snapshot,status,step,attempts,created_at,updated_at) VALUES('parent','authority',?,'review_required',6,2,'2026-01-01','2026-01-01')").run(JSON.stringify(snapshot));
 const summary={proposals:[{text:'제안',refs:[{source:'D1',quote:'독립 검산으로 계산을 대조한다.'}]}],disagreements:[],missing:CORRECTION_PLAN.changes.map(c=>({text:c.before,refs:[{source:'D1',quote:'독립 검산으로 계산을 대조한다.'}]})),assumptions:[],tests:['[미실행 계획] 독립 검산 대조'],decisions:['범위 결정']};
 const insert=db.prepare('INSERT INTO debate_outputs VALUES(?,?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<6;i++)insert.run('parent',i,i%2?'gpt':'claude','test',i===4?JSON.stringify(summary):i===5?JSON.stringify({verdict:'revise',issues:[]}):'독립 검산으로 계산을 대조한다.','fake',null,'{}','hash','2026-01-01');
 const original=db.prepare('SELECT text FROM debate_outputs WHERE run_id=? AND step=4').get('parent').text;
 const child=e.prepareCorrection('parent');assert.equal(auditCalls,0);let r=e.list().find(x=>x.id===child);
 assert.equal(r.status,'correction_draft');assert.equal(r.maxAttempts,1);assert.equal(approvalAllowed(db,{runId:child,topicId:'authority'}),false);
 const changed=JSON.parse(r.outputs.find(o=>o.step===4).text);assert.equal(changed.missing.length,1);assert.equal(changed.missing[0].text,CORRECTION_PLAN.changes[1].after);assert.deepEqual(changed.tests,summary.tests);assert.deepEqual(changed.proposals,summary.proposals);
 assert.equal(db.prepare('SELECT text FROM debate_outputs WHERE run_id=? AND step=4').get('parent').text,original);
 assert.throws(()=>e.prepareCorrection('parent'),/이미/);e.configure(config);assert.throws(()=>e.resume(child,false));e.resume(child,true);await e.pending;assert.equal(auditCalls,1);assert.equal(e.list().find(x=>x.id===child).status,'awaiting_approval');db.close();
});
test('specified correction refuses changed or duplicate target text',async()=>{
 const {applyCorrection,CORRECTION_PLAN}=await import('./correction.mjs');assert.throws(()=>applyCorrection(JSON.stringify({missing:[]})),/CORRECTION_MISMATCH/);
 const missing=CORRECTION_PLAN.changes.map(c=>({text:c.before}));missing.push({...missing[0]});assert.throws(()=>applyCorrection(JSON.stringify({missing})),/CORRECTION_MISMATCH/);
});

test('scope correction separates fixed wording from disputed review without claiming a pass',async()=>{
 const {SCOPE_CORRECTION}=await import('./scope-correction.mjs');const {applyCorrection,canCorrect}=await import('./correction.mjs');
 const summary={missing:SCOPE_CORRECTION.changes.map(c=>({text:c.before,refs:[{source:'D1',passage:'D1:L1',quote:'근거 원문'},{source:'S2',passage:'S2:L89',quote:'요금 표'}]})),tests:['미실행 계획'],decisions:['미정']};
 const corrected=applyCorrection(JSON.stringify(summary));const after=JSON.parse(corrected.text);
 assert.equal(after.missing.length,3);assert.equal(corrected.reviewMemo.fixed.length,2);assert.equal(corrected.reviewMemo.pending.length,1);
 assert.equal(after.missing[0].refs.some(r=>r.passage==='S2:L89'),false);assert.match(after.missing[2].text,/명시하지 않았다/);
 assert.deepEqual(after.tests,summary.tests);assert.deepEqual(after.decisions,summary.decisions);assert.equal(canCorrect(corrected.text),false);assert.match(corrected.reviewMemo.notice,/통과.*아니다/);
});

test('project migration preserves legacy records and rejects writes against foreign topics and sources',async()=>{
 const {migrateProjects,validateProjectEvent,projectOf}=await import('./projects.mjs');const db=database();
 db.prepare("INSERT INTO council_events(actor,type,payload,created_at) VALUES('test','source',?,'now')").run(JSON.stringify({sourceId:'legacy',title:'원래 자료',text:'자료'}));
 migrateProjects(db);migrateProjects(db);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM council_projects').get().n,5);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM council_events').get().n,1);
 assert.equal(projectOf({}),'workshop');
 db.prepare("INSERT INTO council_events(actor,type,payload,created_at) VALUES('test','topic',?,'now')").run(JSON.stringify({projectId:'erp',topicId:'erp-topic',title:'재고',text:'설명'}));
 assert.throws(()=>validateProjectEvent(db,{type:'message',payload:{projectId:'english',topicId:'erp-topic'}}),/다른 프로젝트/);
 assert.throws(()=>validateProjectEvent(db,{type:'source_toggle',payload:{projectId:'english',sourceId:'legacy'}}),/다른 프로젝트/);
 assert.throws(()=>validateProjectEvent(db,{type:'topic',payload:{projectId:'english',topicId:'scope'}}),/기본/);
 assert.equal(validateProjectEvent(db,{type:'message',payload:{projectId:'erp',topicId:'erp-topic'}}),'erp');db.close();
});
test('project-scoped debate receives only its own documents and directions; old runs remain workshop-only',async()=>{
 const db=database(),e=new DebateEngine(db,{call:async(p,c,prompt)=>reply(p,c,prompt)});e.configure(config);
 const vault={exists:false};const handle=createLocalAPI(db,e,vault);
 const add=(type,payload)=>db.prepare("INSERT INTO council_events(actor,type,payload,created_at) VALUES('test',?,?,'now')").run(type,JSON.stringify(payload));
 add('source',{sourceId:'legacy',title:'작업장',text:'다른 자료'});add('source',{projectId:'english',sourceId:'english-doc',title:'영어',text:'영어 자료'});add('source',{projectId:'erp',sourceId:'erp-doc',title:'재고',text:'ERP 자료'});add('direction',{projectId:'english',text:'영어 방향'});add('direction',{projectId:'erp',text:'ERP 방향'});add('topic',{projectId:'erp',topicId:'inventory',title:'재고',text:'만들기'});
 const req=body=>new Request('http://localhost/api/debate/start',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify(body)});
 const body={projectId:'erp',topic:{id:'inventory',title:'재고',text:'만들기'},version:6,acknowledged:true};const response=await handle(req(body));assert.equal(response.status,200);await e.pending;
 const run=e.list()[0];assert.equal(run.snapshot.projectId,'erp');assert.deepEqual(run.snapshot.documents.map(d=>d.sourceId),['erp-doc']);assert.deepEqual(run.snapshot.directions,['ERP 방향']);
 const english=await (await handle(new Request('http://localhost/api/debate?project=english'))).json();assert.equal(english.runs.length,0);
 assert.equal((await handle(req({...body,projectId:'english'}))).status,400);
 const erp=await (await handle(new Request('http://localhost/api/debate?project=erp'))).json();assert.equal(erp.runs.length,1);db.close();
});
test('project creation requires same-origin JSON and preserves metadata',async()=>{
 const db=database(),e=new DebateEngine(db),handle=createLocalAPI(db,e,{exists:false});
 const make=origin=>new Request('http://localhost/api/debate/projects',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({title:'새 작업',description:'새 목표'})});
 assert.equal((await handle(make('http://evil.test'))).status,403);const result=await (await handle(make('http://localhost'))).json();assert.ok(result.id);
 const list=await (await handle(new Request('http://localhost/api/debate/projects'))).json();assert.equal(list.projects.length,6);assert.equal(list.projects.find(p=>p.id===result.id).description,'새 목표');db.close();
});

test('unrelated project edits do not stale an approval, but own-project edits do',async()=>{
 const db=database(),e=new DebateEngine(db,{call:async(p,c,prompt)=>reply(p,c,prompt)});e.configure(config);const id=e.start(topic,[],0,true);await e.pending;
 const insert=p=>db.prepare("INSERT INTO council_events(actor,type,payload,created_at) VALUES('test','direction',?,'now')").run(JSON.stringify(p));
 insert({projectId:'english',text:'영어 수정'});assert.equal(approvalAllowed(db,{runId:id,topicId:topic.id}),true);
 assert.equal(approvalAllowed(db,{runId:id,topicId:topic.id,projectId:'english'}),false);
 insert({text:'작업장 수정'});assert.equal(approvalAllowed(db,{runId:id,topicId:topic.id}),false);db.close();
});

test('real job worker prepares example, checks synthetic inventory, preserves evidence and rejects duplicate execution',async()=>{
 const {JobEngine}=await import('./jobs.mjs');const {migrateProjects}=await import('./projects.mjs');const {createHash}=await import('node:crypto');
 const db=database();migrateProjects(db);const root=mkdtempSync(join(process.cwd(),'job-test-')),jobs=new JobEngine(db,{root});
 const id=jobs.create({projectId:'workshop',topicId:'scope',title:'가상 재고 실증',kind:'inventory_fixture'});
 assert.equal(jobs.list('workshop')[0].status,'ready');assert.equal(jobs.list('english').length,0);
 assert.throws(()=>jobs.start(id,'workshop',false));assert.throws(()=>jobs.start(id,'english',true));jobs.start(id,'workshop',true);assert.throws(()=>jobs.start(id,'workshop',true));await jobs.pending;
 const result=jobs.list('workshop')[0];assert.equal(result.status,'awaiting_review');assert.equal(result.result.checks.length,5);assert.ok(result.result.checks.every(c=>c.passed));assert.equal(result.snapshot.limits.apiCalls,0);
 assert.equal(createHash('sha256').update(jobs.artifact(id,'workshop')).digest('hex'),result.result.codeHash);assert.throws(()=>jobs.artifact(id,'english'));assert.throws(()=>jobs.start(id,'workshop',true));assert.throws(()=>jobs.create({projectId:'workshop',topicId:'scope',title:'重複',kind:'inventory_fixture'}));db.close();
});
test('job timeout is recorded as failure without automatic retry or approval',async()=>{
 const {JobEngine}=await import('./jobs.mjs');const {migrateProjects}=await import('./projects.mjs');const db=database();migrateProjects(db);const root=mkdtempSync(join(process.cwd(),'job-test-')),jobs=new JobEngine(db,{root,timeout:1});
 const id=jobs.create({projectId:'workshop',topicId:'scope',title:'시간 제한 시험',kind:'inventory_fixture'});jobs.start(id,'workshop',true);await jobs.pending;assert.equal(jobs.list('workshop')[0].status,'failed');assert.throws(()=>jobs.start(id,'workshop',true));assert.throws(()=>jobs.artifact(id,'workshop'));db.close();
});

test('job restart marks unfinished execution interrupted and does not resume automatically',async()=>{
 const {JobEngine}=await import('./jobs.mjs');const {migrateProjects}=await import('./projects.mjs');const db=database();migrateProjects(db);const jobs=new JobEngine(db);const id=jobs.create({projectId:'workshop',topicId:'scope',title:'재시작',kind:'inventory_fixture'});
 db.prepare("UPDATE council_jobs SET status='running' WHERE id=?").run(id);const restarted=new JobEngine(db);assert.equal(restarted.list('workshop')[0].status,'interrupted');assert.equal(restarted.active,null);assert.throws(()=>restarted.start(id,'workshop',true));db.close();
});

const validInventoryRules=()=>({receive:{require:true,stock:['add','stock','qty'],remaining:'remaining'},reserve:{require:['gte','available','qty'],stock:'stock',remaining:'qty'},ship:{require:['and',['gte','remaining','qty'],['gte','stock','qty']],stock:['sub','stock','qty'],remaining:['sub','remaining','qty']},cancel:{require:['gte','remaining','qty'],stock:'stock',remaining:['sub','remaining','qty']}});
test('AI rule creation, independent review and real compiled-code execution share the same hash',async()=>{
 const {JobEngine}=await import('./jobs.mjs');const {migrateProjects}=await import('./projects.mjs');const db=database();migrateProjects(db);const calls=[];
 const jobs=new JobEngine(db,{root:mkdtempSync(join(process.cwd(),'job-test-')),getConfig:()=>config,call:async(provider,c,prompt)=>{calls.push({provider,prompt});return {text:provider==='claude'?JSON.stringify(validInventoryRules()):JSON.stringify({verdict:'pass',issues:[],summary:'계약과 일치, 실제 시험은 별도'}),model:'fake-'+provider,responseId:'id',usage:{input_tokens:1,output_tokens:1}};}});
 const id=jobs.create({projectId:'workshop',topicId:'scope',kind:'ai_inventory',title:'AI 재고 실증'});assert.throws(()=>jobs.start(id,'workshop',false));jobs.start(id,'workshop',true);await jobs.pending;
 const r=jobs.list('workshop')[0];assert.equal(r.status,'awaiting_review');assert.equal(r.result.checks.length,5);assert.equal(r.result.calls.length,2);assert.equal(r.result.codeHash,r.result.review.codeHash);assert.deepEqual(calls.map(c=>c.provider),['claude','gpt']);assert.match(calls[1].prompt,/export function createInventory/);assert.ok(!calls[0].prompt.includes(config.claudeKey));db.close();
});
test('review rejection stops before execution and retains issues without automatic rewrite',async()=>{
 const {JobEngine}=await import('./jobs.mjs');const {migrateProjects}=await import('./projects.mjs');const db=database();migrateProjects(db);let count=0;
 const jobs=new JobEngine(db,{root:mkdtempSync(join(process.cwd(),'job-test-')),getConfig:()=>config,call:async p=>{count++;return {text:p==='claude'?JSON.stringify(validInventoryRules()):JSON.stringify({verdict:'revise',issues:['경계 조건 추가 검토'],summary:'보완 필요'}),model:'fake',usage:{}};}});
 const id=jobs.create({projectId:'workshop',topicId:'scope',kind:'ai_inventory',title:'검토 거부'});jobs.start(id,'workshop',true);await jobs.pending;const r=jobs.list('workshop')[0];assert.equal(r.status,'needs_revision');assert.equal(count,2);assert.deepEqual(r.result.checks,[]);assert.throws(()=>jobs.start(id,'workshop',true));db.close();
});
test('untrusted code expressions are rejected before review or execution',async()=>{
 const {compileRules}=await import('./rule-compiler.mjs');for(const bad of ['process.exit()', ['import','node:fs',0], ['add','constructor',1]]){const r=validInventoryRules();r.receive.stock=bad;assert.throws(()=>compileRules(r),/RULE_/);}
 const {JobEngine}=await import('./jobs.mjs');const {migrateProjects}=await import('./projects.mjs');const db=database();migrateProjects(db);let count=0;
 const jobs=new JobEngine(db,{root:mkdtempSync(join(process.cwd(),'job-test-')),getConfig:()=>config,call:async()=>{count++;const r=validInventoryRules();r.receive.stock='process.exit()';return {text:JSON.stringify(r),model:'fake',usage:{}};}});
 const id=jobs.create({projectId:'workshop',topicId:'scope',kind:'ai_inventory',title:'표현식 거부'});jobs.start(id,'workshop',true);await jobs.pending;assert.equal(count,1);assert.equal(jobs.list('workshop')[0].status,'failed');db.close();
});
test('actual test failure blocks a rule mistake even when the independent model says pass',async()=>{
 const {JobEngine}=await import('./jobs.mjs');const {migrateProjects}=await import('./projects.mjs');const db=database();migrateProjects(db);
 const jobs=new JobEngine(db,{root:mkdtempSync(join(process.cwd(),'job-test-')),getConfig:()=>config,call:async p=>{const rules=validInventoryRules();rules.ship.stock=['add','stock','qty'];return {text:p==='claude'?JSON.stringify(rules):JSON.stringify({verdict:'pass',issues:[],summary:'오판한 리뷰'}),model:'fake',usage:{}};}});
 const id=jobs.create({projectId:'workshop',topicId:'scope',kind:'ai_inventory',title:'실제 오류 주입'});jobs.start(id,'workshop',true);await jobs.pending;const r=jobs.list('workshop')[0];assert.equal(r.status,'failed');assert.ok(r.result.checks.some(c=>!c.passed));assert.throws(()=>jobs.artifact(id,'workshop'));db.close();
});
