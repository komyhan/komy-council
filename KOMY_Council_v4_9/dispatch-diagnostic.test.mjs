import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatchDiagnostic} from './dispatch-diagnostic.mjs';
test('provider errors retain actionable status without echoing tokens or source data',()=>{
 for(const status of [400,401,403,404,413,429,500]){const r=dispatchDiagnostic({status,type:'authentication_error',message:'secret-token private-code https://private.example/'});assert.match(r.error,new RegExp('HTTP '+status));assert.doesNotMatch(JSON.stringify(r),/secret-token|private-code|private\.example/);}
});
test('unrecognized provider error type is not persisted',()=>{
 const r=dispatchDiagnostic({status:400,type:'secret_from_provider',message:'maximum text length exceeded'});assert.equal(r.errorType,null);assert.match(r.error,/크기/);assert.doesNotMatch(JSON.stringify(r),/secret_from_provider/);
});
test('successful but unparseable response stays ambiguous; DNS failure is distinguished',()=>{
 assert.match(dispatchDiagnostic({status:200,stage:'response'}).error,/이미 실행/);
 assert.match(dispatchDiagnostic({networkCode:'ENOTFOUND'}).error,/DNS/);
});
