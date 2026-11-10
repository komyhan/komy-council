const HTML = /*HTML*/;
export function validate(input) {
 if (!input || typeof input !== 'object' || !Number.isSafeInteger(input.version) || input.version<0) throw new Error('기록 버전이 올바르지 않아. 새로고침 후 다시 시도해 줘.');
 const p=input.payload;
 if(p?.projectId!==undefined&&(typeof p.projectId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(p.projectId)))throw Error('프로젝트 ID를 확인해 줘.');
 if(!p || typeof p!=='object') throw new Error('내용이 필요해.');
 const str=(key,max=12000)=>{if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max)throw new Error('입력 내용이나 길이를 확인해 줘.');};
 if(input.type==='direction')str('text');
 else if(input.type==='source'){str('sourceId',80);str('title',160);str('text',20000);}
 else if(input.type==='source_toggle'){str('sourceId',80);if(typeof p.active!=='boolean')throw Error('자료 선택을 확인해 줘.');}
 else if(input.type==='topic'){str('title',120);str('text');str('topicId',80);}
 else if(input.type==='message'){str('topicId',80);str('text'); if(!['sean','import-claude','import-gpt'].includes(p.author))throw new Error('작성자를 확인해 줘.');}
 else if(input.type==='decision'){str('topicId',80);str('text');if(!['approved','held','reopened'].includes(p.status))throw new Error('결정 상태를 확인해 줘.');}
 else throw new Error('지원하지 않는 요청이야.');
 return {type:input.type,payload:p,version:input.version};
}
export default {async fetch(req,env){
 const url=new URL(req.url);
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
 const json=(data,status=200)=>Response.json(data,{status,headers});
 if(url.pathname==='/api/events'){
  if(!req.headers.get('oai-authenticated-user-id'))return json({error:'로그인이 필요해.'},401);
  if(!env.DB)return json({error:'기록 저장소 연결을 확인해야 해.'},503);
  try{
   if(req.method==='GET') {const r=await env.DB.prepare('SELECT * FROM council_events ORDER BY id').all();const events=r.results.map(e=>({...e,payload:JSON.parse(e.payload)}));return json({version:events.at(-1)?.id||0,events:events.filter(e=>!url.searchParams.has('project')||(e.payload.projectId||'workshop')===url.searchParams.get('project'))});}
   if(req.method!=='POST')return json({error:'지원하지 않는 요청이야.'},405);
   if(req.headers.get('Origin')!==url.origin)return json({error:'요청 출처가 올바르지 않아.'},403);
   if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON 형식이 필요해.'},415);
   if(Number(req.headers.get('content-length')||0)>100000)return json({error:'내용이 너무 길어.'},413);
   const raw=await req.text(); if(raw.length>50000)return json({error:'내용이 너무 길어.'},413);
   const v=validate(JSON.parse(raw));
   const r=await env.DB.prepare('INSERT INTO council_events (actor,type,payload,created_at) SELECT ?,?,?,? WHERE (SELECT COALESCE(MAX(id),0) FROM council_events)=?').bind(req.headers.get('oai-authenticated-user-id'),v.type,JSON.stringify(v.payload),new Date().toISOString(),v.version).run();
   if(!r.meta.changes)return json({error:'다른 창에서 기록이 바뀌었어. 새로고침 후 다시 확인해 줘.'},409);
   return json({ok:true});
  }catch(e){return json({error:e.message?.includes('입력')||e.message?.includes('확인')||e.message?.includes('필요')?e.message:'저장하지 못했어. 잠시 후 다시 시도해 줘.'},400);}
 }
 if(url.pathname==='/favicon.ico')return new Response(null,{status:204});
 if(url.pathname!=='/')return new Response('Not found',{status:404});
 return new Response(HTML,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'"}});
}};
