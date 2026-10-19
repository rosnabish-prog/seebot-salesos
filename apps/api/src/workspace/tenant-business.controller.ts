import {BadRequestException,Body,Controller,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import {TenantScopeService,type ScopedRequest} from './tenant-scope.service';
import {validateInvoiceTotals} from '../accounting/receivable-policy';
import {randomUUID} from 'node:crypto';
import {OpportunityWorkflowService} from '../opportunities/workflow.service';
import {STAGE_INDEX} from '@seebot/shared';
const txt=(s:any,max=160)=>String(s??'').trim().slice(0,max);
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
 @Get(':orgId/clients')async clients(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.scope.membership(req,orgId);return this.db.account.findMany({where:{organizationId:orgId,status:'Customer'},select:{id:true,name:true,domain:true,contacts:{select:{id:true,name:true,title:true,email:true}},invoices:{select:{id:true,number:true,status:true,total:true,currency:true,dueAt:true}}},take:100,orderBy:{updatedAt:'desc'}});}
 @Get(':orgId/clients/:id')async client(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.scope.membership(req,orgId);await this.scope.account(orgId,id);
  return this.db.account.findUnique({where:{id},include:{
   contacts:true,
   opportunities:{select:{id:true,title:true,stage:true,status:true,contracts:{select:{id:true,title:true,status:true}}}},
   invoices:{select:{id:true,number:true,status:true,currency:true,total:true,dueAt:true}}
  }});
 }
 @Get(':orgId/contracts')async contracts(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.scope.membership(req,orgId);return this.db.contract.findMany({where:{opportunity:{account:{organizationId:orgId}}},select:{id:true,title:true,type:true,status:true,opportunityId:true,committedAmount:true,currency:true,createdAt:true},take:150,orderBy:{createdAt:'desc'}});}
 @Post(':orgId/opportunities/:opportunityId/contracts')async addContract(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('opportunityId')opportunityId:string,@Body()body:any){await this.scope.membership(req,orgId,true);const opp=await this.scope.opportunity(orgId,opportunityId);this.scope.assertFictional(opp.account.domain);const type=txt(body?.type);if(!['NDA','MSA','SOW','DPA','PRODUCTION_OTHER'].includes(type)||!txt(body?.title,200))throw new BadRequestException('Contract title and type required.');if(body.parentContractId){const parent=await this.scope.contract(orgId,String(body.parentContractId));if(parent.type!=='MSA'||parent.opportunity.accountId!==opp.accountId||type!=='SOW')throw new BadRequestException('Parent MSA must belong to the same account.');}return this.db.contract.create({data:{opportunityId,title:txt(body.title,200),type:type as any,status:'DRAFT',isDemo:this.scope.preview(),parentContractId:body.parentContractId||null}});}
 @Get(':orgId/contracts/:id')async contract(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){await this.scope.membership(req,orgId);await this.scope.contract(orgId,id);return this.db.contract.findUnique({where:{id},include:{pricingLines:true,signingParties:{select:{name:true,email:true,role:true,status:true,signingOrder:true}},amendments:{orderBy:{version:'desc'}},documents:{select:{id:true,fileName:true,kind:true,sha256:true,uploadedAt:true}}}});}
 @Get(':orgId/invoices')async invoices(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.scope.membership(req,orgId);return this.db.invoice.findMany({where:{account:{organizationId:orgId}},select:{id:true,accountId:true,contractId:true,number:true,status:true,total:true,currency:true,dueAt:true,createdAt:true},take:200,orderBy:{createdAt:'desc'}});}
 @Post(':orgId/accounts/:accountId/invoices')async invoiceDraft(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){await this.scope.membership(req,orgId,true);const a=await this.scope.account(orgId,accountId);this.scope.assertFictional(a.domain);if(body?.contractId)await this.scope.contract(orgId,String(body.contractId)).then(c=>{if(c.opportunity.accountId!==accountId)throw new BadRequestException('Contract belongs to another customer.');});const items=body?.lineItems;if(!Array.isArray(items)||items.length<1||items.length>100||!items.every((r:any)=>typeof r.description==='string'&&r.description.trim()&&r.description.length<=250))throw new BadRequestException('Valid invoice lines required.');if(!validateInvoiceTotals(items,body.subtotal,body.tax,body.total))throw new BadRequestException('Invoice totals do not reconcile.');const dueAt=new Date(body?.dueAt),currency=txt(body?.currency);if(!Number.isFinite(dueAt.getTime())||!/^[A-Z]{3}$/.test(currency)||!/^\S+@\S+\.\S+$/.test(txt(body.billingEmail)))throw new BadRequestException('Valid due date, currency and billing email required.');return this.db.invoice.create({data:{accountId,currency,lineItems:items,subtotal:body.subtotal,tax:body.tax,total:body.total,billingEmail:txt(body.billingEmail),status:'DRAFT',isDemo:this.scope.preview(),number:`DRAFT-${randomUUID()}`,contractId:body.contractId||null,dueAt,createdById:req.user.id}});}
 @Get(':orgId/invoices/:id')async invoice(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){await this.scope.membership(req,orgId);await this.scope.invoice(orgId,id);return this.db.invoice.findUnique({where:{id},include:{payments:true,adjustments:true,recipients:true,document:{select:{sha256:true,invoiceNumber:true,createdAt:true}}}});}

 @Get(':orgId/tasks')async tasks(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);
  return this.db.task.findMany({where:{OR:[{organizationId:orgId},{opportunity:{account:{organizationId:orgId}}}]},
   select:{id:true,title:true,status:true,description:true,dueAt:true,assignee:{select:{id:true,name:true}},opportunity:{select:{id:true,title:true}}},
   createdAt:true},orderBy:{createdAt:'desc'},take:200});
 }
 @Post(':orgId/tasks')async addTask(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:{title?:string;description?:string;dueAt?:string|null}){
  await this.scope.membership(req,orgId,true);
  const title=txt(body?.title,160),description=txt(body?.description,1500),dueAt=body?.dueAt?new Date(body.dueAt):null;
  if(title.length<2||(dueAt&&!Number.isFinite(dueAt.getTime())))throw new BadRequestException('Task title and valid due date required.');
  return this.db.task.create({data:{organizationId:orgId,assigneeId:req.user.id,title,description:description||null,dueAt}});
 }
 @Patch(':orgId/tasks/:taskId')async changeTask(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('taskId')taskId:string,@Body()body:{status:string}){
  const member=await this.scope.membership(req,orgId,true);
  if(!['OPEN','DONE'].includes(body?.status))throw new BadRequestException('Choose Open or Done.');
  const task=await this.db.task.findFirst({where:{id:taskId,OR:[{organizationId:orgId},{opportunity:{account:{organizationId:orgId}}}]}});
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
 @Get(':orgId/dashboard')async dashboard(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.scope.membership(req,orgId);const [accounts,clients,opportunities,contracts,invoices]=await Promise.all([this.db.account.count({where:{organizationId:orgId}}),this.db.account.count({where:{organizationId:orgId,status:'Customer'}}),this.db.opportunity.count({where:{account:{organizationId:orgId}}}),this.db.contract.count({where:{opportunity:{account:{organizationId:orgId}}}}),this.db.invoice.findMany({where:{account:{organizationId:orgId}},select:{currency:true,total:true,status:true},take:1000})]);const invoicedByCurrency:Record<string,number>={};for(const inv of invoices){if(['DRAFT','VOID'].includes(inv.status))continue;invoicedByCurrency[inv.currency]=(invoicedByCurrency[inv.currency]||0)+Number(inv.total);}return {mode:this.scope.preview()?'DEMO_ONLY':'LIVE_WORKSPACE',organizationId:orgId,accounts,clients,opportunities,contracts,invoices:invoices.length,invoicedByCurrency};}
}
