import {validateProjectEvent} from './projects.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import worker from './dist/server/index.js';
import {DebateEngine} from './debate.mjs';
import {KeyVault} from './vault.mjs';
import {createLocalAPI,approvalAllowed} from './local-api.mjs';
import {seedDocuments} from './seed.mjs';
mkdirSync('.local',{recursive:true});
const existed=existsSync('.local/council.db'),db=new DatabaseSync('.local/council.db');
const vault=new KeyVault();let engine,api,ready=false;
const DB={prepare(sql){const s=db.prepare(sql);return {all:async()=>({results:s.all()}),bind(...args){return {run:async()=>({meta:{changes:Number(s.run(...args).changes)}})};}};}};
const port=3217;
const server=http.createServer(async(req,res)=>{
 const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 if(req.headers.host!==`127.0.0.1:${port}`){json({error:'Use the local address'},403);return;}
 if(!ready){json({error:'서버를 준비 중이야. 잠시 후 새로고침해 줘.'},503);return;}
 try{
  const chunks=[];let length=0;for await(const c of req){length+=c.length;if(length>100000){json({error:'요청이 너무 길어.'},413);return;}chunks.push(c);}
  const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-sean');
  const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  let out=await api(request.clone());
  if(!out&&new URL(request.url).pathname==='/api/events'&&req.method==='POST'){
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   try{validateProjectEvent(db,body);}catch(e){json({error:e.message},400);return;}
   if(body.type==='decision'&&body.payload?.runId){
    if(!approvalAllowed(db,body.payload)){json({error:'자료가 바뀌었거나 승인 가능한 결과가 아니야. 최신 자료로 다시 토론해 줘.'},409);return;}
   }
  }
  out=out||await worker.fetch(request,{DB});res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));
 }catch{json({error:'처리하지 못했어. 실행 창 상태와 입력 내용을 확인해 줘.'},500);}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'KOMY is already running. Open http://127.0.0.1:3217 or close its existing server window.':'Could not start the local server.');db.close();process.exitCode=1;});
server.listen(port,'127.0.0.1',async()=>{
 try{
  if(existed){mkdirSync('.local/backups',{recursive:true});db.exec("VACUUM INTO '.local/backups/council-"+Date.now()+".db'");}
  db.exec('CREATE TABLE IF NOT EXISTS council_events (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)');
  seedDocuments(db);engine=new DebateEngine(db);api=createLocalAPI(db,engine,vault);
  try{const config=await vault.load();if(config)engine.configure(config);}catch{console.warn('Saved keys could not be restored. Re-enter them in AI settings.');}
  ready=true;console.log(`KOMY council v3.2: http://127.0.0.1:${port}`);console.log('Keep this window open. Ctrl+C stops the server.');
  if(process.argv.includes('--open')&&process.platform==='win32')spawn('cmd.exe',['/c','start','',`http://127.0.0.1:${port}`],{windowsHide:true,stdio:'ignore'}).unref();
 }catch{console.error('Startup or backup failed. Existing records have not been intentionally removed.');server.close();db.close();process.exitCode=1;}
});
