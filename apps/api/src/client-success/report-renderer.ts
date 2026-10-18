import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
export type ReportSnapshot={client:string;type:'MBR'|'QBR';title:string;periodStart:string;periodEnd:string;generatedAt:string;isDemo:boolean;health:{score:number;level:string;flags:string[]};contracts:{title:string;status:string;expiresAt:string|null}[];financials:{currency:string;invoiced:number;collected:number;overdue:number}[];issues:{title:string;severity:string;status:string}[];reviews:{title:string;type:string;score:number|null;summary:string}[];actions:string[]};
export function reportText(s:ReportSnapshot){
 return [s.title,`Client: ${s.client}`,`Period: ${s.periodStart} through ${s.periodEnd}`,
  `Generated UTC: ${s.generatedAt}`,s.isDemo?'FICTIONAL DEMO — NOT REAL CLIENT DATA':'INTERNAL REPORT — verify all values before sharing',
  '',`CLIENT HEALTH: ${s.health.level} (${s.health.score}/100)`,
  ...(s.health.flags.length?s.health.flags.map(x=>`- ${x}`):['- No recorded risk flags; this is not a guarantee of satisfaction']),
  '', 'COMMERCIAL POSITION',...(s.financials.length?s.financials.map(f=>`${f.currency}: invoiced ${f.invoiced.toFixed(2)} | collected ${f.collected.toFixed(2)} | overdue ${f.overdue.toFixed(2)}`):['No financial records for this period']),
  '', 'AGREEMENTS',...(s.contracts.length?s.contracts.map(c=>`${c.title}: ${c.status}${c.expiresAt?` | expiry ${c.expiresAt}`:''}`):['No contracts found']),
  '', 'CLIENT ISSUES',...(s.issues.length?s.issues.map(x=>`${x.severity} / ${x.status}: ${x.title}`):['No recorded issues']),
  '', 'FEEDBACK & REVIEWS',...(s.reviews.length?s.reviews.flatMap(x=>[`${x.type}: ${x.title}${x.score!==null?` (${x.score})`:''}`,x.summary]):['No reviews recorded in period']),
  '', 'SUGGESTED INTERNAL ACTIONS',...s.actions.map(x=>`- ${x}`),
  '', 'Prepared from recorded SalesOS data; no AI inference or external calls.'
 ];
}
export async function renderReportPdf(s:ReportSnapshot){
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const size=12,leading=16;let page=doc.addPage([595,842]),y=802;
 const write=(value:string,index:number)=>{
  const normalized=value.normalize('NFKD').replace(/[^\x20-\x7E]/g,'-');
  const isHeader=index===0||['CLIENT HEALTH','COMMERCIAL POSITION','AGREEMENTS','CLIENT ISSUES','FEEDBACK & REVIEWS','SUGGESTED INTERNAL ACTIONS'].some(x=>normalized.startsWith(x));
  const segments=normalized.match(/.{1,87}(?:\s|$)|.{1,87}/g)||[''];
  for(const line of segments){if(y<55){page=doc.addPage([595,842]);y=802;}
    page.drawText(line.trim(),{x:42,y,size:index===0?17:size,font:isHeader?bold:font,color:rgb(.16,.2,.28)});y-=leading;}
 };
 reportText(s).forEach(write);
 return Buffer.from(await doc.save());
}
