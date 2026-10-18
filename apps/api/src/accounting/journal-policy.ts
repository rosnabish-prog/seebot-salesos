/** Pure accounting invariants; all amounts are integer minor currency units. */
export type JournalSide = 'DEBIT' | 'CREDIT';
export type JournalLineInput = { accountCode: string; side: JournalSide; amountMinor: number };
export const ACCOUNTS = Object.freeze({AR:'1100',BANK:'1000',REVENUE:'4000',TAX:'2100',CREDIT:'4090',WRITE_OFF:'6200'});
export function amountMinor(value: unknown): number {
  const s=String(value ?? '').trim();
  if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(s)) throw Error('Amount must have at most two decimal places');
  const [whole, cents='']=s.split('.');
  const result=Number(whole)*100+Number(cents.padEnd(2,'0'));
  if (!Number.isSafeInteger(result) || result<=0) throw Error('Amount must be positive and within the supported range');
  return result;
}
export function balanced(lines: JournalLineInput[]): boolean {
  if (!Array.isArray(lines) || lines.length<2 || lines.length>30) return false;
  let dr=0,cr=0;
  for(const l of lines){
    if(!Object.values(ACCOUNTS).includes(l.accountCode as any)||!Number.isSafeInteger(l.amountMinor)||l.amountMinor<=0||!['DEBIT','CREDIT'].includes(l.side))return false;
    if(l.side==='DEBIT')dr+=l.amountMinor;else cr+=l.amountMinor;
  }
  return Number.isSafeInteger(dr)&&dr>0&&dr===cr;
}
export function invoiceJournal(subtotal:unknown,tax:unknown):JournalLineInput[]{
  const subtotalMinor=amountMinor(subtotal);
  const taxMinor=String(tax)==='0'||String(tax)==='0.00'?0:amountMinor(tax);
  const lines:JournalLineInput[]=[{accountCode:ACCOUNTS.AR,side:'DEBIT',amountMinor:subtotalMinor+taxMinor},{accountCode:ACCOUNTS.REVENUE,side:'CREDIT',amountMinor:subtotalMinor}];
  if(taxMinor)lines.push({accountCode:ACCOUNTS.TAX,side:'CREDIT',amountMinor:taxMinor});
  if(!balanced(lines))throw Error('Unbalanced invoice');return lines;
}
export function receiptJournal(amount:unknown):JournalLineInput[]{
  const cents=amountMinor(amount);return [{accountCode:ACCOUNTS.BANK,side:'DEBIT',amountMinor:cents},{accountCode:ACCOUNTS.AR,side:'CREDIT',amountMinor:cents}];
}
export function creditJournal(amount:unknown,kind:'CREDIT_NOTE'|'WRITE_OFF'):JournalLineInput[]{
  const cents=amountMinor(amount);return [{accountCode:kind==='WRITE_OFF'?ACCOUNTS.WRITE_OFF:ACCOUNTS.CREDIT,side:'DEBIT',amountMinor:cents},{accountCode:ACCOUNTS.AR,side:'CREDIT',amountMinor:cents}];
}
/** A journal is never silently edited. Corrections are posted as a reversal and replacement. */
export function reverseJournal(lines:JournalLineInput[]):JournalLineInput[]{return lines.map(l=>({...l,side:l.side==='DEBIT'?'CREDIT':'DEBIT'}));}
