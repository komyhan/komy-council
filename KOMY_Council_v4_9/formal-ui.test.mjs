import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const source=readFileSync('bridge-ui.js','utf8');
const c=vm.createContext({esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),simpleText:s=>String(s),usd:n=>'$'+Number(n||0).toFixed(4)});
vm.runInContext(source.slice(source.indexOf('function bridgeResults(')),c);
const row={id:'test',status:'closed',created_at:'2026-11-11T00:00:00Z',topic_id:'scope',snapshot:{topic:{title:'첫 개발 범위와 성공 기준'},instruction:'기존 지시 보관'},result:{session:'https://claude.ai/code/test',pr:'https://github.com/owner/repo/pull/1',error:'STALE_ERROR_SHOULD_NOT_DISPLAY'},reviews:[]};
test('closed result suppresses stale action warning without changing archived record',()=>{
 const html=c.bridgeResults([row]);assert.doesNotMatch(html,/STALE_ERROR_SHOULD_NOT_DISPLAY/);assert.match(html,/종료된 작업입니다/);assert.equal(row.result.error,'STALE_ERROR_SHOULD_NOT_DISPLAY');
 const active=c.bridgeResults([{...row,status:'sent'}]);assert.match(active,/STALE_ERROR_SHOULD_NOT_DISPLAY/);
});
test('execution links share a dedicated wrapping action row',()=>{
 const html=c.bridgeResults([row]);assert.match(html,/<div class="work-links"><a/);assert.match(html,/Claude 실행 내역/);assert.match(html,/코드 변경 내역\(PR\)/);
 const css=readFileSync('discussion.css','utf8');assert.match(css,/\.work-links\{display:flex;flex-wrap:wrap/);assert.match(css,/\.work-instruction-fold\{display:block/);
});
test('primary interface uses formal labels',()=>{
 const ui=readFileSync('workspace-simple.js','utf8');assert.doesNotMatch(ui,/오빠|해피|내가 결정할 내용/);assert.match(ui,/결정 저장/);assert.match(ui,/작업 현황/);
});
// Local fixture for visual inspection; contains no saved user records.
const base=readFileSync('app.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
if(process.env.KOMY_LAYOUT_PREVIEW==='1'){mkdirSync('../work',{recursive:true});writeFileSync('../work/layout-v49.html','<!doctype html><meta charset="utf-8"><style>'+base+readFileSync('discussion.css','utf8')+'</style><div class="work-page" style="padding:24px"><section class="card section">'+c.bridgeResults([row])+'</section></div><script>document.querySelectorAll(".work-instruction").forEach(el=>{const fold=document.createElement("details");fold.className="work-instruction-fold";fold.innerHTML="<summary>작업 지시 상세</summary>";el.before(fold);fold.append(el);});</script>');}
