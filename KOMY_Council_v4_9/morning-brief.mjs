export function morningBrief(run){
 const parse=step=>{try{return JSON.parse(run.outputs.find(o=>o.step===step)?.text||'null');}catch{return null;}};
 const summary=parse(4),audit=parse(5);
 const ready=run.status==='awaiting_approval'&&audit?.verdict==='pass';
 const authority=run.topic_id==='authority';
 return {ready,title:ready?'사용자가 결정할 차례야':'아직 승인할 단계가 아닙니다',
 status:run.status==='correction_draft'?'지적받은 두 항목을 수정한 초안이야. 변경 전후를 확인하고 Claude 재점검을 실행할 수 있습니다. 아직 점검 통과나 승인이 아닙니다.':ready?'AI의 정리 점검까지 완료되었습니다. 실제 개발·계산 시험 완료를 뜻하지는 않아.':run.status==='review_required'?'토론은 끝났지만 결론에 수정할 내용이 남아 있습니다. 아래 보완을 먼저 처리해야 해.':'진행 중이거나 중단된 기록입니다. 최종 결론으로 승인하지 마.',
 cards:authority?[
 {question:'AI가 어디까지 알아서 일하게 할까?',recommendation:'정해 둔 작업 안에서 코드 작성·수정·가상 데이터 시험을 맡기는 안을 권장합니다.',impact:'코드 복사와 반복 확인이 줄어들어. 업무 목표나 계산 방식까지 AI가 바꾸게 하는 승인은 아닙니다.'},
 {question:'무엇은 사용자 허락을 꼭 받게 할까?',recommendation:'회사에 실제 적용하기, 계산 기준 바꾸기, 지출 한도 늘리기, 권한 늘리기는 사용자가 결정하는 방안을 권장합니다.',impact:'아침에는 이런 변경 요청만 확인해. 실제 금액·수량 계산 기준과 정답 예시는 별도로 확정해야 합니다.'},
 {question:'처음에는 어떤 자료로 시험할까?',recommendation:'가짜 거래 자료로 작은 재고 시나리오부터 시작하는 방안을 권장합니다.',impact:'실제 회사 자료나 가린 거래 자료를 넘기는 허용은 포함하지 않습니다. 필요해지면 따로 결정해.'}
 ]:[], decisions:summary?.decisions||[], proposals:(summary?.proposals||[]).map(p=>p.text),
 issues:(audit?.issues||[]).map(i=>({problem:i.claim,reason:i.reason})),
 tests:summary?.tests||[],notice:'추천은 화면에서 제공하는 기본 제안이야. AI 합의나 사용자의 승인으로 기록되지 않아. 이 화면 자체는 코딩·배포·권한 변경을 실행하지 않습니다.'};
}
