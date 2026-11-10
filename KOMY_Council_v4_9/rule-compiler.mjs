const VARIABLES=new Set(['stock','remaining','available','qty']);
export const RULE_CONTRACT={version:1,operations:['receive','reserve','ship','cancel'],fields:['require','stock','remaining'],variables:[...VARIABLES],meaning:{stock:'처리 직전 전체 재고',available:'전체 재고에서 모든 예약 잔량 합계를 뺀 가용 재고',remaining:'출고·취소 대상 예약의 현재 잔량. 없으면 0',qty:'이번 거래의 양의 정수 수량'},operators:{add:2,sub:2,gte:2,and:2},requirements:['수량은 양의 안전한 정수','입고는 재고 증가','예약은 가용 재고 내에서만 허용','부분출고는 예약과 재고를 함께 감소','취소는 예약만 감소','중복 거래 ID는 한 번만 반영'],format:'JSON 최상위 키 receive,reserve,ship,cancel. 각 값은 require(참거짓 식), stock(처리 후 재고 식), remaining(처리 후 해당 예약 잔량 식)만 가진 객체. 예: ["add","stock","qty"]는 재고+수량. 예약 생성 시 remaining은 새 예약량이고, 입고에서는 사용하지 않으므로 remaining 변수를 유지.'};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...keys].sort().join(','))throw Error('RULE_SCHEMA');}
function expression(value,type,depth=0){
 if(depth>8)throw Error('RULE_DEPTH');
 if(type==='bool'&&typeof value==='boolean')return String(value);
 if(type==='number'&&typeof value==='number'&&Number.isSafeInteger(value)&&Math.abs(value)<=1000000)return String(value);
 if(type==='number'&&typeof value==='string'&&VARIABLES.has(value))return value;
 if(!Array.isArray(value)||value.length!==3)throw Error('RULE_EXPRESSION');
 const [op,a,b]=value;
 if(type==='number'&&['add','sub'].includes(op))return '('+expression(a,'number',depth+1)+(op==='add'?'+':'-')+expression(b,'number',depth+1)+')';
 if(type==='bool'&&op==='gte')return '('+expression(a,'number',depth+1)+'>='+expression(b,'number',depth+1)+')';
 if(type==='bool'&&op==='and')return '('+expression(a,'bool',depth+1)+'&&'+expression(b,'bool',depth+1)+')';
 throw Error('RULE_EXPRESSION');
}
export function compileRules(rules){
 exact(rules,RULE_CONTRACT.operations);let branches='';
 for(const op of RULE_CONTRACT.operations){const r=rules[op];exact(r,['require','stock','remaining']);branches+='case '+JSON.stringify(op)+': if(!('+expression(r.require,'bool')+'))throw Error("INSUFFICIENT");nextStock='+expression(r.stock,'number')+';nextRemaining='+expression(r.remaining,'number')+';break;';}
 return '// Generated from validated finite rule expressions; no arbitrary AI JavaScript.\nexport function createInventory(){let stock=0;const reservations=new Map(),seen=new Set();function state(){const reserved=[...reservations.values()].reduce((a,b)=>a+b,0);return {stock,reserved,available:stock-reserved};}function apply(event){if(!event||typeof event.id!=="string"||!event.id||!Number.isSafeInteger(event.qty)||event.qty<=0)throw Error("INVALID");if(seen.has(event.id))return state();const qty=event.qty,available=state().available,remaining=reservations.get(event.reservation)||0;let nextStock,nextRemaining;switch(event.type){'+branches+'default:throw Error("INVALID");}if(!Number.isSafeInteger(nextStock)||nextStock<0||!Number.isSafeInteger(nextRemaining)||nextRemaining<0)throw Error("INVALID_STATE");stock=nextStock;if(event.type==="reserve")reservations.set(event.id,nextRemaining);if(event.type==="ship"||event.type==="cancel")reservations.set(event.reservation,nextRemaining);seen.add(event.id);return state();}return {apply,state};}';
}
export function parseRuleReply(raw){let value;try{value=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{throw Error('RULE_JSON');}compileRules(value);return value;}
