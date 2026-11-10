// Synthetic inventory example only; not KOMY production rules.
export function createInventory(){
 let stock=0;const reservations=new Map(),seen=new Set();
 function apply(event){
  if(!event||typeof event.id!=='string'||!event.id||!Number.isSafeInteger(event.qty)||event.qty<=0)throw Error('INVALID');
  if(seen.has(event.id))return state();
  const reserved=[...reservations.values()].reduce((a,b)=>a+b,0);
  if(event.type==='receive')stock+=event.qty;
  else if(event.type==='reserve'){if(stock-reserved<event.qty)throw Error('INSUFFICIENT');reservations.set(event.id,event.qty);}
  else if(event.type==='ship'){const remaining=reservations.get(event.reservation)||0;if(remaining<event.qty||stock<event.qty)throw Error('INSUFFICIENT');stock-=event.qty;reservations.set(event.reservation,remaining-event.qty);}
  else if(event.type==='cancel'){const remaining=reservations.get(event.reservation)||0;if(remaining<event.qty)throw Error('INSUFFICIENT');reservations.set(event.reservation,remaining-event.qty);}
  else throw Error('INVALID');
  seen.add(event.id);return state();
 }
 function state(){const reserved=[...reservations.values()].reduce((a,b)=>a+b,0);return {stock,reserved,available:stock-reserved};}
 return {apply,state};
}
