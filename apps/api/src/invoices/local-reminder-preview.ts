/** Deterministic reminder scheduling, independent of provider credentials. */
export type InvoiceSnapshot={id:string;status:string;dueAt:Date;total:number;paid:number;isDemo:boolean;};
export type ReminderMilestone={day:number;scheduledFor:Date;key:string};
export function candidateReminders(invoice:InvoiceSnapshot,now:Date,days=[1,5]):ReminderMilestone[]{
 if(!['SENT','PARTIALLY_PAID'].includes(invoice.status)||invoice.total-invoice.paid<=0.005)return [];
 return days.filter(day=>Number.isInteger(day)&&day>0&&now.getTime()>=invoice.dueAt.getTime()+day*86400000)
  .map(day=>({day,scheduledFor:new Date(invoice.dueAt.getTime()+day*86400000),key:`invoice:${invoice.id}:overdue:${day}`}));
}
