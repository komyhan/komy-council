import {readFileSync} from 'node:fs';
export function seedDocuments(db){
 db.exec('CREATE TABLE IF NOT EXISTS council_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 if(db.prepare("SELECT value FROM council_meta WHERE key='v3_seed'").get())return;
 const files=[['PROJECT_BRIEF.md','션오빠 방향과 구현 검토 기준'],['AI_ENVIRONMENT_V1.md','해피 작업환경 설계서 v1 · 검토 대상'],['ERP_REVIEW.md','우똥이 ERP 독립 검토 · 제안']];
 db.exec('BEGIN IMMEDIATE');try{
  for(const [file,title] of files){const text=readFileSync(new URL('./'+file,import.meta.url),'utf8');db.prepare('INSERT INTO council_events(actor,type,payload,created_at) VALUES(?,?,?,?)').run('system-seed','source',JSON.stringify({sourceId:'seed-'+file,title,text}),new Date().toISOString());}
  db.prepare("INSERT INTO council_meta VALUES('v3_seed','1')").run();db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
