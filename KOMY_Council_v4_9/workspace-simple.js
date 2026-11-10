// A single daily workspace; existing planning pages remain available as records.
let simpleRecords=false;
const confirmationDrafts=new Map();
const detailedRender=render;
function goWorkspace(){simpleRecords=false;current='bridge';bridgeTab='work';refreshBridge().then(()=>render());render();}
function reviewState(r){
 const review=r.reviews?.[0];
 if(r.status==='closed')return '종료됨 · 기존 결과 보관 중';
 if(requestDecision(r))return '결정 저장됨 · 다음 작업 준비';
 if(review?.status==='completed')return '검토 완료 · 사용자 검토 대기';
 if(review?.status==='running')return 'GPT 검토 중';
 if(review)return '검토 미완료 · 확인 필요';
 if(r.result?.pr)return 'PR 도착 · 검토 대기';
 return {sent:'Claude 작업 중 · PR 대기',dispatching:'작업 전달 중',dispatch_unknown:'전달 확인 필요'}[r.status]||r.status;
}
function requestDecision(r){const decision=topics().find(t=>t.id===r.topic_id)?.decision;const tag='[대상 요청: '+r.id+' / 검토 커밋: '+(r.reviews?.[0]?.commit_sha||'미확인')+']';return decision?.payload?.text?.includes(tag)?decision:null;}
function decisionExcerpt(report){return reviewBrief(report).decisions;}
function confirmationPanel(s){
 const rows=s.requests.filter(r=>r.reviews?.[0]?.status==='completed'&&r.status!=='closed'&&!requestDecision(r));
 return '<section class="card section confirm-zone"><div class="eyebrow">검토 대기</div><h2>검토 대기 '+rows.length+'건</h2>'+(rows.length?rows.map(r=>{
 const report=r.reviews[0],decision=topics().find(t=>t.id===r.topic_id)?.decision;
 return '<article class="confirm-item"><h3>'+esc(r.snapshot.topic.title)+'</h3><p><b>코드 변경 요청(PR) 및 GPT 검토가 등록되었습니다.</b> 검토 원문은 작업 결과에서 확인할 수 있습니다.</p><p class="muted">GPT 검토는 시험 실행 또는 승인 증명이 아닙니다. 코드 변경 시 재검토가 필요합니다.</p>'+reviewBriefHTML(report.report)+(decision?'<p class="decision">최근 안건 결정: '+esc(decision.payload.text)+'</p>':'')+'<form data-confirm-request="'+esc(r.id)+'" data-confirm-topic="'+esc(r.topic_id)+'"><label class="setup-field">결정 내용<textarea name="text" required maxlength="12000" placeholder="결정 내용과 적용 범위를 입력하십시오."></textarea></label><div class="row"><select name="status"><option value="held">보완 요청 / 보류</option><option value="approved">적은 범위만 승인</option></select><button class="button primary">결정 저장</button></div><p class="muted">결정 기록만 저장합니다. 추가 작업 전송, PR 병합 및 배포는 실행하지 않습니다.</p></form></article>';
 }).join(''):'<p>검토 대기 항목이 없습니다. 작업을 요청하거나 진행 상태를 확인할 수 있습니다.</p>')+'</section>';
}
render=function(){
 detailedRender();
 document.querySelectorAll('nav [data-view]').forEach(b=>{b.hidden=!['bridge','connection'].includes(b.dataset.view);});
 const nav=document.querySelector('nav');
 if(!document.querySelector('#simpleRecords')){nav.insertAdjacentHTML('beforeend','<button id="simpleRecords">기록 및 자료</button>');document.querySelector('#simpleRecords').onclick=()=>{simpleRecords=true;current='decisions';render();};}
 const home=document.querySelector('[data-view="bridge"]');home.textContent='작업 현황';home.onclick=goWorkspace;
 const settings=document.querySelector('[data-view="connection"]');settings.textContent='설정';settings.onclick=async()=>{simpleRecords=false;current='bridge';bridgeTab='settings';await Promise.all([refreshBridge(),refreshDebates()]);render();};
 document.querySelector('.hero').hidden=true;document.querySelector('.stats').hidden=true;
 document.querySelector('#notice').hidden=true;
 if(simpleRecords&&current!=='bridge'){
  document.querySelector('#view').insertAdjacentHTML('afterbegin','<section class="card section record-menu"><h2>기록 및 자료</h2><p>프로젝트별 토론, 방향, 결정 및 기획 자료를 조회합니다.</p><div class="row"><button class="button" data-record-view="forum">토론 기록</button><button class="button" data-record-view="direction">프로젝트 방향</button><button class="button" data-record-view="decisions">결정 기록</button><button class="button" data-record-view="sources">기획 자료</button><button class="button primary" id="backWorkspace">작업 현황으로</button></div></section>');
  document.querySelector('#backWorkspace').onclick=goWorkspace;
  document.querySelectorAll('[data-record-view]').forEach(b=>b.onclick=()=>{current=b.dataset.recordView;render();});
 }
 if(current!=='bridge'||bridgeTab!=='work'||bridgeProject!==activeProject||!bridgeState)return;
 const page=document.querySelector('.work-page');if(!page)return;
 document.querySelector('#breadcrumb').textContent='작업 현황';
 const top=page.querySelector('.work-top');top.innerHTML='<div><div class="eyebrow">KOMY WORKSPACE · v4.9</div><h2>프로젝트 작업 관리</h2><p>프로젝트 선택 → 작업 요청 → 결과 검토 → 승인·보류</p></div>';
 const badges=page.querySelector('.connection-overview');if(badges){const desc=badges.nextElementSibling;const fold=document.createElement('details');fold.className='connection-fold';fold.innerHTML='<summary>연결 상태·설정 확인</summary>';badges.before(fold);fold.append(badges);if(desc)fold.append(desc);fold.insertAdjacentHTML('beforeend','<button class="button" id="openSimpleSettings">설정 열기</button>');document.querySelector('#openSimpleSettings').onclick=settings.onclick;}
 const compose=page.querySelector('.work-compose');compose.insertAdjacentHTML('beforebegin',confirmationPanel(bridgeState));
 compose.querySelector('h3').textContent='작업 요청';
 compose.querySelector('textarea').placeholder='작업 목표, 완료 조건, 허용 범위 및 시간 한도를 입력하십시오.';
 compose.querySelector('#trialInstruction').textContent='연결 시험 예제';
 compose.insertAdjacentHTML('afterbegin','<details class="task-options"><summary>안건 등록 및 프로젝트 자료</summary><p>새 작업은 안건으로 등록한 후 선택할 수 있습니다.</p><button class="button" id="simpleNewTopic">안건 등록</button> <button class="button" id="simpleContext">프로젝트 방향 및 자료</button></details>');
 document.querySelector('#simpleNewTopic').onclick=()=>document.querySelector('#newTopic').showModal();
 document.querySelector('#simpleContext').onclick=()=>{simpleRecords=true;current='direction';render();};
 const latest=page.querySelector('.latest-work');if(latest&&bridgeState.requests[0])latest.querySelector('p b').textContent=reviewState(bridgeState.requests[0]).replace('종료됨 · 기존 결과 보관 중','종료됨 · 기존 결과 보관 중');
 page.querySelectorAll('.work-history').forEach((el,i)=>{const r=bridgeState.requests[i+1];if(r)el.querySelector('summary').textContent=new Date(r.created_at).toLocaleString('ko-KR')+' · '+r.snapshot.topic.title+' · '+reviewState(r).replace('종료됨 · 기존 결과 보관 중','종료됨 · 기존 결과 보관 중');});
 page.querySelectorAll('.review-summary .work-report').forEach(el=>{const fold=document.createElement('details');fold.innerHTML='<summary>GPT 검토 원문 전체 보기</summary>';el.before(fold);fold.append(el);});
 page.querySelectorAll('.work-instruction').forEach(el=>{const fold=document.createElement('details');fold.className='work-instruction-fold';fold.innerHTML='<summary>작업 지시 상세</summary>';el.before(fold);fold.append(el);});
 page.querySelectorAll('[data-confirm-request]').forEach(form=>{const key=activeProject+':'+form.dataset.confirmRequest,draft=confirmationDrafts.get(key);if(draft){form.elements.text.value=draft.text;form.elements.status.value=draft.status;}form.oninput=()=>confirmationDrafts.set(key,{text:form.elements.text.value,status:form.elements.status.value});form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),request=bridgeState.requests.find(r=>r.id===form.dataset.confirmRequest);if(!request)return;const text=f.get('text').trim()+'\n[대상 요청: '+request.id+' / 검토 커밋: '+(request.reviews[0]?.commit_sha||'미확인')+']';const ok=await save('decision',{topicId:form.dataset.confirmTopic,text,status:f.get('status')});if(ok){confirmationDrafts.delete(key);bridgeFeedback='결정을 저장했습니다. 추가 작업이 필요한 경우 작업 요청을 전송하십시오.';render();}};});
};
const beforeFollowupRender=render;
const followupDrafts=new Map();
render=function(){beforeFollowupRender();if(current!=='bridge'||bridgeTab!=='work'||bridgeProject!==activeProject||!bridgeState)return;
 document.querySelectorAll('.latest-work,.work-history').forEach((card,index)=>{const r=bridgeState.requests[index],review=r?.reviews?.[0];if(!r||review?.status!=='completed'||r.result.followupId)return;
  const anchor=card.querySelector('.review-summary');if(!anchor)return;
  anchor.insertAdjacentHTML('afterend','<details class="followup-box"><summary>보완 작업 요청</summary><p>기존 지시, 검토 결과 및 최신 결정 기록을 포함하여 보완 작업 1회를 요청합니다. 기존 작업 범위와 한도를 유지합니다.</p><form data-followup="'+esc(r.id)+'"><label class="setup-field">이번에 보완할 내용<textarea name="note" required maxlength="2000" placeholder="필수 지적을 보완하고 시험하십시오. 기존 조건을 유지하고 추가 결정이 필요한 경우 작업을 중단하여 보고하십시오."></textarea></label><label><input name="ack" type="checkbox"> 이전 Claude 실행 종료를 확인했습니다. 보완 작업에는 Claude 사용량 및 후속 GPT 검토 비용이 발생할 수 있습니다.</label><p class="muted">전송 시 이전 요청의 모니터링을 종료하고 새 요청을 생성합니다. PR 닫기, 병합 및 배포는 실행하지 않습니다. 전송이 불확실한 경우 자동 재전송하지 않습니다.</p><button class="button primary">보완 요청 전송</button></form></details>');
  const form=card.querySelector('[data-followup]'),key=activeProject+':'+r.id,draft=followupDrafts.get(key);if(draft)form.elements.note.value=draft;
  form.oninput=()=>followupDrafts.set(key,form.elements.note.value);
  form.onsubmit=async e=>{e.preventDefault();if(!form.elements.ack.checked)return toast('이전 실행 종료와 사용량을 확인하십시오.');form.querySelector('button').disabled=true;try{await bridgePost('followup',{id:r.id,reviewId:review.id,note:form.elements.note.value,acknowledged:true,executionChecked:true,version:events.at(-1)?.id||0});followupDrafts.delete(key);bridgeFeedback='보완 작업을 전송했습니다. 새 요청에서 실행 상태와 후속 검토를 확인하십시오.';}catch(error){bridgeFeedback=error.message;}if(current==='bridge')render();};
 });
};
const simpleTopicSubmit=document.querySelector('#topicForm').onsubmit;
document.querySelector('#topicForm').onsubmit=async e=>{await simpleTopicSubmit(e);if(!document.querySelector('#newTopic').open&&selected){const draft=bridgeDrafts.get(activeProject)||{instruction:''};bridgeDrafts.set(activeProject,{...draft,topicId:selected});render();}};
current='bridge';bridgeTab='work';render();
