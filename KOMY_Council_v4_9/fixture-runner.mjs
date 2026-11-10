import {parentPort,workerData} from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
try{
 const {directory}=workerData;mkdirSync(directory,{recursive:true});
 const source=workerData.generated?readFileSync(join(directory,'inventory-example.mjs'),'utf8'):readFileSync(new URL('./inventory-example.mjs',import.meta.url),'utf8');
 const artifact=join(directory,'inventory-example.mjs');writeFileSync(artifact,source);
 const {createInventory}=await import(pathToFileURL(artifact).href);
 const checks=[];
 function check(name,fn){try{fn();checks.push({name,passed:true});}catch{checks.push({name,passed:false});}}
 check('입고 100 → 예약 30 → 부분출고 10 → 잔여 예약 취소 20',()=>{
  const x=createInventory();x.apply({id:'in',type:'receive',qty:100});x.apply({id:'res',type:'reserve',qty:30});x.apply({id:'ship',type:'ship',qty:10,reservation:'res'});x.apply({id:'cancel',type:'cancel',qty:20,reservation:'res'});assert.deepEqual(x.state(),{stock:90,reserved:0,available:90});
 });
 check('같은 거래를 두 번 보내도 중복 반영 없음',()=>{const x=createInventory(),event={id:'a',type:'receive',qty:100};x.apply(event);x.apply(event);assert.equal(x.state().stock,100);});
 check('재고보다 많은 예약 거부 · 실패 후 상태 보존',()=>{const x=createInventory();x.apply({id:'a',type:'receive',qty:5});assert.throws(()=>x.apply({id:'r',type:'reserve',qty:6}));assert.deepEqual(x.state(),{stock:5,reserved:0,available:5});});
 check('잘못된 수량과 예약 없는 출고 거부',()=>{const x=createInventory();assert.throws(()=>x.apply({id:'a',type:'receive',qty:-1}));assert.throws(()=>x.apply({id:'s',type:'ship',qty:1,reservation:'none'}));assert.equal(x.state().stock,0);});
 check('고정 시드 가상 거래 1,000건 · 별도 합계 대조',()=>{
  let seed=20261109,received=0,shipped=0,held=0;const x=createInventory(),lots=[];
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let i=0;i<1000;i++){
   const qty=(next()>>>16)%9+1,type=(next()>>>16)%4;let event;
   if(type===0||!lots.length){event={id:'e'+i,type:'receive',qty};received+=qty;}
   else if(type===1&&received-shipped-held>=qty){event={id:'e'+i,type:'reserve',qty};held+=qty;lots.push({id:event.id,qty});}
   else {const lot=lots.find(l=>l.qty>0);if(!lot){event={id:'e'+i,type:'receive',qty};received+=qty;}else{const amount=Math.min(qty,lot.qty),ship=type===2;event={id:'e'+i,type:ship?'ship':'cancel',qty:amount,reservation:lot.id};lot.qty-=amount;held-=amount;if(ship)shipped+=amount;}}
   x.apply(event);assert.deepEqual(x.state(),{stock:received-shipped,reserved:held,available:received-shipped-held});
  }
 });
 const result={checks,passed:checks.every(c=>c.passed),codeHash:createHash('sha256').update(source).digest('hex'),artifact:'inventory-example.mjs',seed:20261109,scope:(workerData.generated?'AI가 작성한 제한 규칙에서 생성한 코드의 가상 자료 시험.':'고정 예제 코드 복사와 가상 자료 시험.')+'  임의 코드 생성·동시성·DB 장애·금액 계산·실제 회사 검증은 수행하지 않음.'};
 writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2));parentPort.postMessage(result);
}catch{parentPort.postMessage({passed:false,checks:[],error:'예제 실행 실패'});}
