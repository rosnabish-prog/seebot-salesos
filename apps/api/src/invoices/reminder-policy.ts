/** Reminder policy only creates proposals. Actual sending is a separate, audited action. */
export interface InvoiceBalanceSnapshot {
  id:string;number:string;currency:string;total:number;paid:number;dueAt:Date;status:string;
  isDemo:boolean;billingEmail:string;
}
export function reminderEligibility(invoice:InvoiceBalanceSnapshot,today:Date,daysAfterDue=5){
  if(!Number.isInteger(daysAfterDue)||daysAfterDue<1||daysAfterDue>90)throw Error('Invalid overdue interval');
  const balance=Number((invoice.total-invoice.paid).toFixed(2));
  if(invoice.isDemo||!['SENT','PARTIALLY_PAID'].includes(invoice.status)||balance<=0)return {eligible:false,reason:'Not a collectible outstanding invoice',balance};
  const deadline=new Date(invoice.dueAt);deadline.setUTCDate(deadline.getUTCDate()+daysAfterDue);
  if(deadline>today)return {eligible:false,reason:'Reminder date has not arrived',balance,nextDate:deadline};
  return {eligible:true,reason:'Overdue reminder requires approval',balance,nextDate:deadline};
}
export function reminderText(input:{number:string;currency:string;balance:number;dueAt:Date;clientName:string}){
  return `Hello,\n\nOur records show invoice ${input.number} for ${input.currency} ${input.balance.toFixed(2)} was due on ${input.dueAt.toISOString().slice(0,10)}.\n\nPlease let us know if payment has been made or if there is a question about this invoice.\n\nThank you,\nAccounts Receivable`;
}
