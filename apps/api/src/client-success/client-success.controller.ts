import {BadRequestException, Body,Controller,Get,Param,Post,Req,Res,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,ensureOwner,ensureCanEdit} from '../common/auth.guard';
import {summarizeHealth,isOverdue} from './client-health';
import {renderReportPdf,ReportSnapshot} from './report-renderer';

const day=86400000;
const iso=(d:Date)=>d.toISOString().slice(0,10);
const limitedDate=(v:string,name:string)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new BadRequestException(`${name}: use YYYY-MM-DD`);const d=new Date(v+'T00:00:00.000Z');if(!Number.isFinite(d.valueOf())||iso(d)!==v)throw new BadRequestException(`${name} is invalid`);return d;};
@UseGuards(AuthGuard) @Controller('client-success')
export class ClientSuccessController {
 constructor(private db:PrismaService){}
 private async client(req:AuthRequest,id:string,edit=false){
   const account=await this.db.account.findUnique({where:{id}});
   if(!account || account.organizationId!==req.user.organizationId || account.status!=='Customer')throw new BadRequestException('Client not found.');
   if(edit)ensureCanEdit(req.user,account.ownerId);else ensureOwner(req.user,account.ownerId);
   return account;
 }
 private async source(accountId:string,now=new Date()){
  const [invoices,issues,reviews,surveys,contracts]=await Promise.all([
   this.db.invoice.findMany({where:{accountId},include:{payments:true,adjustments:true}}),
   this.db.clientIssue.findMany({where:{accountId}}),
   this.db.clientReview.findMany({where:{accountId},orderBy:{occurredAt:'desc'}}),
   this.db.clientSurveyInvitation.findMany({where:{accountId,status:'ANSWERED'},orderBy:{respondedAt:'desc'}}),
   this.db.contract.findMany({where:{opportunity:{accountId}},orderBy:{createdAt:'desc'}})
  ]);
  const nps=[...reviews.filter(x=>x.type==='NPS'&&x.score!==null).map(x=>({score:x.score!,date:x.occurredAt})),...surveys.filter(x=>x.type==='NPS'&&x.score!==null).map(x=>({score:x.score!,date:x.respondedAt||x.createdAt}))].sort((a,b)=>b.date.getTime()-a.date.getTime()).map(x=>x.score);
  const csat=[...reviews.filter(x=>x.type==='CSAT'&&x.score!==null).map(x=>({score:x.score!,date:x.occurredAt})),...surveys.filter(x=>x.type==='CSAT'&&x.score!==null).map(x=>({score:x.score!,date:x.respondedAt||x.createdAt}))].sort((a,b)=>b.date.getTime()-a.date.getTime()).map(x=>x.score);
  const active=contracts.filter(c=>c.status==='SIGNED'&&c.expiresAt&&c.expiresAt>=now);
  const expiry=active.length?Math.min(...active.map(c=>Math.ceil((c.expiresAt!.getTime()-now.getTime())/day))):null;
  const late=invoices.filter(i=>isOverdue(i,now));
  const health=summarizeHealth({npsScores:nps,csatScores:csat,criticalIssues:issues.filter(i=>i.status==='OPEN'&&i.severity==='CRITICAL').length,highIssues:issues.filter(i=>i.status==='OPEN'&&i.severity==='HIGH').length,overdueInvoices:late.length,overdueAmount:late.reduce((n,i)=>n+Number(i.total)-i.payments.reduce((m,p)=>m+Number(p.amount),0),0),expiresWithinDays:expiry});
  return {invoices,issues,reviews,surveys,contracts,health};
 }
 @Get('clients/:accountId/health') async health(@Req()req:AuthRequest,@Param('accountId')id:string){await this.client(req,id);const data=await this.source(id);return {...data.health,calculatedAt:new Date().toISOString()};}
 @Get('clients/:accountId/reports') async reports(@Req()req:AuthRequest,@Param('accountId')id:string){await this.client(req,id);return this.db.clientReport.findMany({where:{accountId:id},orderBy:{createdAt:'desc'},take:100,select:{id:true,type:true,title:true,periodStart:true,periodEnd:true,isDemo:true,createdAt:true}});}
 @Post('clients/:accountId/reports') async createReport(@Req()req:AuthRequest,@Param('accountId')id:string,@Body()body:{type:'MBR'|'QBR';periodStart:string;periodEnd:string;title?:string;templateId?:string}){
  const account=await this.client(req,id,true);
  if(!body||!['MBR','QBR'].includes(body.type))throw new BadRequestException('Report type must be MBR or QBR.');
  const start=limitedDate(body.periodStart,'periodStart');const end=limitedDate(body.periodEnd,'periodEnd');
  end.setUTCHours(23,59,59,999);
  if(start>end||end.getTime()-start.getTime()>100*day||end.getTime()>Date.now()+day)throw new BadRequestException('Period must be valid and no longer than 100 days.');
  let template:any=null;
  if(body.templateId){
   template=await this.db.reportTemplate.findFirst({where:{id:body.templateId,type:body.type,active:true,organization:{slug:'seebot'}}});
   if(!template)throw new BadRequestException('Report template unavailable.');
  }
  const all=await this.source(id);
  const financials=new Map<string,{currency:string;invoiced:number;collected:number;overdue:number}>();
  for(const inv of all.invoices){const f=financials.get(inv.currency)||{currency:inv.currency,invoiced:0,collected:0,overdue:0};
   if(inv.issuedAt&&inv.issuedAt>=start&&inv.issuedAt<=end)f.invoiced+=Number(inv.total);
   for(const p of inv.payments)if(p.paidAt>=start&&p.paidAt<=end)f.collected+=Number(p.amount);
   if(isOverdue(inv,end))f.overdue+=Math.max(0,Number(inv.total)-inv.payments.filter(p=>p.paidAt<=end).reduce((n,p)=>n+Number(p.amount),0)-inv.adjustments.filter(a=>a.status==='APPROVED'&&a.approvedAt&&a.approvedAt<=end).reduce((n,a)=>n+Number(a.amount),0));
   financials.set(inv.currency,f);
  }
  const actions=all.health.flags.map(f=>`Review and assign an owner for: ${f}`);
  if(!actions.length)actions.push('Confirm priorities and client delivery commitments for the next period.');
  const snapshot:ReportSnapshot={client:account.name,type:body.type,title:String(body.title||`${body.type} - ${account.name}`).slice(0,180),periodStart:iso(start),periodEnd:iso(end),generatedAt:new Date().toISOString(),isDemo:account.isDemo,
   health:{score:all.health.score,level:all.health.level,flags:all.health.flags},financials:[...financials.values()],
   contracts:all.contracts.filter(c=>c.createdAt<=end).map(c=>({title:c.title,status:c.status,expiresAt:c.expiresAt?iso(c.expiresAt):null})),
   issues:all.issues.filter(i=>i.createdAt<=end).map(i=>({title:i.title,severity:i.severity,status:i.status})),
   reviews:[...all.reviews.filter(r=>r.occurredAt>=start&&r.occurredAt<=end).map(r=>({title:r.title,type:r.type,score:r.score,summary:r.summary.slice(0,1200)})),...all.surveys.filter(r=>r.respondedAt&&r.respondedAt>=start&&r.respondedAt<=end).map(r=>({title:r.title,type:r.type,score:r.score,summary:(r.feedback||'No written feedback provided.').slice(0,1200)}))],actions};
  const result=await this.db.clientReport.create({data:{accountId:id,type:body.type,title:snapshot.title,periodStart:start,periodEnd:end,snapshot:{...snapshot,templateSections:template?.sections||null,templateVersion:template?.version||null} as any,templateId:template?.id||null,createdById:req.user.id,isDemo:account.isDemo}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'CLIENT_REPORT_GENERATED',entityType:'CLIENT_REPORT',entityId:result.id,detail:{accountId:id,type:body.type,isDemo:account.isDemo}}});
  return {id:result.id,title:result.title,notice:'Created from a frozen snapshot of CRM data; review before sharing. No email sent.'};
 }
 @Get('reports/:reportId/pdf') async reportPdf(@Req()req:AuthRequest,@Param('reportId')id:string,@Res()res:Response){
   const report=await this.db.clientReport.findUnique({where:{id}});if(!report)throw new BadRequestException('Report not found.');
   await this.client(req,report.accountId);
   const pdf=await renderReportPdf(report.snapshot as unknown as ReportSnapshot);
   res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="client-review-${report.id}.pdf"`);res.setHeader('Cache-Control','private, no-store');res.send(pdf);
 }
 @Get('clients/:accountId/renewals') async renewals(@Req()req:AuthRequest,@Param('accountId')id:string){await this.client(req,id);return this.db.renewalPlan.findMany({where:{contract:{opportunity:{accountId:id}}},include:{contract:{select:{id:true,title:true,status:true,expiresAt:true}}},orderBy:{nextReviewAt:'asc'}});}
 @Post('contracts/:contractId/renewal') async planRenewal(@Req()req:AuthRequest,@Param('contractId')contractId:string,@Body()body:{daysBefore?:number}){
   const c=await this.db.contract.findUnique({where:{id:contractId},include:{opportunity:{include:{account:true}}}});
   if(!c)throw new BadRequestException('Contract not found.');
   await this.client(req,c.opportunity.accountId,true);
   if(c.status!=='SIGNED'||!c.expiresAt)throw new BadRequestException('Renewals require an executed contract with expiry date.');
   const days=body?.daysBefore??60;if(!Number.isInteger(days)||days<7||days>180)throw new BadRequestException('Reminder lead time must be 7–180 days.');
   const reviewAt=new Date(Math.max(Date.now(),c.expiresAt.getTime()-days*day));
   const plan=await this.db.renewalPlan.upsert({where:{contractId},create:{contractId,ownerId:c.opportunity.ownerId,nextReviewAt:reviewAt,notes:'Confirm client objectives, existing pricing and renewal options.'},update:{nextReviewAt:reviewAt}});
   const taskTitle=`Renewal review: ${c.title}`;
   const existing=await this.db.task.findFirst({where:{opportunityId:c.opportunityId,title:taskTitle,status:'OPEN'}});
   if(!existing)await this.db.task.create({data:{organizationId:req.user.organizationId,assigneeId:c.opportunity.ownerId,opportunityId:c.opportunityId,title:taskTitle,dueAt:reviewAt,description:'Review the contract expiry, service performance, client satisfaction and renewal proposal.'}});
   await this.db.auditEvent.create({data:{actorId:req.user.id,action:'RENEWAL_REVIEW_SCHEDULED',entityType:'CONTRACT',entityId:contractId,detail:{nextReviewAt:reviewAt.toISOString()}}});
   return {plan,createdTask:!existing};
 }
}
