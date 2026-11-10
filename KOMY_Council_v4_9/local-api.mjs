import {JobEngine} from './jobs.mjs';
import {WorkshopBridge} from './workshop-bridge.mjs';
import {migrateProjects,requireProject,projectOf,projectVersion} from './projects.mjs';
import {listModels,explainError} from './connections.mjs';
export function approvalAllowed(db,payload){
 const run=db.prepare('SELECT * FROM debate_runs WHERE id=?').get(payload.runId);
 return Boolean(run&&run.topic_id===payload.topicId&&projectOf(JSON.parse(run.snapshot))===projectOf(payload)&&run.status==='awaiting_approval'&&(JSON.parse(run.snapshot).projectVersion??JSON.parse(run.snapshot).sourceVersion)===projectVersion(db,projectOf(JSON.parse(run.snapshot))));
}
export function createLocalAPI(db,engine,vault){
 migrateProjects(db);const jobs=new JobEngine(db,{getConfig:()=>engine.config});const bridge=new WorkshopBridge(db,{getConfig:()=>engine.config});const timer=setInterval(()=>bridge.poll().catch(()=>{}),60000);timer.unref();let adminBusy=false;
 return async function handle(request){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/debate'))return null;
  const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(request.method==='GET'&&path==='/api/debate/bridge'){try{await bridge.ready;return json(bridge.list(url.searchParams.get('project')));}catch{return json({error:'프로젝트 연결을 확인해 줘.'},400);}}
  if(request.method==='GET'&&path==='/api/debate/jobs'){try{const projectId=requireProject(db,url.searchParams.get('project'));return json({jobs:jobs.list(projectId),active:jobs.active?.id||null});}catch{return json({error:'프로젝트를 확인해 줘.'},400);}}
  if(request.method==='GET'&&path==='/api/debate/jobs/artifact'){try{const source=jobs.artifact(url.searchParams.get('id'),url.searchParams.get('project'));return new Response(source,{headers:{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="inventory-example.mjs"','Cache-Control':'no-store'}});}catch{return json({error:'파일을 찾지 못했어.'},404);}}
  if(request.method==='GET'&&path==='/api/debate/projects')return json({projects:db.prepare('SELECT * FROM council_projects ORDER BY created_at,id').all()});
  if(request.method==='GET'&&path==='/api/debate')return json({connection:{...engine.info(),keySaved:vault.exists,storage:'Windows DPAPI / 현재 계정'},runs:engine.list().filter(r=>!url.searchParams.has('project')||projectOf(r.snapshot)===url.searchParams.get('project'))});
  if(request.method!=='POST'||request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'요청 출처와 형식을 확인해 줘.'},403);
  try{
   const raw=await request.text();if(raw.length>50000)return json({error:'요청이 너무 길어.'},413);const body=JSON.parse(raw);
   if(path==='/api/debate/bridge/settings'){bridge.policy(body);return json({ok:true});}
   if(path==='/api/debate/bridge/connect'){await bridge.connect(body);return json({ok:true});}
   if(path==='/api/debate/bridge/followup'){return json({ok:true,id:await bridge.followup(body)});}
   if(path==='/api/debate/bridge/send'){return json({ok:true,id:await bridge.dispatch(body)});}
   if(path==='/api/debate/bridge/check'){await bridge.poll();return json({ok:true});}
   if(path==='/api/debate/bridge/close'){bridge.close(body);return json({ok:true});}
   if(path==='/api/debate/jobs'){if(body.kind==='ai_inventory')throw Error('API 제작은 중단했어. 구독 제작·자동 검토 메뉴를 사용해 줘.');return json({ok:true,id:jobs.create(body)});}
   if(path==='/api/debate/jobs/start'){const old=jobs.list(requireProject(db,body.projectId)).find(j=>j.id===body.id);if(old?.snapshot.kind==='ai_inventory')throw Error('API 제작은 중단했어. 구독 제작 메뉴를 사용해 줘.');jobs.start(body.id,body.projectId,body.acknowledged===true);return json({ok:true});}
   if(path==='/api/debate/projects'){
    const title=typeof body.title==='string'?body.title.trim():null,description=typeof body.description==='string'?body.description.trim():body.description===undefined?'':null;
    if(typeof title!=='string'||!title||title.length>80||typeof description!=='string'||description.length>1000)throw Error('프로젝트 이름과 설명을 확인해 줘.');
    const id=crypto.randomUUID();db.prepare('INSERT INTO council_projects VALUES(?,?,?,?)').run(id,title,description,new Date().toISOString());return json({ok:true,id});
   }
   if(path==='/api/debate/settings'||path==='/api/debate/forget'){
    if(adminBusy)return json({error:'연결 설정을 처리 중이야.'},409);adminBusy=true;
    try{
     if(path.endsWith('/forget')){if(engine.active)throw Error('토론을 먼저 중단해 줘.');vault.forget();engine.config={};return json({ok:true});}
     engine.configure(body);
     if(body.remember===true)await vault.save(engine.config);else vault.forget();
     return json({ok:true,saved:vault.exists,connection:engine.info()});
    }finally{adminBusy=false;}
   }
   if(path==='/api/debate/models'){
    const models=await listModels(body.provider,engine.config);return json({models,notice:'목록 조회 성공. 실제 응답 생성·과금 가능 여부와 모든 모델의 토론 호환성은 별도 확인이 필요해.'});
   }
   if(path==='/api/debate/start'){
    if(adminBusy)return json({error:'설정 저장이 끝난 후 시작해 줘.'},409);
    const projectId=requireProject(db,body.projectId||'workshop');
    const events=db.prepare('SELECT * FROM council_events ORDER BY id').all().map(e=>({...e,payload:JSON.parse(e.payload)})).filter(e=>projectOf(e.payload)===projectId);
    const custom=events.find(e=>e.type==='topic'&&e.payload.topicId===body.topic?.id);
    if(!custom&&!(projectId==='workshop'&&['scope','authority','accuracy','debate','night','integration'].includes(body.topic?.id)))throw Error('선택한 프로젝트의 안건이 아니야.');
    if(custom&&(custom.payload.title!==body.topic.title||custom.payload.text!==body.topic.text))throw Error('안건 내용이 바뀌었어. 새로고침해 줘.');
    body.topic={...body.topic,projectId};
    return json({ok:true,id:engine.start(body.topic,events,body.version,body.acknowledged===true)});
   }
   if(path==='/api/debate/correction'){return json({ok:true,id:engine.prepareCorrection(body.id)});}
   if(path==='/api/debate/revise'){if(adminBusy)throw Error('설정 저장 중이야.');return json({ok:true,id:engine.revise(body.id,body.acknowledged===true)});}
   if(path==='/api/debate/cancel'){engine.cancel(body.id);return json({ok:true});}
   if(path==='/api/debate/resume'){engine.resume(body.id,body.acknowledged===true);return json({ok:true});}
   return json({error:'지원하지 않는 요청이야.'},404);
  }catch(e){
   const msg=e.message.startsWith('API_')?explainError(e.message):e.message.startsWith('UNIQUE')?'다른 토론이 진행 중이야.':e instanceof SyntaxError?'입력 형식을 확인해 줘.':e.message;
   return json({error:msg},400);
  }
 };
}
