/** Pure validation helpers; do not require API keys or provider credentials. */
export const money = (n:unknown,positive=true) => {
 const v=typeof n==='number'?n:typeof n==='string' && n.trim()?Number(n):NaN;
 if(!Number.isFinite(v)||(positive?v<=0:v<0)||v>1e10||Math.abs(v*100-Math.round(v*100))>1e-6)throw Error('Amount must be a valid monetary value with two decimals.');
 return Math.round(v*100)/100;
};
export const email = (v:unknown) => {
 const s=typeof v==='string'?v.trim().toLowerCase():'';
 if(s.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw Error('Valid recipient email required.');
 return s;
};
export function calculateBalance(total:number,paid:number,approvedAdjustments:number){
 return Math.max(0,Math.round((total-paid-approvedAdjustments)*100)/100);
}
export function nextBillingDate(date:Date,cadence:string){
 const next=new Date(date);
 if(cadence==='MONTHLY')next.setUTCMonth(next.getUTCMonth()+1);
 else if(cadence==='QUARTERLY')next.setUTCMonth(next.getUTCMonth()+3);
 else return null;
 return next;
}
export function validateAmendmentLines(lines:unknown){
 if(!Array.isArray(lines)||lines.length>100)throw Error('Provide at most 100 pricing lines.');
 return lines.map((l:any)=>{
  if(!l || typeof l.serviceName!=='string'||!l.serviceName.trim()||!['FIXED','HOURLY','UNIT','MONTHLY_RETAINER','FTE','MILESTONE','OUTCOME'].includes(l.model)||!/^[A-Z]{3}$/.test(l.currency||''))throw Error('Invalid amendment price line.');
  const rate=money(l.rate,false);
  return {serviceName:l.serviceName.trim().slice(0,160),model:l.model,rate,currency:l.currency,unit:String(l.unit||'').slice(0,80)};
 });
}
