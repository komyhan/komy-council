import test from 'node:test';
import assert from 'node:assert/strict';
import {checkOutput,groundedPrompt} from './protocol.mjs';
const snapshot={topic:{text:'안건'},documents:[]};
const results=[{step:0,text:'제목\n원문 (계산)은 승인 후 변경한다.'},{step:1,text:'독립 의견'}];
const review=refs=>JSON.stringify({observations:[{kind:'agree',claim:'검토 제안',refs}],proposal:'검토한다',openQuestions:[]});
test('passage selection retrieves original text including short headings without model copying',()=>{
 const out=checkOutput(snapshot,results,2,review([{passage:'D1:L1'},{passage:'D1:L2',quote:'model typo'}]));
 assert.deepEqual(out.observations[0].refs[0],{passage:'D1:L1',source:'D1',quote:'제목'});
 assert.equal(out.observations[0].refs[1].quote,results[0].text.split('\n')[1]);
 const data=JSON.parse(groundedPrompt(snapshot,results,2).split('\n')[1]);
 assert.equal(data.passages['D1:L2'].quote,out.observations[0].refs[1].quote);
});
test('unknown passage and conflicting attribution are rejected',()=>{
 for(const ref of [{passage:'D1:L999'},{passage:'D1:L2',source:'D2'},{passage:'SUM:L1'}])assert.throws(()=>checkOutput(snapshot,results,2,review([ref])),/PROTOCOL_CITATION/);
});
test('legacy completed review format remains readable and checked',()=>{
 assert.equal(checkOutput(snapshot,results,2,review([{source:'D1',quote:'원문 (계산)은 승인 후 변경한다.'}])).observations.length,1);
});
