// Pure orchestration: testable without a browser or credentials.
export async function applyConnection(values,action,{post,onStatus,onModels}){
 onStatus('settings','키·모델 설정을 적용하고 있어…');
 const saved=await post('/api/debate/settings',values);
 onStatus('settings',saved.saved?'설정 적용 완료 · Windows 암호화 보관 중':'설정 적용 완료 · 이번 실행 메모리에 보관 중');
 if(action!=='models')return saved;
 for(const provider of ['claude','gpt']){
  const label=provider==='claude'?'Claude':'OpenAI';
  onStatus(provider,label+' 모델 목록 조회 중… 최대 20초');
  try{
   const d=await post('/api/debate/models',{provider});
   if(!Array.isArray(d.models))throw Error('서버 응답 형식이 올바르지 않아.');
   onModels(provider,d.models);
   onStatus(provider,d.models.length?label+' 모델 '+d.models.length+'개 불러옴. 아래 선택 상자를 확인하십시오.':label+' 목록이 비어 있어. 모델 ID 직접 입력으로 진행할 수 있습니다.');
  }catch(e){onStatus(provider,label+' 조회 실패: '+e.message+' 모델 ID 직접 입력으로 진행할 수 있습니다.',true);}
 }
 return saved;
}
