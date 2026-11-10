import test from 'node:test';
import assert from 'node:assert/strict';
import {morningBrief} from './morning-brief.mjs';
const run=(status,verdict)=>({topic_id:'authority',status,outputs:[{step:4,text:JSON.stringify({decisions:['시간 한도'],tests:['중단 시험'],proposals:[]})},{step:5,text:JSON.stringify({verdict,issues:verdict==='revise'?[{claim:'누락',reason:'시험 필요'}]:[]})}]});
test('revision is visibly blocked and keeps unresolved issues',()=>{const b=morningBrief(run('review_required','revise'));assert.equal(b.ready,false);assert.equal(b.issues.length,1);assert.equal(b.cards.length,3);assert.match(b.notice,/기본 제안/);});
test('approval readiness needs completed state and passing audit',()=>{assert.equal(morningBrief(run('awaiting_approval','pass')).ready,true);assert.equal(morningBrief(run('running','pass')).ready,false);assert.equal(morningBrief(run('awaiting_approval','revise')).ready,false);});
test('unrelated topic does not receive authority recommendations',()=>{const r=run('awaiting_approval','pass');r.topic_id='other';assert.deepEqual(morningBrief(r).cards,[]);});
