import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import type {AuthRequest} from '../common/auth.guard';

type ScopedRequest=AuthRequest & {selectedWorkspace?:string|null};
/** Separate tenant-safe prospect API. Never route another tenant through the legacy CRM controllers. */
@UseGuards(IdentityGuard) @Controller('workspace-crm')
export class TenantAccountsController {
 constructor(private db:PrismaService){}
 private async authorize(req:ScopedRequest,orgId:string,write=false){
  const preview=process.env.NODE_ENV!=='production'&&process.env.TENANT_SCOPED_CRM_PREVIEW==='true';
  const live=process.env.NODE_ENV==='production'&&process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED==='true';
  if(!preview&&!live)throw new ForbiddenException('Tenant CRM is disabled for this deployment.');
  if(req.selectedWorkspace!==orgId)throw new ForbiddenException('Select this workspace first.');
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}},include:{organization:true}});
  if(member?.status!=='ACTIVE'||member.organization.status!=='ACTIVE'&&member.organization.status!=='SETUP')throw new ForbiddenException('Active company membership required.');
  if(write&&member.role==='VIEWER')throw new ForbiddenException('This company role cannot edit prospects.');
  return member;
 }
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
 @Post(':orgId/accounts/:accountId/contacts')async contact(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){await this.authorize(req,orgId,true);
  const account=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId},select:{id:true}});if(!account)throw new BadRequestException('Account unavailable in this workspace.');
  const name=String(body?.name||'').trim(),title=String(body?.title||'').trim(),email=String(body?.email||'').trim().toLowerCase();
  if(name.length<2||name.length>150||title.length<2||title.length>150||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new BadRequestException('Valid contact name, job title and email required.');
  return this.db.contact.create({data:{accountId,name,title,email,source:'USER_ENTERED',verified:false}});
 @Patch(':orgId/accounts/:accountId/contacts/:contactId')async updateContact(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Param('contactId')contactId:string,@Body()body:any){await this.authorize(req,orgId,true);
  const account=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId},select:{id:true}});if(!account)throw new BadRequestException('Account unavailable in this workspace.');
  const contact=await this.db.contact.findFirst({where:{id:contactId,accountId}});if(!contact)throw new BadRequestException('Contact unavailable for this account.');
  const data:any={};
  if(Object.prototype.hasOwnProperty.call(body||{},'name')){const value=String(body.name||'').trim();if(value.length<2||value.length>150)throw new BadRequestException('Contact name must be 2–150 characters.');data.name=value;}
  if(Object.prototype.hasOwnProperty.call(body||{},'title')){const value=String(body.title||'').trim();if(value.length<2||value.length>150)throw new BadRequestException('Job title must be 2–150 characters.');data.title=value;}
  if(Object.prototype.hasOwnProperty.call(body||{},'email')){const value=String(body.email||'').trim().toLowerCase();if(value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new BadRequestException('Use a valid email address.');data.email=value||null;}
  if(Object.prototype.hasOwnProperty.call(body||{},'linkedinUrl')){const value=String(body.linkedinUrl||'').trim();if(value&&(!/^https:\/\//.test(value)||value.length>500))throw new BadRequestException('Use a valid HTTPS LinkedIn/profile URL.');data.linkedinUrl=value||null;}
  if(Object.prototype.hasOwnProperty.call(body||{},'optedOut'))data.optedOut=Boolean(body.optedOut);
  const updated=await this.db.contact.update({where:{id:contact.id},data});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTACT_UPDATED',entityType:'CONTACT',entityId:contact.id,detail:{organizationId:orgId,accountId,optedOut:updated.optedOut}}});
  return updated;
 }
 }
}
