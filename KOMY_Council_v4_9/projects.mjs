export const DEFAULT_PROJECT='workshop';
export const PROJECTS=[['workshop','AI 작업장','매니저·토론·자동 제작 환경'],['komy-system','KOMY 시스템','배차·검품·수입 관리'],['erp','ERP','재고·출고·계산 검증'],['english','영어 선생님','학습 과정·음성 대화'],['jarvis','AI 비서 자비스','일정·기억·검색']];
export const projectOf=value=>value?.projectId||DEFAULT_PROJECT;
export function migrateProjects(db){db.exec('CREATE TABLE IF NOT EXISTS council_projects(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL)');const insert=db.prepare('INSERT OR IGNORE INTO council_projects VALUES(?,?,?,?)');for(const [id,title,description] of PROJECTS)insert.run(id,title,description,new Date().toISOString());}
export function requireProject(db,id){if(typeof id!=='string'||!db.prepare('SELECT id FROM council_projects WHERE id=?').get(id))throw Error('프로젝트를 먼저 선택해 줘.');return id;}
export function validateProjectEvent(db,body){
 const p=body.payload||{},projectId=requireProject(db,projectOf(p));
 const events=db.prepare('SELECT type,payload FROM council_events').all().map(e=>({type:e.type,payload:JSON.parse(e.payload)}));
 if(body.type==='source'&&events.some(e=>e.type==='source'&&e.payload.sourceId===p.sourceId))throw Error('이미 사용 중인 자료 ID야.');
 if(body.type==='topic'&&['scope','authority','accuracy','debate','night','integration'].includes(p.topicId))throw Error('기본 안건 ID는 사용할 수 없어.');
 if(body.type==='topic'&&events.some(e=>e.type==='topic'&&e.payload.topicId===p.topicId))throw Error('이미 사용 중인 안건 ID야.');
 if(['message','decision'].includes(body.type)){
  const topic=events.find(e=>e.type==='topic'&&e.payload.topicId===p.topicId);
  const builtin=['scope','authority','accuracy','debate','night','integration'].includes(p.topicId);
  if(!(topic?projectOf(topic.payload)===projectId:builtin&&projectId===DEFAULT_PROJECT))throw Error('다른 프로젝트의 안건이거나 존재하지 않는 안건이야.');
 }
 if(body.type==='source_toggle'&&!events.some(e=>e.type==='source'&&e.payload.sourceId===p.sourceId&&projectOf(e.payload)===projectId))throw Error('다른 프로젝트의 자료는 변경할 수 없어.');
 return projectId;
}

export function projectVersion(db,id){return Number(db.prepare("SELECT COALESCE(MAX(id),0) AS v FROM council_events WHERE COALESCE(json_extract(payload,'$.projectId'),'workshop')=?").get(id).v);}
