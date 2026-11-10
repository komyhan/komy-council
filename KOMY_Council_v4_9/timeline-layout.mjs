export function orderTimeline(items){return [...items].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)||b.key.localeCompare(a.key));}
function arrangeDiscussion(runs,topic){
 const body=document.querySelector('.detailbody'),panel=document.querySelector('#debatePanel');if(!body||!panel)return;
 const formMessage=document.querySelector('#messageForm'),formDecision=document.querySelector('#decisionForm');
 const background=document.createElement('details');background.className='background-fold';background.innerHTML='<summary>안건 배경과 최초 제안 보기</summary><div class="proposal">'+esc(topic.text)+'</div>';
 const items=[];
 panel.querySelectorAll(':scope > .run-card').forEach((node,index)=>{const run=runs[index];if(!run)return;items.push({key:'run-'+run.id,date:run.created_at,label:'AI 토론 · '+(stateNames[run.status]||run.status),node});
  const memo=node.querySelector('.decision-card'),brief=node.querySelector('.brief-card');
  if(memo&&brief){const extra=document.createElement('details');extra.className='background-fold';extra.innerHTML='<summary>기본 검토 안내 보기</summary>';brief.replaceWith(extra);extra.append(brief);}
  const changeInfo=[...node.children].find(child=>child.classList.contains('notice')&&child.textContent.includes('지정 수정 내역'));
  if(changeInfo){const fold=document.createElement('details');fold.className='background-fold';fold.innerHTML='<summary>지정 수정 내역과 변경 전후 보기</summary>';changeInfo.replaceWith(fold);fold.append(changeInfo);}
  const anchor=node.querySelector('.run-date');if(anchor){if(memo)anchor.after(memo);else if(brief)anchor.after(brief);}
 });
 for(const event of events.filter(e=>['message','decision'].includes(e.type)&&e.payload.topicId===topic.id)){
  const node=document.createElement('article');node.className='timeline-post '+(event.type==='decision'?'post-decision':'post-sean');
  node.innerHTML='<div class="entrytop"><strong>'+esc(event.type==='decision'?'사용자 결정 · '+({approved:'승인',held:'보류',reopened:'재논의'}[event.payload.status]||event.payload.status):names[event.payload.author]||'등록 의견')+'</strong><time>'+esc(new Date(event.created_at).toLocaleString('ko-KR'))+'</time></div><p class="post-text">'+esc(event.payload.text)+'</p>';
  items.push({key:'event-'+event.id,date:event.created_at,label:event.type==='decision'?'사용자 결정':'등록 의견',node});
 }
 const sorted=orderTimeline(items),view=document.createElement('div');view.className='discussion-stream';
 if(sorted.length){const newest=document.createElement('section');newest.className='latest-discussion';newest.innerHTML='<div class="latest-label">● 최신 글</div>';newest.append(sorted[0].node);view.append(newest);}
 else{const empty=document.createElement('p');empty.className='empty';empty.textContent='아직 토론 기록이 없습니다. 의견을 남기거나 새 토론을 시작해 줘.';view.append(empty);}
 const compose=document.createElement('section');compose.className='compose-card';compose.innerHTML='<h3>사용자 의견과 결정 남기기</h3><p class="muted">지금 보고 있는 안건에 저장돼. 의견 저장은 AI 호출을 시작하지 않습니다.</p><div class="compose-tabs"><button type="button" class="button primary" data-compose="opinion">의견·방향 남기기</button><button type="button" class="button" data-compose="decision">결정 기록하기</button></div>';
 if(formMessage){formMessage.classList.add('stream-compose');compose.append(formMessage);}
 if(formDecision){formDecision.classList.add('stream-compose');formDecision.hidden=true;compose.append(formDecision);}
 compose.querySelectorAll('[data-compose]').forEach(button=>button.onclick=()=>{const decision=button.dataset.compose==='decision';if(formMessage)formMessage.hidden=decision;if(formDecision)formDecision.hidden=!decision;compose.querySelectorAll('button[data-compose]').forEach(b=>b.classList.toggle('primary',b===button));});
 const taskBox=document.createElement('details');taskBox.className='background-fold';taskBox.innerHTML='<summary>이 안건을 작업장 실증에 연결</summary><p>고정 예제를 실행하거나, AI에게 제한된 재고 규칙을 작성시켜 코드로 바꾸고 리뷰·시험할 수 있습니다. 이 안건의 모든 요구를 자동 구현하는 기능은 아직 아닙니다.</p><button type="button" class="button" id="createFixtureTask">가상 재고 실증 작업 등록 · API 호출 없음</button><p><button type="button" class="button primary" id="createAITask">AI 재고 규칙 제작 작업 등록</button></p>';taskBox.querySelector('#createFixtureTask').onclick=()=>createFixtureTask(topic);taskBox.querySelector('#createAITask').textContent='구독 제작·자동 검토로 이동';taskBox.querySelector('#createAITask').onclick=async()=>{current='bridge';bridgeTab='work';await refreshBridge();render();};compose.append(taskBox);
 view.append(compose);
 const history=document.createElement('section');history.className='history-list';history.innerHTML='<h3>이전 기록 <span class="muted">'+Math.max(sorted.length-1,0)+'</span></h3>';
 for(const item of sorted.slice(1)){const fold=document.createElement('details');fold.className='history-fold';const summary=document.createElement('summary');summary.textContent=new Date(item.date).toLocaleString('ko-KR')+' · '+item.label;fold.append(summary,item.node);history.append(fold);}
 if(sorted.length>1)view.append(history);
 const controls=document.createElement('details');controls.className='new-debate-controls';controls.innerHTML='<summary>새 AI 토론 시작 · 연결·자료 설정</summary>';while(panel.firstChild)controls.append(panel.firstChild);
 // All existing forms were moved above; remove obsolete duplicated message and decision display.
 body.replaceChildren(view,controls,background);
}
