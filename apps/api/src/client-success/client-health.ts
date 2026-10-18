// Pure scoring: transparent signals; demo data is never mixed with production.
export type HealthInput={npsScores:number[];csatScores:number[];criticalIssues:number;highIssues:number;overdueInvoices:number;overdueAmount:number;expiresWithinDays:number|null;};
export function summarizeHealth(input:HealthInput){
 const flags:string[]=[];
 const nps=input.npsScores.length?input.npsScores[0]:null;
 const csat=input.csatScores.length?input.csatScores[0]:null;
 let score=100;
 if(nps!==null && nps<=6){score-=30;flags.push(`NPS detractor (${nps}/10)`)}
 else if(nps!==null && nps<=8){score-=10;flags.push(`Passive NPS (${nps}/10)`)}
 if(csat!==null && csat<=2){score-=25;flags.push(`Low CSAT (${csat}/5)`)}
 if(input.criticalIssues){score-=Math.min(30,15*input.criticalIssues);flags.push(`${input.criticalIssues} critical open issue(s)`)}
 if(input.highIssues){score-=Math.min(20,10*input.highIssues);flags.push(`${input.highIssues} high-severity open issue(s)`)}
 if(input.overdueInvoices){score-=Math.min(20,10*input.overdueInvoices);flags.push(`${input.overdueInvoices} overdue invoice(s) — collection follow-up`)}
 if(input.expiresWithinDays!==null && input.expiresWithinDays<=30){score-=10;flags.push(`Contract expires within ${Math.max(0,input.expiresWithinDays)} days`)}
 score=Math.max(0,score);
 const level=score>=80?'HEALTHY':score>=55?'ATTENTION':'AT_RISK';
 return {score,level,flags,method:'Advisory rule-based signals; not a prediction of churn.',signals:input};
}
export function isOverdue(inv:{status:string;dueAt:Date;total:unknown;payments:{amount:unknown}[]},now=new Date()){
 if(!['SENT','PARTIALLY_PAID'].includes(inv.status)||inv.dueAt>=now)return false;
 const paid=inv.payments.reduce((n,p)=>n+Number(p.amount),0);
 return Number(inv.total)-paid>0.005;
}
