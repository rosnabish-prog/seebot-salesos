import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Post,Patch,Req,Res,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {JwtService} from '@nestjs/jwt';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthRequest} from '../common/auth.guard';
import {IdentityGuard} from './identity.guard';
import {generateCompanySlug} from './workspace-policy';
import {randomBytes} from 'node:crypto';
import {providerReadiness} from '../integrations/status/provider-status';
import {assertWebsiteEmailMatch} from './company-email';
import {setWorkspaceCookie} from '../auth/session';
@UseGuards(IdentityGuard) @Controller('workspaces')
export class WorkspacesController{
 constructor(private db:PrismaService,private jwt:JwtService){}
 @Get('selected')async selected(@Req()req:AuthRequest & {selectedWorkspace?:string|null}){
  const id=req.selectedWorkspace;
  if(!id)return {selected:null,legacyAllowed:false};
  const membership=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId:req.user.id}},include:{organization:true}});
  if(!membership||membership.status!=='ACTIVE'||!['ACTIVE','SETUP'].includes(membership.organization.status))return {selected:null,legacyAllowed:false};
  return {selected:id,slug:membership.organization.slug,legacyAllowed:membership.organization.slug==='seebot'};
 }
 @Get()async list(@Req()req:AuthRequest){const members=await this.db.organizationMembership.findMany({where:{userId:req.user.id,status:'ACTIVE',organization:{status:{in:['ACTIVE','SETUP']}}},include:{organization:true},orderBy:{createdAt:'asc'}});return members.map(m=>({id:m.organizationId,slug:m.organization.slug,name:m.organization.name,logoUrl:m.organization.logoUrl,status:m.organization.status,role:m.role,isCreator:m.organization.createdById===req.user.id,crmEnabled:m.organization.slug==='seebot',tenantCrmEnabled:((process.env.NODE_ENV!=='production'&&process.env.TENANT_SCOPED_CRM_PREVIEW==='true')||(process.env.NODE_ENV==='production'&&process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED==='true'))}));}
 @Post()async create(@Req()req:AuthRequest,@Body()body:any){
  const name=String(body?.name||'').trim(),website=String(body?.website||'').trim();
  if(name.length<2||name.length>160||website.length>300)throw new BadRequestException('Company name must be between 2 and 160 characters.');
  const industry=String(body?.industry||'').trim(),country=String(body?.country||'GB').trim().toUpperCase(),
   currency=String(body?.defaultCurrency||'USD').trim().toUpperCase(),timezone=String(body?.timezone||'UTC').trim();
  if(industry.length>100||!/^[A-Z]{2}$/.test(country)||!/^[A-Z]{3}$/.test(currency)||timezone.length>100)
   throw new BadRequestException('Select a valid industry, country, currency and time zone.');
  const slug=generateCompanySlug(name,randomBytes(5).toString('hex'));
  return this.db.$transaction(async tx=>{
   // The row lock serializes two concurrent requests from the same creator.
   await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${req.user.id} FOR UPDATE`;
   const user=await tx.user.findUnique({where:{id:req.user.id},select:{email:true,active:true}});
   if(!user?.active)throw new ForbiddenException('An active, verified account is required.');
   assertWebsiteEmailMatch(user.email,website);
   const existing=await tx.organizationMembership.findFirst({where:{userId:req.user.id,status:'ACTIVE',organization:{status:{in:['ACTIVE','SETUP']}}},select:{organizationId:true}});
   const priorCreator=await tx.organization.findFirst({where:{createdById:req.user.id},select:{id:true}});
   if(existing||priorCreator)throw new ForbiddenException('You already belong to a company workspace. Creating another workspace is not available.');
   const org=await tx.organization.create({data:{
    slug,name,website:website||null,createdById:req.user.id,industry:industry||null,country,
    timezone,defaultCurrency:currency,status:'SETUP',
    memberships:{create:{userId:req.user.id,role:'ADMIN'}},
    workspaceSettings:{create:{plan:'ALL_FEATURES_UNLOCKED',setupComplete:false}}
   }});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'WORKSPACE_CREATED',entityType:'ORGANIZATION',entityId:org.id,detail:{domain:user.email.split('@')[1],creatorRole:'ADMIN'}}});
   return {id:org.id,name:org.name,slug:org.slug,status:org.status,role:'ADMIN',isCreator:true,crmEnabled:false,
    tenantCrmEnabled:((process.env.NODE_ENV!=='production'&&process.env.TENANT_SCOPED_CRM_PREVIEW==='true')||(process.env.NODE_ENV==='production'&&process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED==='true')),
    notice:'Company workspace created. You are its administrator. Invite your teammates to continue.'};
  },{isolationLevel:'Serializable'});
 }
 private async authorized(req:AuthRequest,id:string,admin=false){
   const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId:req.user.id}},include:{organization:true}});
   if(!member||member.status!=='ACTIVE')throw new ForbiddenException('Workspace membership required.');
   if(admin&&!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('Workspace administrator required.');
   return member;
 }
 @Get(':id/integration-status') async integrations(@Req()req:AuthRequest,@Param('id')id:string){await this.authorized(req,id);return providerReadiness(process.env);}
  @Get(':id/profile') async profile(@Req()req:AuthRequest,@Param('id')id:string){const m=await this.authorized(req,id);const settings=await this.db.workspaceSettings.findUnique({where:{organizationId:id}});return {organization:m.organization,settings,role:m.role,crmEnabled:m.organization.slug==='seebot',tenantCrmEnabled:((process.env.NODE_ENV!=='production'&&process.env.TENANT_SCOPED_CRM_PREVIEW==='true')||(process.env.NODE_ENV==='production'&&process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED==='true'))};}
 @Patch(':id/profile') async update(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:any){
   const member=await this.authorized(req,id,true);
   const updates:any={};for(const key of ['name','legalName','website','industry','description','idealCustomers','country','timezone','defaultCurrency','logoUrl','billingAddress','taxRegistrationNumber']){
     if(Object.prototype.hasOwnProperty.call(body||{},key)){if(typeof body[key]!=='string')throw new BadRequestException(key+' must be text.');updates[key]=body[key].trim().slice(0,['description','idealCustomers','billingAddress'].includes(key)?4000:250);}
   }
   if(updates.website&&!/^https:\/\/[^\s]+$/.test(updates.website))throw new BadRequestException('HTTPS website required.');
   if(updates.logoUrl&&!/^https:\/\/[^\s]+$/.test(updates.logoUrl))throw new BadRequestException('HTTPS logo URL required.');
   if(updates.defaultCurrency&&!/^[A-Z]{3}$/.test(updates.defaultCurrency))throw new BadRequestException('Three-letter currency required.');
   if(body?.services!==undefined){if(!Array.isArray(body.services)||body.services.length>40||body.services.some((s:any)=>typeof s!=='string'||s.length>120))throw new BadRequestException('Provide up to 40 service names.');updates.services=body.services;}
   const saved=await this.db.organization.update({where:{id},data:updates});
   const targets=body?.targetIndustries;
   if(targets!==undefined && (!Array.isArray(targets)||targets.length>40||targets.some((x:any)=>typeof x!=='string'||x.length>120)))throw new BadRequestException('Target industries must be up to 40 names.');
   await this.db.workspaceSettings.upsert({where:{organizationId:id},create:{organizationId:id,plan:'ALL_FEATURES_UNLOCKED',setupComplete:true,targetIndustries:targets||[]},update:{setupComplete:true,...(targets?{targetIndustries:targets}:{})}});
   return {organization:saved,plan:'ALL_FEATURES_UNLOCKED',crmEnabled:member.organization.slug==='seebot'};
 }
 @Get(':id/members') async members(@Req()req:AuthRequest,@Param('id')id:string){await this.authorized(req,id,true);return this.db.organizationMembership.findMany({where:{organizationId:id},include:{user:{select:{id:true,name:true,email:true,active:true}}},orderBy:{createdAt:'asc'}});}
 @Post(':id/members/existing') async addExisting(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:any){await this.authorized(req,id,true);
  const address=String(body?.email||'').trim().toLowerCase(),role=String(body?.role||'MEMBER');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)||!['ADMIN','MEMBER','FINANCE'].includes(role))throw new BadRequestException('Valid email and role required.');
  const user=await this.db.user.findUnique({where:{email:address}});
  if(!user?.active)throw new BadRequestException('This user must already have a verified platform account. Unverified email invites are not enabled without an email provider.');
  const member=await this.db.organizationMembership.upsert({where:{organizationId_userId:{organizationId:id,userId:user.id}},create:{organizationId:id,userId:user.id,role},update:{status:'ACTIVE',role}});
  return {membership:member,notice:'Existing user granted membership. This is not an email invitation.'};
 }
 @Patch(':id/members/:userId') async updateMember(@Req()req:AuthRequest,@Param('id')id:string,@Param('userId')userId:string,@Body()body:any){await this.authorized(req,id,true);
  const target=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId}}});if(!target)throw new BadRequestException('Membership not found.');
  if(target.role==='OWNER')throw new ForbiddenException('Cannot change a workspace owner here.');
  if(!['ACTIVE','DISABLED'].includes(body?.status)||!['MEMBER','ADMIN','FINANCE'].includes(body?.role))throw new BadRequestException('Invalid membership status or role.');
  return this.db.organizationMembership.update({where:{organizationId_userId:{organizationId:id,userId}},data:{role:body.role,status:body.status}});
 }
 @Post(':id/select')async select(@Req()req:AuthRequest,@Res({passthrough:true})res:Response,@Param('id')id:string){
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId:req.user.id}},include:{organization:true}});
  if(!member||member.status!=='ACTIVE'||!['ACTIVE','SETUP'].includes(member.organization.status))throw new ForbiddenException('You are not an active member of this workspace.');
  const user=await this.db.user.findUnique({where:{id:req.user.id}});if(!user)throw new ForbiddenException('User unavailable.');
  // Workspace selection must never extend the seven-day authentication lifetime.
  const token=await this.jwt.signAsync({kind:'workspace',sub:user.id,wid:id});
  setWorkspaceCookie(res,token);
  return {selected:id,slug:member.organization.slug,crmEnabled:member.organization.slug==='seebot',tenantCrmEnabled:((process.env.NODE_ENV!=='production'&&process.env.TENANT_SCOPED_CRM_PREVIEW==='true')||(process.env.NODE_ENV==='production'&&process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED==='true')),notice:member.organization.slug==='seebot'?'Seebot SalesOS activated.':'Organization setup selected. CRM remains locked until tenant isolation is certified.'};
 }
}
