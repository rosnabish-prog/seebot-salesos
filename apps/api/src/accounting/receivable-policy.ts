/** Accounting policy: customer credit notes reduce a legal receivable; internal write-offs do not. */
export interface Adjustment {kind:string;status:string;amount:unknown}
export interface MoneyInput {total:unknown;payments:{amount:unknown}[];adjustments:Adjustment[]}
export const toMinor=(value:unknown):number=>{
 const raw=String(value??'').trim();
 if(!/^-?\d+(\.\d{1,2})?$/.test(raw))throw Error('Invalid monetary precision');
 const neg=raw.startsWith('-');const [whole,fraction='']=raw.replace('-','').split('.');
 const out=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(out))throw Error('Monetary amount out of range');return neg?-out:out;
};
export function receivableMinor(i:MoneyInput){
 const billed=toMinor(i.total),payments=i.payments.reduce((n,p)=>n+toMinor(p.amount),0),credits=i.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+toMinor(a.amount),0);
 return {billed,paid:payments,credited:credits,due:Math.max(0,billed-payments-credits)};
}
export function canApproveCustomerCredit(i:MoneyInput,amount:unknown){return toMinor(amount)>0&&toMinor(amount)<=receivableMinor(i).due;}
export function validateJournalLines(lines:{side:'DEBIT'|'CREDIT';amountMinor:number;currency:string}[]){
 if(lines.length<2||lines.some(l=>!Number.isSafeInteger(l.amountMinor)||l.amountMinor<=0||!/^[A-Z]{3}$/.test(l.currency)))return false;
 const totals=new Map<string,number>();for(const l of lines)totals.set(l.currency,(totals.get(l.currency)||0)+(l.side==='DEBIT'?l.amountMinor:-l.amountMinor));
 return [...totals.values()].every(x=>x===0);
}

/** Rates are accepted to six decimals; totals and posted monetary amounts remain cents. */
export function toRateMicros(value:unknown):number{
 const raw=String(value??'').trim();if(!/^\d+(\.\d{1,6})?$/.test(raw))throw Error('Invalid rate precision');
 const [whole,frac='']=raw.split('.');const n=Number(whole)*1000000+Number(frac.padEnd(6,'0'));
 if(!Number.isSafeInteger(n))throw Error('Rate out of range');return n;
}
export function validateInvoiceTotals(lines:{quantity:unknown;unitPrice:unknown}[],subtotal:unknown,tax:unknown,total:unknown){
 if(!lines.length||lines.length>300)return false;
 const expected=lines.reduce((sum,row)=>{
  const qty=Number(row.quantity);if(!Number.isFinite(qty)||qty<=0||qty>1000000||!/^\d+(\.\d{1,3})?$/.test(String(row.quantity)))throw Error('Invalid quantity precision');
  const rate=toRateMicros(row.unitPrice);
  return sum+Math.round(qty*rate/10000);
 },0);
 return expected===toMinor(subtotal)&&toMinor(subtotal)+toMinor(tax)===toMinor(total)&&toMinor(total)>=0;
}
