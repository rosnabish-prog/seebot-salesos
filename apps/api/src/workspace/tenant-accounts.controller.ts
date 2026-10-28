import {OpportunityWorkflowService} from '../opportunities/workflow.service';
import {TenantScopeService} from './tenant-scope.service';
import {WorkspaceAccessService} from './workspace-access.service';
import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import type {AuthRequest} from '../common/auth.guard';

type ScopedRequest=AuthRequest & {selectedWorkspace?:string|null};
/** Separate tenant-safe prospect API. Never route another tenant through the legacy CRM controllers. */
@UseGuards(IdentityGuard) @Controller('workspace-crm')
export class TenantAccountsController {
 constructor(private db:PrismaService,private scope:TenantScopeService,private workflow:OpportunityWorkflowService){}
 private async authorize(req:ScopedRequest,orgId:string,write=false){return this.scope.membership(req,orgId,write);}
 private domain(website:string){let url:URL;try{url=new URL(website);}catch{throw new BadRequestException('Use a valid HTTPS company website.');}
  if(url.protocol!=='https:'||!url.hostname.includes('.')||url.username||url.password)throw new BadRequestException('Valid HTTPS website required.');return url.hostname.toLowerCase().replace(/^www\./,'');}
 @Get(':orgId/accounts')async list(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.authorize(req,orgId);return this.db.account.findMany({where:{organizationId:orgId},select:{id:true,name:true,domain:true,website:true,industry:true,status:true,priority:true,createdAt:true,opportunities:{select:{id:true,title:true,stage:true,status:true}}},orderBy:{createdAt:'desc'},take:100});}
 @Post(':orgId/accounts')async create(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:any){await this.authorize(req,orgId,true);
  const name=String(body?.name||'').trim(),website=String(body?.website||'').trim(),industry=String(body?.industry||'Other').trim();
  if(name.length<2||name.length>150||industry.length>100)throw new BadRequestException('Company name and industry are required.');
  const domain=this.domain(website);
  if(process.env.NODE_ENV!=='production'&&process.env.TENANT_SCOPED_CRM_PREVIEW==='true'&&!domain.endsWith('.example')&&!domain.endsWith('.invalid'))throw new BadRequestException('Tenant CRM preview accepts fictional .example/.invalid prospects only.');
  const assigned=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}}});
  if(!assigned||assigned.status!=='ACTIVE')throw new ForbiddenException('Membership expired.');
  const existing=await this.db.account.findFirst({where:{organizationId:orgId,domain}});
  if(existing)throw new BadRequestException('This workspace already has that company domain.');
  return this.db.$transaction(async tx=>{
   const account=await tx.account.create({data:{organizationId:orgId,name,domain,website,industry,hypothesis:String(body?.hypothesis||'').slice(0,2000),ownerId:req.user.id,isDemo:process.env.NODE_ENV!=='production'}});
   await tx.opportunity.create({data:{accountId:account.id,title:`${name} — Initial Engagement`,ownerId:req.user.id,serviceLine:industry,stageVisits:{create:{stage:'ACCOUNT_RESEARCHED'}}}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_ACCOUNT_CREATED',entityType:'ACCOUNT',entityId:account.id,detail:{organizationId:orgId}}});
   return {id:account.id,name:account.name,domain:account.domain};
  },{isolationLevel:'Serializable'});
 }
 @Get(':orgId/accounts/:accountId')async detail(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string){await this.authorize(req,orgId);
  const record=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId},include:{contacts:true,opportunities:{select:{id:true,title:true,stage:true,status:true}}}});
  if(!record)throw new BadRequestException('Account unavailable in this workspace.');return record;
 }
 @Patch(':orgId/accounts/:accountId')async update(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){await this.authorize(req,orgId,true);
  const account=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId}});if(!account)throw new BadRequestException('Account unavailable in this workspace.');
  const data:any={};
  if(Object.prototype.hasOwnProperty.call(body||{},'name')){const value=String(body.name||'').trim();if(value.length<2||value.length>150)throw new BadRequestException('Company name must be 2–150 characters.');data.name=value;}
  if(Object.prototype.hasOwnProperty.call(body||{},'industry')){const value=String(body.industry||'').trim();if(value.length<2||value.length>100)throw new BadRequestException('Industry must be 2–100 characters.');data.industry=value;}
  if(Object.prototype.hasOwnProperty.call(body||{},'hypothesis')){const value=String(body.hypothesis||'').trim();if(value.length>2000)throw new BadRequestException('Sales hypothesis is too long.');data.hypothesis=value;}
  if(Object.prototype.hasOwnProperty.call(body||{},'priority')){const value=String(body.priority||'').toUpperCase();if(!['LOW','MEDIUM','HIGH'].includes(value))throw new BadRequestException('Priority must be Low, Medium or High.');data.priority=value;}
  const updated=await this.db.account.update({where:{id:account.id},data});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_ACCOUNT_UPDATED',entityType:'ACCOUNT',entityId:account.id,detail:{organizationId:orgId,fields:Object.keys(data)}}});
  return updated;
 }
 @Patch(':orgId/accounts/:accountId/billing')async billingIdentity(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){
  await this.scope.membership(req,orgId,'finance');await this.scope.account(orgId,accountId);
  const billingAddress=String(body?.billingAddress||'').trim(),taxRegistrationNumber=String(body?.taxRegistrationNumber||'').trim();
  if(billingAddress.length<5||billingAddress.length>4000||taxRegistrationNumber.length>120)throw new BadRequestException('Client billing address and valid optional tax registration required.');
  return this.db.$transaction(async tx=>{
   const account=await tx.account.update({where:{id:accountId},data:{billingAddress,taxRegistrationNumber:taxRegistrationNumber||null}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_ACCOUNT_BILLING_UPDATED',entityType:'ACCOUNT',entityId:accountId,detail:{organizationId:orgId}}});return account;
  });
 }
 @Post(':orgId/accounts/:accountId/contacts')async contact(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){await this.authorize(req,orgId,true);
  const account=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId},select:{id:true}});if(!account)throw new BadRequestException('Account unavailable in this workspace.');
  const name=String(body?.name||'').trim(),title=String(body?.title||'').trim(),email=String(body?.email||'').trim().toLowerCase(),linkedinUrl=String(body?.linkedinUrl||'').trim();
  if(name.length<2||name.length>150||title.length<2||title.length>150||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new BadRequestException('Valid contact name, job title and email required.');
  if(linkedinUrl&&(!/^https:\/\//.test(linkedinUrl)||linkedinUrl.length>500))throw new BadRequestException('Use a valid HTTPS LinkedIn/profile URL.');
  const created=await this.db.contact.create({data:{accountId,name,title,email,linkedinUrl:linkedinUrl||null,source:'USER_ENTERED',verified:false}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTACT_CREATED',entityType:'CONTACT',entityId:created.id,detail:{organizationId:orgId,accountId}}});
  return created;
 }
 @Post(':orgId/accounts/:accountId/contacts/:contactId/verify')async verifyContact(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Param('contactId')contactId:string,@Body()body:any){
  await this.scope.membership(req,orgId,'sales');await this.scope.account(orgId,accountId);
  const contact=await this.db.contact.findFirst({where:{id:contactId,accountId}}),reference=String(body?.reference||'').trim();
  if(!contact||contact.optedOut||!contact.email&&!contact.linkedinUrl||reference.length<10||reference.length>1000)throw new BadRequestException('Contact channel and a verification source/reference of 10–1000 characters required.');
  const verified=await this.db.$transaction(async tx=>{
   const verified=await tx.contact.update({where:{id:contactId},data:{verified:true,verificationReference:reference,verifiedAt:new Date(),verifiedById:req.user.id}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTACT_VERIFIED',entityType:'CONTACT',entityId:contactId,detail:{organizationId:orgId,accountId,reference}}});return verified;
  });
  const opportunities=await this.db.opportunity.findMany({where:{accountId,status:'OPEN',stage:'DECISION_MAKER_IDENTIFIED'},select:{id:true}});
  for(const opportunity of opportunities)await this.workflow.tryAutoAdvance(opportunity.id,req.user.id);
  return verified;
 }
 @Patch(':orgId/accounts/:accountId/contacts/:contactId')async updateContact(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Param('contactId')contactId:string,@Body()body:any){await this.authorize(req,orgId,true);
  const account=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId},select:{id:true}});if(!account)throw new BadRequestException('Account unavailable in this workspace.');
  const contact=await this.db.contact.findFirst({where:{id:contactId,accountId}});if(!contact)throw new BadRequestException('Contact unavailable for this account.');
  const data:any={};
  if(Object.prototype.hasOwnProperty.call(body||{},'name')){const value=String(body.name||'').trim();if(value.length<2||value.length>150)throw new BadRequestException('Contact name must be 2–150 characters.');data.name=value;}
  if(Object.prototype.hasOwnProperty.call(body||{},'title')){const value=String(body.title||'').trim();if(value.length<2||value.length>150)throw new BadRequestException('Job title must be 2–150 characters.');data.title=value;}
  if(Object.prototype.hasOwnProperty.call(body||{},'email')){const value=String(body.email||'').trim().toLowerCase();if(value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new BadRequestException('Use a valid email address.');data.email=value||null;}
  if(Object.prototype.hasOwnProperty.call(body||{},'linkedinUrl')){const value=String(body.linkedinUrl||'').trim();if(value&&(!/^https:\/\//.test(value)||value.length>500))throw new BadRequestException('Use a valid HTTPS LinkedIn/profile URL.');data.linkedinUrl=value||null;}
  if(Object.prototype.hasOwnProperty.call(body||{},'optedOut'))data.optedOut=Boolean(body.optedOut);
  if(['name','title','email','linkedinUrl'].some(key=>Object.prototype.hasOwnProperty.call(data,key)))Object.assign(data,{verified:false,verificationReference:null,verifiedAt:null,verifiedById:null});
  const updated=await this.db.contact.update({where:{id:contact.id},data});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTACT_UPDATED',entityType:'CONTACT',entityId:contact.id,detail:{organizationId:orgId,accountId,optedOut:updated.optedOut}}});
  return updated;
 }
}
