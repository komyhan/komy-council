// Extract labelled passages, without generating or inferring an approval.
export function reviewBrief(value){
 const text=String(value||'').replace(/\r\n/g,'\n');
 const headings=[...text.matchAll(/(?:^|\n)\s*(?:#{1,4}\s*)?(?:[①②③④⑤]|[1-5][.)])?\s*(?:\*\*)?(완료한 일|남은 문제|사용자 결정 사항|오빠가 결정할 것|오빠가 볼 핵심|발견한 문제와 파일·근거|시험의 빈틈|추가로 필요한 주변 코드|사람 결정 사항|근거와 한계)(?:\*\*)?[^\n]*\n/g)];
 const parts={};
 for(let i=0;i<headings.length;i++){const h=headings[i];parts[h[1]]=text.slice(h.index+h[0].length,headings[i+1]?.index??text.length).trim();}
 return {done:parts['완료한 일']||parts['오빠가 볼 핵심']||'',issues:parts['남은 문제']||[parts['발견한 문제와 파일·근거'],parts['시험의 빈틈']].filter(Boolean).join('\n\n'),decisions:parts['사용자 결정 사항']||parts['오빠가 결정할 것']||parts['사람 결정 사항']||'',legacy:!!parts['오빠가 볼 핵심'],recognized:headings.length>0};
}
export function reviewBriefHTML(report){
 const brief=reviewBrief(report);const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const block=(title,text)=>'<section class="brief-part"><h4>'+title+'</h4><div class="brief-text">'+escape(text||'별도 정리된 항목이 없습니다. 검토 원문을 확인하십시오.')+'</div></section>';
 return '<div class="review-brief"><p class="muted">GPT 검토 원문을 항목별로 발췌한 내용입니다. 작업 및 시험 완료를 독립적으로 인증한 결과는 아닙니다.</p>'+block('완료한 일 · 검토 보고',brief.done)+block('남은 문제 · 검토 의견',brief.issues)+block('사용자 결정 사항 · 검토 의견',brief.decisions)+(brief.legacy?'<p class="muted">이전 형식의 보고서입니다. 기존 결정과 중복되거나 작업 범위 외의 제안이 포함될 수 있습니다.</p>':'')+'</div>';
}
