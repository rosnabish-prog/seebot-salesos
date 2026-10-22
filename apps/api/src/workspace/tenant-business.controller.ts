import {BadRequestException,Body,Controller,Delete,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import {TenantScopeService,type ScopedRequest} from './tenant-scope.service';
import {validateInvoiceTotals} from '../accounting/receivable-policy';
import {randomUUID} from 'node:crypto';
import {OpportunityWorkflowService} from '../opportunities/workflow.service';
import {STAGE_INDEX} from '@seebot/shared';
import {summarizeHealth,isOverdue} from '../client-success/client-health';
const txt=(s:any,max=160)=>String(s??'').trim().slice(0,max);
const relationshipStages=['PILOT_CONTRACTED','PILOT_DELIVERED','PRODUCTION_NEGOTIATED','CLOSED_WON'];
/** Tenant-specific business routes. The legacy global CRM is never opened to other companies. */
@UseGuards(IdentityGuard) @Controller('workspace-business')
export class TenantBusinessController{
 constructor(private db:PrismaService,private scope:TenantScopeService,private workflow:OpportunityWorkflowService){}
 @Get(':orgId/opportunities')async opportunities(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.scope.membership(req,orgId);return this.db.opportunity.findMany({where:{account:{organizationId:orgId}},select:{id:true,accountId:true,title:true,stage:true,status:true,estimatedAmount:true,currency:true,updatedAt:true,owner:{select:{id:true,name:true}},account:{select:{id:true,name:true,industry:true,priority:true}},stageVisits:{where:{exitedAt:null},select:{stage:true,evidence:true}}},take:150,orderBy:{updatedAt:'desc'}});}
 @Post(':orgId/accounts/:accountId/opportunities')async addOpportunity(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){await this.scope.membership(req,orgId,true);const account=await this.scope.account(orgId,accountId);this.scope.assertFictional(account.domain);const title=txt(body?.title,200),serviceLine=txt(body?.serviceLine,120);if(!title||!serviceLine)throw new BadRequestException('Opportunity title and service required.');return this.db.opportunity.create({data:{accountId,title,serviceLine,ownerId:req.user.id,stageVisits:{create:{stage:'ACCOUNT_RESEARCHED'}}}});}
 @Get(':orgId/opportunities/:id')async opportunity(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){await this.scope.membership(req,orgId);await this.scope.opportunity(orgId,id);return this.db.opportunity.findUnique({where:{id},include:{account:{select:{id:true,name:true,domain:true}},stageVisits:{orderBy:{enteredAt:'desc'}},contracts:{select:{id:true,title:true,status:true,committedAmount:true,currency:true}},invoices:{select:{id:true,number:true,status:true,total:true}}}});}
 /** Tenant-specific Kanban transitions use the SAME evidence and contract gates as legacy CRM. */
 @Post(':orgId/opportunities/:id/transition')async transition(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:{targetStage:string;reason?:string;override?:boolean}){
  const member=await this.scope.membership(req,orgId,true);
  await this.scope.opportunity(orgId,id);
  const destination=String(body?.targetStage||'');
  if(!Object.prototype.hasOwnProperty.call(STAGE_INDEX,destination))throw new BadRequestException('Unknown pipeline stage.');
  return this.workflow.manualTransition(id,req.user.id,{targetStage:destination,reason:body?.reason,override:body?.override},['OWNER','ADMIN'].includes(member.role));
 }
 @Get(':orgId/opportunities/:id/stage-state')async stageState(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.scope.membership(req,orgId);
  await this.scope.opportunity(orgId,id);
  return this.workflow.stageState(id);
 }
 @Post(':orgId/opportunities/:id/evidence')async evidence(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:{fields:Record<string,unknown>}){
  await this.scope.membership(req,orgId,true);
  await this.scope.opportunity(orgId,id);
  if(!body?.fields||typeof body.fields!=='object'||Array.isArray(body.fields))throw new BadRequestException('Evidence fields required.');
  for(const value of Object.values(body.fields))if(typeof value!=='string'||value.length>5000)throw new BadRequestException('Evidence values must be text under 5000 characters.');
  return this.workflow.saveEvidence(id,req.user.id,body.fields);
 }
 @Get(':orgId/clients')async clients(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);
  const rows=await this.db.account.findMany({where:{organizationId:orgId,OR:[{status:{in:['Contracting','Customer']}},{opportunities:{some:{stage:{in:relationshipStages}}}}]},select:{id:true,name:true,domain:true,status:true,clientSince:true,contacts:{select:{id:true,name:true,title:true,email:true}},opportunities:{select:{id:true,title:true,stage:true,status:true},orderBy:{updatedAt:'desc'}},invoices:{select:{id:true,number:true,status:true,total:true,currency:true,dueAt:true}}},take:100,orderBy:{updatedAt:'desc'}});
  return rows.map(account=>{const highest=account.opportunities.reduce((best,o)=>Math.max(best,STAGE_INDEX[o.stage as keyof typeof STAGE_INDEX]??-1),-1);return {...account,relationshipStatus:account.status==='Customer'?'ACTIVE_CLIENT':account.status==='Contracting'||highest>=STAGE_INDEX.PILOT_CONTRACTED?'CONTRACTING':'PROSPECT'};});
 }
 @Get(':orgId/clients/:id')async client(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.scope.membership(req,orgId);await this.scope.account(orgId,id);
  return this.db.account.findUnique({where:{id},include:{
   contacts:true,
   opportunities:{select:{id:true,title:true,stage:true,status:true,contracts:{select:{id:true,title:true,status:true,signedAt:true,expiresAt:true,committedAmount:true,currency:true}}},orderBy:{updatedAt:'desc'}},
   invoices:{select:{id:true,number:true,status:true,currency:true,total:true,dueAt:true,issuedAt:true}},
   clientReviews:{orderBy:{occurredAt:'desc'},take:20},
   clientIssues:{orderBy:{createdAt:'desc'},take:20},
   milestones:{orderBy:{createdAt:'desc'},take:20}
  }});
 }
 @Get(':orgId/clients/:id/health')async clientHealth(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.scope.membership(req,orgId);await this.scope.account(orgId,id);
  const [reviews,surveys,issues,contracts,invoices]=await Promise.all([
   this.db.clientReview.findMany({where:{accountId:id,score:{not:null}},orderBy:{occurredAt:'desc'},take:50}),
   this.db.clientSurveyInvitation.findMany({where:{accountId:id,status:'ANSWERED',score:{not:null}},orderBy:{respondedAt:'desc'},take:50}),
   this.db.clientIssue.findMany({where:{accountId:id,status:'OPEN'}}),
   this.db.contract.findMany({where:{opportunity:{accountId:id},status:'SIGNED'},select:{expiresAt:true}}),
   this.db.invoice.findMany({where:{accountId:id},include:{payments:true}})
  ]);
  const dated=[...reviews.map(r=>({type:r.type,score:r.score!,date:r.occurredAt})),...surveys.map(r=>({type:r.type,score:r.score!,date:r.respondedAt||r.createdAt}))].sort((a,b)=>b.date.getTime()-a.date.getTime());
  const now=new Date(),expiring=contracts.filter(c=>c.expiresAt&&c.expiresAt>=now).map(c=>Math.ceil((c.expiresAt!.getTime()-now.getTime())/86400000));
  const overdue=invoices.filter(i=>isOverdue(i,now));
  return summarizeHealth({
   npsScores:dated.filter(x=>x.type==='NPS').map(x=>x.score),
   csatScores:dated.filter(x=>x.type==='CSAT').map(x=>x.score),
   criticalIssues:issues.filter(i=>i.severity==='CRITICAL').length,
   highIssues:issues.filter(i=>i.severity==='HIGH').length,
   overdueInvoices:overdue.length,
   overdueAmount:overdue.reduce((sum,i)=>sum+Math.max(0,Number(i.total)-i.payments.reduce((n,p)=>n+Number(p.amount),0)),0),
   expiresWithinDays:expiring.length?Math.min(...expiring):null
  });
 }
 @Post(':orgId/clients/:id/reviews')async addReview(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.scope.membership(req,orgId,true);const account=await this.scope.account(orgId,id);
  const type=txt(body?.type,20),title=txt(body?.title,180),summary=txt(body?.summary,4000),score=body?.score===undefined||body?.score===null?null:Number(body.score);
  if(type!=='GENERAL'||title.length<2||summary.length<2)throw new BadRequestException('Use General Review here. NPS/CSAT belongs in Client Satisfaction, and MBR/QBR belongs in Business Reviews.');
  return this.db.clientReview.create({data:{accountId:id,type,title,summary,score,actionItems:Array.isArray(body?.actionItems)?body.actionItems.slice(0,30):[],recordedById:req.user.id,isDemo:account.isDemo}});
 }
 @Post(':orgId/clients/:id/issues')async addIssue(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.scope.membership(req,orgId,true);const account=await this.scope.account(orgId,id);
  const title=txt(body?.title,200),details=txt(body?.details,4000),severity=txt(body?.severity,20).toUpperCase();
  if(title.length<3||!['LOW','MEDIUM','HIGH','CRITICAL'].includes(severity))throw new BadRequestException('Issue title and severity are required.');
  return this.db.clientIssue.create({data:{accountId:id,title,details:details||null,severity,status:'OPEN',isDemo:account.isDemo}});
 }
 @Patch(':orgId/clients/:id/issues/:issueId')async updateIssue(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Param('issueId')issueId:string,@Body()body:any){
  await this.scope.membership(req,orgId,true);await this.scope.account(orgId,id);
  const issue=await this.db.clientIssue.findFirst({where:{id:issueId,accountId:id}});if(!issue)throw new BadRequestException('Client issue not found.');
  const status=txt(body?.status,20).toUpperCase();if(!['OPEN','RESOLVED'].includes(status))throw new BadRequestException('Issue status must be Open or Resolved.');
  return this.db.clientIssue.update({where:{id:issue.id},data:{status,resolvedAt:status==='RESOLVED'?new Date():null}});
 }
 @Post(':orgId/clients/:id/milestones')async addMilestone(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.scope.membership(req,orgId,true);const account=await this.scope.account(orgId,id);
  const title=txt(body?.title,200),description=txt(body?.description,4000),criteria=txt(body?.acceptanceCriteria,5000),dueAt=body?.dueAt?new Date(body.dueAt):null;
  if(title.length<3||criteria.length<3||(dueAt&&!Number.isFinite(dueAt.getTime())))throw new BadRequestException('Milestone title, acceptance criteria and valid date are required.');
  if(body?.contractId){const contract=await this.scope.contract(orgId,String(body.contractId));if(contract.opportunity.accountId!==id)throw new BadRequestException('Contract belongs to another client.');}
  return this.db.deliveryMilestone.create({data:{accountId:id,contractId:body?.contractId||null,title,description,acceptanceCriteria:criteria,dueAt,isDemo:account.isDemo,createdById:req.user.id}});
 }
 @Patch(':orgId/clients/:id/milestones/:milestoneId')async updateMilestone(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Param('milestoneId')milestoneId:string,@Body()body:any){
  await this.scope.membership(req,orgId,true);await this.scope.account(orgId,id);
  const milestone=await this.db.deliveryMilestone.findFirst({where:{id:milestoneId,accountId:id}});if(!milestone)throw new BadRequestException('Delivery milestone not found.');
  const status=txt(body?.status,30).toUpperCase();if(!['PLANNED','IN_PROGRESS','SUBMITTED','ACCEPTED','REJECTED'].includes(status))throw new BadRequestException('Invalid milestone status.');
  const evidence=txt(body?.evidenceReference,500);if(status==='ACCEPTED'&&evidence.length<6)throw new BadRequestException('Acceptance evidence reference is required.');
  const acceptedAt=status==='ACCEPTED'?new Date():null;
  return this.db.$transaction(async tx=>{
   const updated=await tx.deliveryMilestone.update({where:{id:milestone.id},data:{status,actualAcceptedAt:acceptedAt}});
   let armedBillingSchedules=0;
   if(status==='ACCEPTED'){
    const result=await tx.billingSchedule.updateMany({where:{milestoneId:milestone.id,cadence:'MILESTONE',status:'ACTIVE',nextDueAt:null},data:{nextDueAt:acceptedAt}});
    armedBillingSchedules=result.count;
   }
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_MILESTONE_STATUS',entityType:'DELIVERY_MILESTONE',entityId:milestone.id,detail:{organizationId:orgId,status,evidenceReference:evidence,armedBillingSchedules}}});
   return {...updated,armedBillingSchedules};
  });
 }
 @Get(':orgId/clients/:id/renewals')async renewals(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.scope.membership(req,orgId);await this.scope.account(orgId,id);
  return this.db.renewalPlan.findMany({where:{contract:{opportunity:{accountId:id,account:{organizationId:orgId}}}},include:{contract:{select:{id:true,title:true,status:true,expiresAt:true}}},orderBy:{nextReviewAt:'asc'}});
 }
 @Post(':orgId/contracts/:id/renewal')async planRenewal(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.scope.membership(req,orgId,true);const contract=await this.scope.contract(orgId,id);
  if(contract.status!=='SIGNED'||!contract.expiresAt)throw new BadRequestException('Renewal planning requires a signed contract with an expiry date.');
  const days=Number(body?.daysBefore??60);if(!Number.isInteger(days)||days<7||days>180)throw new BadRequestException('Renewal lead time must be 7–180 days.');
  const reviewAt=new Date(Math.max(Date.now(),contract.expiresAt.getTime()-days*86400000));
  const plan=await this.db.renewalPlan.upsert({where:{contractId:id},create:{contractId:id,ownerId:contract.opportunity.ownerId,nextReviewAt:reviewAt,notes:'Review satisfaction, delivery performance, pricing and renewal options.'},update:{nextReviewAt:reviewAt}});
  const title='Renewal review: '+contract.title;
  const existing=await this.db.task.findFirst({where:{opportunityId:contract.opportunityId,title,status:'OPEN'}});
  if(!existing)await this.db.task.create({data:{organizationId:orgId,opportunityId:contract.opportunityId,assigneeId:contract.opportunity.ownerId,title,dueAt:reviewAt,description:'Review client health, contract performance and renewal proposal.'}});
  return {plan,createdTask:!existing};
 }

 @Get(':orgId/contracts')async contracts(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.scope.membership(req,orgId);return this.db.contract.findMany({where:{opportunity:{account:{organizationId:orgId}}},select:{id:true,title:true,type:true,status:true,opportunityId:true,committedAmount:true,currency:true,createdAt:true},take:150,orderBy:{createdAt:'desc'}});}
 @Post(':orgId/opportunities/:opportunityId/contracts')async addContract(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('opportunityId')opportunityId:string,@Body()body:any){await this.scope.membership(req,orgId,true);const opp=await this.scope.opportunity(orgId,opportunityId);this.scope.assertFictional(opp.account.domain);const type=txt(body?.type);if(!['NDA','MSA','SOW','DPA','PRODUCTION_OTHER'].includes(type)||!txt(body?.title,200))throw new BadRequestException('Contract title and type required.');if(body.parentContractId){const parent=await this.scope.contract(orgId,String(body.parentContractId));if(parent.type!=='MSA'||parent.opportunity.accountId!==opp.accountId||type!=='SOW')throw new BadRequestException('Parent MSA must belong to the same account.');}return this.db.contract.create({data:{opportunityId,title:txt(body.title,200),type:type as any,status:'DRAFT',isDemo:this.scope.preview(),parentContractId:body.parentContractId||null}});}
 @Get(':orgId/contracts/:id')async contract(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){await this.scope.membership(req,orgId);await this.scope.contract(orgId,id);return this.db.contract.findUnique({where:{id},include:{pricingLines:true,signingParties:{select:{name:true,email:true,role:true,status:true,signingOrder:true}},amendments:{orderBy:{version:'desc'}},documents:{select:{id:true,fileName:true,kind:true,sha256:true,uploadedAt:true,verifiedAt:true,verifiedById:true}}}});}
 @Get(':orgId/invoices')async invoices(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.scope.membership(req,orgId);return this.db.invoice.findMany({where:{account:{organizationId:orgId}},select:{id:true,accountId:true,contractId:true,number:true,status:true,total:true,currency:true,dueAt:true,createdAt:true},take:200,orderBy:{createdAt:'desc'}});}
 @Post(':orgId/accounts/:accountId/invoices')async invoiceDraft(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){await this.scope.membership(req,orgId,true);const a=await this.scope.account(orgId,accountId);this.scope.assertFictional(a.domain);if(body?.contractId)await this.scope.contract(orgId,String(body.contractId)).then(c=>{if(c.opportunity.accountId!==accountId)throw new BadRequestException('Contract belongs to another customer.');});const items=body?.lineItems;if(!Array.isArray(items)||items.length<1||items.length>100||!items.every((r:any)=>typeof r.description==='string'&&r.description.trim()&&r.description.length<=250))throw new BadRequestException('Valid invoice lines required.');if(!validateInvoiceTotals(items,body.subtotal,body.tax,body.total))throw new BadRequestException('Invoice totals do not reconcile.');const dueAt=new Date(body?.dueAt),currency=txt(body?.currency);if(!Number.isFinite(dueAt.getTime())||!/^[A-Z]{3}$/.test(currency)||!/^\S+@\S+\.\S+$/.test(txt(body.billingEmail)))throw new BadRequestException('Valid due date, currency and billing email required.');return this.db.invoice.create({data:{accountId,currency,lineItems:items,subtotal:body.subtotal,tax:body.tax,total:body.total,billingEmail:txt(body.billingEmail),status:'DRAFT',isDemo:this.scope.preview(),number:`DRAFT-${randomUUID()}`,contractId:body.contractId||null,dueAt,createdById:req.user.id}});}
 @Get(':orgId/invoices/:id')async invoice(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){await this.scope.membership(req,orgId);await this.scope.invoice(orgId,id);return this.db.invoice.findUnique({where:{id},include:{payments:true,adjustments:true,recipients:true,document:{select:{sha256:true,invoiceNumber:true,createdAt:true}}}});}

 @Get(':orgId/tasks')async tasks(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);
  return this.db.task.findMany({
   where: { OR: [
     { organizationId:orgId },
     { opportunity:{account:{organizationId:orgId}} }
   ] },
   select: {
    id:true,title:true,status:true,description:true,dueAt:true,createdAt:true,
    assignee:{select:{id:true,name:true}},
    opportunity:{select:{id:true,title:true}}
   },
   orderBy:{createdAt:'desc'},take:200
  });
 }
 @Post(':orgId/tasks')async addTask(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:{title?:string;description?:string;dueAt?:string|null;assigneeId?:string;opportunityId?:string|null}){
  await this.scope.membership(req,orgId,true);
  const title=txt(body?.title,160),description=txt(body?.description,1500),dueAt=body?.dueAt?new Date(body.dueAt):null,assigneeId=String(body?.assigneeId||req.user.id);
  if(title.length<2||(dueAt&&!Number.isFinite(dueAt.getTime())))throw new BadRequestException('Task title and valid due date required.');
  const assignee=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:assigneeId}}});
  if(!assignee||assignee.status!=='ACTIVE')throw new BadRequestException('Task assignee must be an active member of this workspace.');
  let opportunityId:string|null=null;
  if(body?.opportunityId){const opportunity=await this.scope.opportunity(orgId,String(body.opportunityId));opportunityId=opportunity.id;}
  const created=await this.db.task.create({data:{organizationId:orgId,assigneeId,title,description:description||null,dueAt,opportunityId}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_TASK_CREATED',entityType:'TASK',entityId:created.id,detail:{organizationId:orgId,assigneeId,opportunityId}}});
  return created;
 }
 @Patch(':orgId/tasks/:taskId')async changeTask(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('taskId')taskId:string,@Body()body:{status:string}){
  const member=await this.scope.membership(req,orgId,true);
  if(!['OPEN','DONE'].includes(body?.status))throw new BadRequestException('Choose Open or Done.');
  const task=await this.db.task.findFirst({where:{
    id:taskId,OR:[{organizationId:orgId},{opportunity:{account:{organizationId:orgId}}}]
   }});
  if(!task)throw new BadRequestException('Task not found in this workspace.');
  if(task.assigneeId!==req.user.id&&!['ADMIN','OWNER'].includes(member.role))throw new BadRequestException('You may update your tasks only.');
  return this.db.task.update({where:{id:task.id},data:{status:body.status as 'OPEN'|'DONE',completedAt:body.status==='DONE'?new Date():null}});
 }
 @Get(':orgId/campaigns')async campaigns(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);
  return this.db.campaign.findMany({where:{organizationId:orgId},select:{id:true,name:true,sector:true,status:true,objective:true,createdAt:true,owner:{select:{name:true}},
   accounts:{select:{account:{select:{id:true,name:true}}}}},orderBy:{createdAt:'desc'},take:150});
 }
 @Post(':orgId/campaigns')async addCampaign(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:{name?:string;sector?:string;objective?:string}){
  await this.scope.membership(req,orgId,true);
  const name=txt(body?.name,150),sector=txt(body?.sector,100),objective=txt(body?.objective,1000);
  if(name.length<2||sector.length<2)throw new BadRequestException('Campaign name and sector are required.');
  return this.db.campaign.create({data:{organizationId:orgId,ownerId:req.user.id,name,sector,objective:objective||null,status:'PLANNING'}});
 }
 @Post(':orgId/campaigns/:campaignId/accounts')async enrollCampaign(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('campaignId')campaignId:string,@Body()body:{accountId?:string}){
  await this.scope.membership(req,orgId,true);
  const campaign=await this.db.campaign.findFirst({where:{id:campaignId,organizationId:orgId}});if(!campaign)throw new BadRequestException('Campaign unavailable in this workspace.');
  const account=await this.scope.account(orgId,String(body?.accountId||''));
  return this.db.campaignAccount.upsert({where:{campaignId_accountId:{campaignId,accountId:account.id}},create:{campaignId,accountId:account.id},update:{}});
 }
 @Delete(':orgId/campaigns/:campaignId/accounts/:accountId')async removeCampaignAccount(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('campaignId')campaignId:string,@Param('accountId')accountId:string){
  await this.scope.membership(req,orgId,true);
  const campaign=await this.db.campaign.findFirst({where:{id:campaignId,organizationId:orgId}});if(!campaign)throw new BadRequestException('Campaign unavailable in this workspace.');
  await this.scope.account(orgId,accountId);await this.db.campaignAccount.deleteMany({where:{campaignId,accountId}});return {removed:true};
 }
 @Patch(':orgId/campaigns/:campaignId')async updateCampaign(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('campaignId')campaignId:string,@Body()body:{status?:string}){
  await this.scope.membership(req,orgId,true);const status=String(body?.status||'').toUpperCase();
  if(!['PLANNING','ACTIVE','PAUSED','COMPLETED'].includes(status))throw new BadRequestException('Invalid campaign status.');
  const campaign=await this.db.campaign.findFirst({where:{id:campaignId,organizationId:orgId}});if(!campaign)throw new BadRequestException('Campaign unavailable in this workspace.');
  return this.db.campaign.update({where:{id:campaign.id},data:{status}});
 }

 @Get(':orgId/dashboard')async dashboard(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);const now=new Date(),staleBefore=new Date(now.getTime()-14*86400000),expiryCutoff=new Date(now.getTime()+60*86400000);
  const [accounts,clients,opportunityRows,contracts,invoices,tasks]=await Promise.all([
   this.db.account.count({where:{organizationId:orgId}}),
   this.db.account.count({where:{organizationId:orgId,status:'Customer'}}),
   this.db.opportunity.findMany({where:{account:{organizationId:orgId}},select:{id:true,status:true,stage:true,createdAt:true,updatedAt:true,closedAt:true,estimatedAmount:true,currency:true},take:3000}),
   this.db.contract.findMany({where:{opportunity:{account:{organizationId:orgId}}},select:{id:true,status:true,expiresAt:true},take:2000}),
   this.db.invoice.findMany({where:{account:{organizationId:orgId}},include:{payments:{select:{amount:true}},adjustments:{select:{amount:true,kind:true,status:true}}},take:3000}),
   this.db.task.findMany({where:{organizationId:orgId,status:'OPEN'},select:{id:true,dueAt:true},take:3000})
  ]);
  const invoicedByCurrency:Record<string,number>={},openPipelineByCurrency:Record<string,number>={},overdueReceivablesByCurrency:Record<string,number>={};
  for(const inv of invoices){
   if(!['DRAFT','VOID'].includes(inv.status))invoicedByCurrency[inv.currency]=(invoicedByCurrency[inv.currency]||0)+Number(inv.total);
   if(['SENT','PARTIALLY_PAID'].includes(inv.status)&&inv.dueAt<now){
    const paid=inv.payments.reduce((n,p)=>n+Number(p.amount),0),credits=inv.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0),due=Math.max(0,Number(inv.total)-paid-credits);
    if(due>0)overdueReceivablesByCurrency[inv.currency]=(overdueReceivablesByCurrency[inv.currency]||0)+due;
   }
  }
  for(const opp of opportunityRows)if(opp.status==='OPEN'&&opp.estimatedAmount!==null)openPipelineByCurrency[opp.currency]=(openPipelineByCurrency[opp.currency]||0)+Number(opp.estimatedAmount);
  const won=opportunityRows.filter(o=>o.status==='CLOSED_WON'),lost=opportunityRows.filter(o=>o.status==='CLOSED_LOST'),closed=won.length+lost.length;
  const cycles=won.filter(o=>o.closedAt).map(o=>Math.max(0,o.closedAt!.getTime()-o.createdAt.getTime())/86400000).sort((a,b)=>a-b);
  const medianSalesCycleDays=cycles.length?(cycles.length%2?cycles[(cycles.length-1)/2]:(cycles[cycles.length/2-1]+cycles[cycles.length/2])/2):null;
  return {
   mode:this.scope.preview()?'DEMO_ONLY':'LIVE_WORKSPACE',organizationId:orgId,accounts,clients,opportunities:opportunityRows.length,contracts:contracts.length,invoices:invoices.length,invoicedByCurrency,
   analytics:{
    won:won.length,lost:lost.length,winRate:closed?Math.round(won.length*1000/closed)/10:null,
    medianSalesCycleDays:medianSalesCycleDays===null?null:Math.round(medianSalesCycleDays*10)/10,
    staleOpen:opportunityRows.filter(o=>o.status==='OPEN'&&o.updatedAt<staleBefore).length,
    overdueTasks:tasks.filter(t=>t.dueAt&&t.dueAt<now).length,
    expiringContracts60d:contracts.filter(c=>c.status==='SIGNED'&&c.expiresAt&&c.expiresAt>=now&&c.expiresAt<=expiryCutoff).length,
    openPipelineByCurrency,overdueReceivablesByCurrency
   }
  };
 }
}
