import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import type {AuthRequest} from '../common/auth.guard';

type ScopedRequest=AuthRequest & {selectedWorkspace?:string|null};
/** Separate tenant-safe prospect API. Never route another tenant through the legacy CRM controllers. */
@UseGuards(IdentityGuard) @Controller('workspace-crm')
export class TenantAccountsController {
 constructor(private db:PrismaService){}
 private async authorize(req:ScopedRequest,orgId:string,write=false){
  if(process.env.NODE_ENV==='production'||process.env.TENANT_SCOPED_CRM_PREVIEW!=='true')throw new ForbiddenException('Tenant CRM remains in isolated fictional-data preview until all legacy CRUD and reporting paths pass cross-tenant penetration tests.');
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
  if(!domain.endsWith('.example')&&!domain.endsWith('.invalid'))throw new BadRequestException('Tenant CRM preview accepts fictional .example/.invalid prospects only.');
  const assigned=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}}});
  if(!assigned||assigned.status!=='ACTIVE')throw new ForbiddenException('Membership expired.');
  const existing=await this.db.account.findFirst({where:{organizationId:orgId,domain}});
  if(existing)throw new BadRequestException('This workspace already has that company domain.');
  return this.db.$transaction(async tx=>{
   const account=await tx.account.create({data:{organizationId:orgId,name,domain,website,industry,hypothesis:String(body?.hypothesis||'').slice(0,2000),ownerId:req.user.id}});
   await tx.opportunity.create({data:{accountId:account.id,title:`${name} — Initial Engagement`,ownerId:req.user.id,serviceLine:industry,stageVisits:{create:{stage:'ACCOUNT_RESEARCHED'}}}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_ACCOUNT_CREATED',entityType:'ACCOUNT',entityId:account.id,detail:{organizationId:orgId}}});
   return {id:account.id,name:account.name,domain:account.domain};
  },{isolationLevel:'Serializable'});
 }
 @Get(':orgId/accounts/:accountId')async detail(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string){await this.authorize(req,orgId);
  const record=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId},include:{contacts:true,opportunities:{select:{id:true,title:true,stage:true,status:true}}}});
  if(!record)throw new BadRequestException('Account unavailable in this workspace.');return record;
 }
 @Post(':orgId/accounts/:accountId/contacts')async contact(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:any){await this.authorize(req,orgId,true);
  const account=await this.db.account.findFirst({where:{id:accountId,organizationId:orgId},select:{id:true}});if(!account)throw new BadRequestException('Account unavailable in this workspace.');
  const name=String(body?.name||'').trim(),title=String(body?.title||'').trim(),email=String(body?.email||'').trim().toLowerCase();
  if(name.length<2||name.length>150||title.length<2||title.length>150||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new BadRequestException('Valid contact name, job title and email required.');
  return this.db.contact.create({data:{accountId,name,title,email,source:'USER_ENTERED',verified:false}});
 }
}
