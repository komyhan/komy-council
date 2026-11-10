import {SCOPE_CORRECTION} from './scope-correction.mjs';
import {createHash} from 'node:crypto';
export const CORRECTION_PLAN={"id":"authority-summary-two-edits-v1","changes":[{"op":"remove","field":"missing","before":"독립 검산기 대조 시험은 꼭 넣어야 한다. 이번 안건의 시험 목록에도 들어가야 하지만, 이전 요약에서 누락을 지적했다가 현재는 이미 들어가 있다. 따라서 누락 지적은 삭제하고, 검산기 적용 범위가 미정이라는 쪽으로만 남겨야 한다.","reason":"이미 추가된 시험을 누락으로 적은 중복 항목 삭제"},{"op":"replace","field":"missing","before":"계약된 예외 거래 범위, 특히 동시 출고·마감 후 정정·동기화 지연을 어디까지 넣을지는 아직 확정되지 않았다.","after":"예외 거래 시험의 최소 범위, 특히 동시 출고·마감 후 정정·동기화 지연을 어디까지 포함할지는 아직 확정되지 않았다.","reason":"원문에 없는 계약 표현 제거"}]};
function applyPlan(raw,plan){
 const value=JSON.parse(raw),copy=structuredClone(value),changes=[];
 for(const operation of plan.changes){
  const list=copy[operation.field];if(!Array.isArray(list))throw Error('CORRECTION_MISMATCH');
  const matches=list.map((x,i)=>x.text===operation.before?i:-1).filter(i=>i>=0);
  if(matches.length!==1)throw Error('CORRECTION_MISMATCH');
  const index=matches[0];
  if(operation.op==='remove')list.splice(index,1);else {list[index].text=operation.after;if(operation.omitPassages)list[index].refs=list[index].refs.filter(r=>!operation.omitPassages.includes(r.passage));}
  changes.push({...operation,index});
 }
 return {text:JSON.stringify(copy),planId:plan.id,reviewMemo:plan.reviewMemo||null,baseHash:createHash('sha256').update(raw).digest('hex'),changes};
}
export function applyCorrection(raw){
 for(const plan of [CORRECTION_PLAN,SCOPE_CORRECTION]){try{return applyPlan(raw,plan);}catch{}}
 throw Error('CORRECTION_MISMATCH');
}
export function canCorrect(raw){try{applyCorrection(raw);return true;}catch{return false;}}

