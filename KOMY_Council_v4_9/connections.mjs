export async function apiFailure(response){
 let code='';try{const d=await response.json();const v=d.error?.code||d.error?.type||'';if(/^[a-zA-Z0-9_]{1,80}$/.test(v))code=v;}catch{}
 return Error('API_HTTP_'+response.status+(code?'_'+code:''));
}
export function explainError(message){
 if(/API_HTTP_401/.test(message))return 'API 인증 실패. 키 전체를 다시 입력하거나 만료·폐기 여부를 확인해 줘.';
 if(/insufficient_quota|credit_balance|spend_limit|usage_limit/.test(message))return 'API 크레딧 또는 사용 한도 부족. 해당 회사의 잔액과 한도를 확인해 줘.';
 if(/API_HTTP_429/.test(message))return 'API 요청 제한(429). 크레딧·사용 한도 또는 일시 제한일 수 있어. 반복 재개하지 말고 계정 사용 현황을 확인해 줘.';
 if(/API_HTTP_403/.test(message))return 'API 접근 권한이 없어. 키 권한과 모델 사용 권한을 확인해 줘.';
 if(/API_HTTP_404/.test(message))return '모델을 찾을 수 없거나 접근할 수 없어. 모델 목록에서 다시 선택해 줘.';
 if(message.startsWith('API_HTTP_'))return message;
 if(message==='API_INCOMPLETE')return '응답이 출력 한도 등으로 완료되지 않았어. 모델·출력 한도를 확인해 줘.';
 if(message==='API_TOO_LONG')return '응답이 앱의 보관 길이 한도를 넘었어. 짧게 정리하는 안건으로 다시 검토해 줘.';
 if(message.startsWith('PROTOCOL_'))return '원문 인용 또는 결과 형식 검사를 통과하지 못했어. 승인되지 않았으며 재개에는 추가 API 호출이 필요해. ('+message+')';
 return '연결 실패 또는 시간 초과. 미완료 호출도 과금됐을 수 있어.';
}
export async function listModels(provider,config,fetcher=fetch){
 if(!['claude','gpt'].includes(provider))throw Error('공급자를 확인해 줘.');
 const claude=provider==='claude',key=claude?config.claudeKey:config.openaiKey;if(!key)throw Error('API 키를 먼저 등록해 줘.');
 const list=[];let after='';const signal=AbortSignal.timeout(20000);
 for(let page=0;page<5;page++){
  const response=await fetcher(claude?'https://api.anthropic.com/v1/models?limit=100'+(after?'&after_id='+encodeURIComponent(after):''):'https://api.openai.com/v1/models',{headers:claude?{'x-api-key':key,'anthropic-version':'2023-06-01'}:{Authorization:'Bearer '+key},signal});
  if(!response.ok)throw await apiFailure(response);
  const d=await response.json();for(const m of d.data||[]){if(typeof m.id!=='string')continue;if(!claude&&(!/^(gpt-|o[134])/.test(m.id)||/audio|realtime|image|search|transcribe|tts/.test(m.id)))continue;list.push({id:m.id,name:m.display_name||m.id});}
  if(!claude||!d.has_more)break;after=d.last_id;if(!after)break;
 }
 return [...new Map(list.map(m=>[m.id,m])).values()].sort((a,b)=>a.id.localeCompare(b.id));
}
