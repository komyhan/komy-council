import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync('workspace-simple.js','utf8');
function context(){
 const pure=code.slice(code.indexOf('function reviewState'),code.indexOf('render=function'));
 const c=vm.createContext({topics:()=>[],esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),simpleText:s=>String(s).replaceAll('<','&lt;')});
 vm.runInContext(readFileSync('review-brief.mjs','utf8').replaceAll('export function','function')+'\n'+pure,c);return c;
}
test('review arrival supersedes PR waiting, without reopening closed work',()=>{
 const c=context();assert.equal(c.reviewState({status:'sent',reviews:[{status:'completed'}]}),'검토 완료 · 사용자 검토 대기');assert.equal(c.reviewState({status:'closed',reviews:[{status:'completed'}]}),'종료됨 · 기존 결과 보관 중');assert.equal(c.reviewState({status:'sent',reviews:[],result:{pr:'https://github.com/a/b/pull/1'}}),'PR 도착 · 검토 대기');
});
test('confirmation shows actual decision excerpt, escapes imported text and excludes closed work',()=>{
 const c=context();const r={id:'a',status:'sent',topic_id:'t',snapshot:{topic:{title:'<script>bad</script>'}},reviews:[{status:'completed',report:'① 핵심\n완료\n⑤ 사람 결정 사항\n- -0 허용 여부'}]};
 const html=c.confirmationPanel({requests:[r,{...r,id:'b',status:'closed'}]});assert.equal((html.match(/data-confirm-request=/g)||[]).length,1);assert.match(html,/항목별로 발췌/);assert.match(html,/-0 허용 여부/);assert.doesNotMatch(html,/<script>/);assert.match(html,/추가 작업 전송, PR 병합 및 배포는 실행하지 않습니다/);
 assert.equal(c.decisionExcerpt('plain unstructured review'),'');
});
test('built browser script parses, including simplified navigation',async()=>{
 await import('./build.mjs');const {default:worker}=await import('./dist/server/index.js?simpletest');
 const response=await worker.fetch(new Request('https://example.test/'),{},{});const html=await response.text();
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.ok(scripts.length);for(const script of scripts)new vm.Script(script[1]);assert.match(html,/검토 대기/);
});
