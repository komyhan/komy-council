import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewBrief,reviewBriefHTML} from './review-brief.mjs';
test('new report separates decisions from evidence and preserves uncertainty',()=>{
 const b=reviewBrief('## 완료한 일\n- 제작자 보고: 44개 통과\n## 남은 문제\n- CI 미확인\n## 오빠가 결정할 것\n- 추가 결정 없음\n## 근거와 한계\nfile.js:5');
 assert.equal(b.done,'- 제작자 보고: 44개 통과');assert.equal(b.issues,'- CI 미확인');assert.equal(b.decisions,'- 추가 결정 없음');assert.equal(b.legacy,false);
});
test('legacy report is excerpted, without hiding issues or falsely resolving prior decisions',()=>{
 const b=reviewBrief('① 오빠가 볼 핵심  \n- 구현 반영\n② 발견한 문제와 파일·근거\n- -0 재승인 요청\n③ 시험의 빈틈\n- 미실행\n④ 추가로 필요한 주변 코드\n- api.js\n⑤ 사람 결정 사항\n- -0 결정 필요');
 assert.equal(b.legacy,true);assert.match(b.issues,/-0 재승인/);assert.match(b.issues,/미실행/);assert.equal(b.decisions,'- -0 결정 필요');
});
test('unknown reports never imply no problems and imported HTML is escaped',()=>{
 assert.match(reviewBriefHTML('unstructured'),/원문을 확인/);assert.doesNotMatch(reviewBriefHTML('unstructured'),/추가 결정 없음/);
 assert.doesNotMatch(reviewBriefHTML('## 완료한 일\n<script>bad</script>\n## 남은 문제\n미확인\n'),/<script>/);
});
