import {test} from 'node:test';
import assert from 'node:assert/strict';
import {secretField,normalizeSecretInput} from './credential-ui.mjs';
import {DatabaseSync} from 'node:sqlite';
import {DebateEngine} from './debate.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('stored-secret indicator uses placeholder, not a fake password value',()=>{
 const html=secretField('token','해피 작업 전용 토큰',true);
 assert.match(html,/placeholder="\*{8}"/);assert.match(html,/value=""/);assert.match(html,/readonly/);assert.match(html,/저장됨/);assert.match(html,/변경/);
 assert.doesNotMatch(secretField('token','작업 토큰',false),/readonly|placeholder="\*{8}"/);
});
test('mask placeholders cannot replace actual credentials; blank preserves caller contract',()=>{
 for(const value of ['********','••••••••','●●●●',' * * * '])assert.throws(()=>normalizeSecretInput(value),/별표/);
 assert.equal(normalizeSecretInput(''), '');assert.equal(normalizeSecretInput(undefined),undefined);assert.equal(normalizeSecretInput(' sk-real-value '),'sk-real-value');
});
test('backend keeps real API key when unchanged and refuses mask-value overwrite',()=>{
 const db=new DatabaseSync(':memory:');const engine=new DebateEngine(db);engine.configure({openaiKey:'sk-real-value',claudeKey:'sk-ant-real'});engine.configure({openaiKey:'',claudeKey:''});assert.equal(engine.config.openaiKey,'sk-real-value');assert.throws(()=>engine.configure({openaiKey:'********'}),/별표/);assert.equal(engine.config.openaiKey,'sk-real-value');db.close();
});
test('credential labels cannot inject markup',()=>{
 const html=secretField('token','<script>bad</script>',true);assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
});
test('unified screen has four distinct masked secrets; work screen hides setup and retains draft across tabs',()=>{
 const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',classList:{toggle(){}},insertAdjacentHTML(){},querySelector:()=>node('button'),elements:{instruction:{value:'',focus(){}},topicId:{value:'test',options:[{value:'test'}]},acknowledged:{checked:false}}});return nodes.get(key);};
 const ctx=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[]},render(){},current:'bridge',activeProject:'erp',events:[{id:3}],topics:()=>[{id:'test',title:'시험'}],projectList:[{id:'erp',title:'ERP'}],debateState:{connection:{}},modelsCache:{claude:[],gpt:[]},modelSelect:(p,v)=>'<select name="'+(p==='claude'?'claudeModel':'openaiModel')+'"><option></option></select>',esc:s=>String(s??''),simpleText:s=>String(s),toast(){},console});
 vm.runInContext(readFileSync('credential-ui.mjs','utf8').replaceAll('export function','function')+'\n'+readFileSync('bridge-ui.js','utf8'),ctx);
 vm.runInContext(`bridgeState={connection:{repo:'owner/repo',url:'https://example.test',tokenPresent:true,githubTokenPresent:true},api:{openaiKeyPresent:true,claudeKeyPresent:true},policy:{enabled:false,daily:1,monthly:10,calls:10,model:'gpt-5.4-mini'},spend:{day:0,month:0},requests:[]};bridgeProject='erp';bridgeTab='settings';bridgeView();`,ctx);
 const setup=node('#view').innerHTML;assert.equal((setup.match(/placeholder="\*{8}"/g)||[]).length,4);assert.match(setup,/连接|연결 정보 한 번에 저장/);assert.match(setup,/OpenAI API 키/);assert.match(setup,/토론 전용/);
 vm.runInContext(`bridgeDrafts.set('erp',{instruction:'이 지시 유지',topicId:'test'});bridgeTab='work';bridgeView();`,ctx);
 assert.equal(node('#bridgeSend').elements.instruction.value,'이 지시 유지');assert.doesNotMatch(node('#view').innerHTML,/id="unifiedConnection"/);assert.match(node('#view').innerHTML,/작업 전송/);
});
