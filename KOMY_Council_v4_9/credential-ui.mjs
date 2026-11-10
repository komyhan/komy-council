export function normalizeSecretInput(value){
 if(value===undefined)return undefined;
 if(typeof value!=='string')throw Error('키·토큰 입력 형식을 확인하십시오.');
 const clean=value.trim();
 if(clean&&/^[*•●\s]+$/.test(clean))throw Error('별표는 저장 상태 표시입니다. 새 키·토큰을 입력하거나 비워 두어 기존 값을 유지하십시오.');
 return clean;
}
export function secretField(name,label,present){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return '<div class="secret-field"><label for="secret-'+esc(name)+'">'+esc(label)+' <span class="saved-badge '+(present?'saved':'missing')+'">'+(present?'저장됨':'미등록')+'</span></label><div class="secret-row"><input id="secret-'+esc(name)+'" type="password" name="'+esc(name)+'" value="" autocomplete="new-password" placeholder="'+(present?'********':'여기에 붙여넣기')+'" '+(present?'readonly':'')+' data-secret-present="'+Boolean(present)+'"><button class="button small" type="button" data-secret-edit="'+esc(name)+'">'+(present?'변경':'입력')+'</button></div><small>'+(present?'보안상 저장된 값은 표시하지 않습니다. 변경하지 않으면 기존 값이 유지됩니다.':'해당 서비스의 키 또는 토큰을 입력하십시오.')+'</small></div>';
}
