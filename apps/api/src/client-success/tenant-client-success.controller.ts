import {BadRequestException,Body,Controller,Get,Param,Post,Req,Res,UseGuards,ForbiddenException} from '@nestjs/common';
import type {Response} from 'express';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {summarizeHealth,isOverdue} from './client-health';
import {renderReportPdf,type ReportSnapshot} from './report-renderer';

const day=86_400_000;
const iso=(date:Date)=>date.toISOString().slice(0,10);
function dateOnly(value:unknown,label:string){
 const text=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw new BadRequestException(label+' must use YYYY-MM-DD.');
 const date=new Date(text+'T00:00:00.000Z');
 if(!Number.isFinite(date.valueOf())||iso(date)!==text)throw new BadRequestException(label+' is invalid.');
 return date;
}
const defaultSections=['Executive Summary','Delivery Performance','Commercial Overview','Client Feedback','Risks & Issues','Decisions & Next Actions'];

@UseGuards(IdentityGuard)
@Controller('workspace-client-success')
export class TenantClientSuccessController{
 constructor(private db:PrismaService,private scope:TenantScopeService){}
 private async admin(req:ScopedRequest,orgId:string){
  return this.scope.membership(req,orgId,'admin');
 }
 private async client(req:ScopedRequest,orgId:string,accountId:string,write=false){
  await this.scope.membership(req,orgId,write);return this.scope.account(orgId,accountId);
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
  const health=summarizeHealth({npsScores:nps,csatScores:csat,criticalIssues:issues.filter(i=>i.status==='OPEN'&&i.severity==='CRITICAL').length,highIssues:issues.filter(i=>i.status==='OPEN'&&i.severity==='HIGH').length,overdueInvoices:late.length,overdueAmount:late.reduce((n,i)=>n+Math.max(0,Number(i.total)-i.payments.reduce((m,p)=>m+Number(p.amount),0)),0),expiresWithinDays:expiry});
  return {invoices,issues,reviews,surveys,contracts,health};
 }
 @Get(':orgId/templates')async templates(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);
  return this.db.reportTemplate.findMany({where:{organizationId:orgId,active:true},orderBy:{createdAt:'desc'}});
 }
 @Post(':orgId/templates')async createTemplate(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:any){
  await this.admin(req,orgId);const name=String(body?.name||'').trim(),type=String(body?.type||'');
  if(name.length<3||name.length>150||!['MBR','QBR'].includes(type))throw new BadRequestException('Template name and MBR/QBR type are required.');
  const sections=body?.sections===undefined?defaultSections:body.sections;
  if(!Array.isArray(sections)||sections.length<2||sections.length>30||sections.some((x:any)=>typeof x!=='string'||x.trim().length<2||x.length>100))throw new BadRequestException('Provide 2–30 report section headings.');
  return this.db.reportTemplate.create({data:{organizationId:orgId,name,type,sections:sections.map((x:string)=>x.trim())}});
 }
 @Get(':orgId/clients/:accountId/reports')async reports(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string){
  await this.client(req,orgId,accountId);
  return this.db.clientReport.findMany({where:{accountId},orderBy:{createdAt:'desc'},take:100,select:{id:true,type:true,title:true,periodStart:true,periodEnd:true,isDemo:true,createdAt:true,status:true,approvedAt:true}});
 }
 @Post(':orgId/clients/:accountId/reports')async createReport(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){
  const account=await this.client(req,orgId,accountId,true),type=String(body?.type||'');
  if(!['MBR','QBR'].includes(type))throw new BadRequestException('Report type must be MBR or QBR.');
  const start=dateOnly(body?.periodStart,'Period start'),end=dateOnly(body?.periodEnd,'Period end');end.setUTCHours(23,59,59,999);
  if(start>end||end.getTime()-start.getTime()>100*day||end.getTime()>Date.now()+day)throw new BadRequestException('Report period must be valid and no longer than 100 days.');
  let template:any=null;
  if(body?.templateId){template=await this.db.reportTemplate.findFirst({where:{id:String(body.templateId),organizationId:orgId,type,active:true}});if(!template)throw new BadRequestException('Report template unavailable in this workspace.');}
  const source=await this.source(accountId),financials=new Map<string,{currency:string;invoiced:number;collected:number;overdue:number}>();
  for(const inv of source.invoices){
   const item=financials.get(inv.currency)||{currency:inv.currency,invoiced:0,collected:0,overdue:0};
   if(inv.issuedAt&&inv.issuedAt>=start&&inv.issuedAt<=end)item.invoiced+=Number(inv.total);
   for(const payment of inv.payments)if(payment.paidAt>=start&&payment.paidAt<=end)item.collected+=Number(payment.amount);
   if(isOverdue(inv,end))item.overdue+=Math.max(0,Number(inv.total)-inv.payments.filter(p=>p.paidAt<=end).reduce((n,p)=>n+Number(p.amount),0)-inv.adjustments.filter(a=>a.status==='APPROVED'&&a.approvedAt&&a.approvedAt<=end).reduce((n,a)=>n+Number(a.amount),0));
   financials.set(inv.currency,item);
  }
  const actions=source.health.flags.map(flag=>'Review and assign an owner for: '+flag);if(!actions.length)actions.push('Confirm priorities, satisfaction and delivery commitments for the next period.');
  const snapshot:ReportSnapshot={client:account.name,type:type as 'MBR'|'QBR',title:String(body?.title||type+' - '+account.name).trim().slice(0,180),periodStart:iso(start),periodEnd:iso(end),generatedAt:new Date().toISOString(),isDemo:account.isDemo,
   health:{score:source.health.score,level:source.health.level,flags:source.health.flags},financials:[...financials.values()],
   contracts:source.contracts.filter(c=>c.createdAt<=end).map(c=>({title:c.title,status:c.status,expiresAt:c.expiresAt?iso(c.expiresAt):null})),
   issues:source.issues.filter(i=>i.createdAt<=end).map(i=>({title:i.title,severity:i.severity,status:i.status})),
   reviews:[...source.reviews.filter(r=>r.occurredAt>=start&&r.occurredAt<=end).map(r=>({title:r.title,type:r.type,score:r.score,summary:r.summary.slice(0,1200)})),...source.surveys.filter(r=>r.respondedAt&&r.respondedAt>=start&&r.respondedAt<=end).map(r=>({title:r.title,type:r.type,score:r.score,summary:(r.feedback||'No written feedback provided.').slice(0,1200)}))],actions};
  const report=await this.db.clientReport.create({data:{accountId,type,title:snapshot.title,periodStart:start,periodEnd:end,snapshot:{...snapshot,templateSections:template?.sections||null,templateVersion:template?.version||null} as any,templateId:template?.id||null,createdById:req.user.id,isDemo:account.isDemo}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CLIENT_REPORT_GENERATED',entityType:'CLIENT_REPORT',entityId:report.id,detail:{organizationId:orgId,accountId,type}}});
  return {id:report.id,title:report.title,status:report.status};
 }
 @Post(':orgId/reports/:reportId/approve')async approve(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('reportId')reportId:string){
  await this.admin(req,orgId);
  const report=await this.db.clientReport.findFirst({where:{id:reportId,account:{organizationId:orgId}}});if(!report)throw new BadRequestException('Client report unavailable.');
  const changed=await this.db.clientReport.updateMany({where:{id:reportId,status:'DRAFT'},data:{status:'APPROVED',approvedById:req.user.id,approvedAt:new Date()}});
  if(changed.count!==1)throw new BadRequestException('Only a draft report can be approved.');
  return {approved:true};
 }
 @Get(':orgId/reports/:reportId/pdf')async pdf(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('reportId')reportId:string,@Res()res:Response){
  await this.scope.membership(req,orgId);
  const report=await this.db.clientReport.findFirst({where:{id:reportId,account:{organizationId:orgId}}});if(!report)throw new BadRequestException('Client report unavailable.');
  const bytes=await renderReportPdf(report.snapshot as unknown as ReportSnapshot);
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="client-review-'+report.id+'.pdf"');res.setHeader('Cache-Control','private, no-store');res.send(bytes);
 }
}
