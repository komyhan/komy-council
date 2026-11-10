// Deliberately do not return provider messages, tokens, headers, URLs or prompt data.
export function dispatchDiagnostic({status=null,type=null,message='',networkCode='',stage='request'}={}){
 const known=new Set(['authentication_error','permission_error','invalid_request_error','not_found_error','rate_limit_error','api_error','overloaded_error']);
 const errorType=known.has(type)?type:null;
 let hint='통신 또는 응답 확인에 실패했어. Claude 실행 기록을 확인해 줘.';
 if(status===401)hint='작업 전용 토큰 인증이 거절됐어. 이 Fire URL과 같은 예약 작업에서 생성한 토큰인지 확인해 줘.';
 else if(status===403)hint='Claude가 접근을 거절했어. 해당 계정의 작업 권한·작업 활성 상태를 확인해 줘.';
 else if(status===404)hint='실행 주소에 해당하는 작업을 찾지 못했어. 현재 작업의 실행 URL인지 확인해 줘.';
 else if(status===429)hint='Claude 사용량 또는 호출 한도에 걸렸어. 계정 사용량을 확인해 줘.';
 else if(status===400||status===413||status===422){hint='Claude가 전달한 요청을 거절했어. 주소·토큰 문제로 단정할 수 없어.';if(/too.{0,12}(long|large)|length|maximum|max.{0,15}(characters|bytes|size)|exceed/i.test(message))hint+=' 전달 자료가 허용 크기를 넘었을 가능성이 있어.';if(/anthropic-beta|beta header|unsupported.{0,15}version/i.test(message))hint+=' API 버전 헤더 호환성을 확인해야 해.';}
 else if(status>=500)hint='Claude 서버가 오류를 반환했어. 자동 재시도하지 않았어.';
 else if(stage==='response')hint='Claude가 성공 상태를 반환했지만 실행 주소를 해석하지 못했어. 이미 실행됐을 수 있어.';
 else if(['ENOTFOUND','EAI_AGAIN'].includes(networkCode))hint='Claude 서버 주소를 찾지 못했어. 네트워크·DNS 설정을 확인해 줘.';
 else if(['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','TIMEOUT'].includes(networkCode))hint='Claude 연결 또는 응답 시간이 초과됐어. 이미 수신했을 수도 있어.';
 const prefix=status?'HTTP '+status+(errorType?' · '+errorType:''):'통신 실패';
 return {status,errorType,stage,error:prefix+' · '+hint+' 중복 실행 방지를 위해 시작 버튼을 반복해서 누르지 마.'};
}
