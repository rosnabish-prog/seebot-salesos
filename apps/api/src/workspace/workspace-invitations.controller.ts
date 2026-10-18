import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Post,Req,Res,UnauthorizedException,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {createHash,randomBytes} from 'node:crypto';
import argon2 from 'argon2';
import {JwtService} from '@nestjs/jwt';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import type {AuthRequest} from '../common/auth.guard';
import {GoogleIdentityService} from '../integrations/google/google-identity.service';
import {OutgoingMessageService} from '../communications/outgoing-message.service';

type ScopedRequest=AuthRequest & {selectedWorkspace?:string|null};
type GoogleInvite={token?:string;googleCredential?:string};
const digest=(raw:string)=>createHash('sha256').update(raw).digest('hex');
const validRoles=['ADMIN','MEMBER','FINANCE'];
const cookieOptions=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,maxAge:8*60*60*1000,path:'/'});

/** A workspace invite is email-bound, single-use and never adds membership until accepted. */
@Controller('workspace-invitations')
export class WorkspaceInvitationsController{
 constructor(private db:PrismaService,private identity:GoogleIdentityService,private jwt:JwtService,private outbox:OutgoingMessageService){}
 private async admin(req:ScopedRequest,id:string){
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId:req.user.id}},include:{organization:{select:{status:true,name:true}}}});
  if(!member||member.status!=='ACTIVE'||!['ACTIVE','SETUP'].includes(member.organization.status)||!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('Active workspace administrator required.');
  if(req.selectedWorkspace!==id)throw new ForbiddenException('Select this workspace first.');
  return member;
 }
 @UseGuards(IdentityGuard) @Get(':organizationId')
 async list(@Req()req:ScopedRequest,@Param('organizationId')id:string){
  await this.admin(req,id);
  return this.db.workspaceInvitation.findMany({where:{organizationId:id},select:{id:true,email:true,name:true,role:true,status:true,expiresAt:true,createdAt:true},take:100,orderBy:{createdAt:'desc'}});
 }
 @UseGuards(IdentityGuard) @Post(':organizationId')
 async create(@Req()req:ScopedRequest,@Param('organizationId')id:string,@Body()body:any){
  const member=await this.admin(req,id);
  const email=String(body?.email||'').trim().toLowerCase(),name=String(body?.name||'').trim(),role=String(body?.role||'MEMBER');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||email.length>254||name.length<2||name.length>160||!validRoles.includes(role))throw new BadRequestException('Valid name, email and team role are required.');
  const already=await this.db.user.findUnique({where:{email},select:{id:true}});
  if(already){
   const membership=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId:already.id}}});
   if(membership?.status==='ACTIVE')throw new BadRequestException('This user already belongs to the workspace.');
  }
  const raw=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+7*86400000);
  const origin=(process.env.CORS_ORIGIN||'http://localhost:3000').replace(/\/$/,'');
  if(process.env.NODE_ENV==='production'&&!origin.startsWith('https://'))throw new BadRequestException('Secure HTTPS invitation origin must be configured.');
  const link=`${origin}/join-workspace?token=${encodeURIComponent(raw)}`;
  const invitation=await this.db.$transaction(async tx=>{
   const created=await tx.workspaceInvitation.create({data:{organizationId:id,email,name,role,tokenHash:digest(raw),status:'PENDING',createdById:req.user.id,expiresAt}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'WORKSPACE_INVITATION_CREATED',entityType:'WORKSPACE_INVITATION',entityId:created.id,detail:{organizationId:id,recipientEmail:email,role}}});
   return created;
  });
  let delivery='NOT_SENT';
  try{
   const message=await this.outbox.draft(req.user.id,{
    organizationId:id,recipientEmail:email,category:'WORKSPACE_INVITATION',entityType:'WORKSPACE_INVITATION',entityId:invitation.id,
    idempotencyKey:`workspace-invite:${invitation.id}`,
    subject:`Invitation to ${member.organization.name} on SalesOS`,
    bodyText:`Hello ${name},\n\nYou have been invited to join ${member.organization.name} on SalesOS. Use the one-time link below and sign in with ${email}. This invitation expires in seven days.\n\n${link}\n\nIgnore this email if you were not expecting it.`
   });
   delivery=(await this.outbox.send(message.id,req.user.id)).status;
  }catch{delivery='NOT_SENT';}
  return {id:invitation.id,recipientEmail:email,expiresAt,delivery,
   ...delivery==='SENT'?{}:{inviteUrl:link},
   notice:delivery==='SENT'?'Invitation sent through connected Gmail.':'Invitation not emailed. Copy the one-time private invitation link and share it securely.'};
 }
 private async pending(raw:unknown,email:string){
  if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{32,100}$/.test(raw))throw new UnauthorizedException('Invalid invitation.');
  const inv=await this.db.workspaceInvitation.findUnique({where:{tokenHash:digest(raw)},include:{organization:{select:{status:true}}}});
  if(!inv||inv.status!=='PENDING'||inv.expiresAt<=new Date()||inv.email!==email||!['SETUP','ACTIVE'].includes(inv.organization.status))throw new UnauthorizedException('Invitation expired, used or not addressed to this account.');
  return inv;
 }
 private async accept(raw:string,email:string,verified?:{subject:string;name:string}){
  const inv=await this.pending(raw,email);
  const user=await this.db.$transaction(async tx=>{
   const updated=await tx.workspaceInvitation.updateMany({where:{id:inv.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'ACCEPTED'}});
   if(updated.count!==1)throw new UnauthorizedException('Invitation has already been accepted.');
   let person=await tx.user.findUnique({where:{email}});
   if(person&&!person.active)throw new ForbiddenException('Account is inactive.');
   if(person&&verified&&person.googleSubject&&person.googleSubject!==verified.subject)throw new ForbiddenException('Google account does not match the linked identity.');
   if(!person){
    if(!verified)throw new UnauthorizedException('Please sign in first.');
    person=await tx.user.create({data:{email,name:inv.name,role:'SALES_REP',googleSubject:verified.subject,passwordHash:await argon2.hash(randomBytes(48).toString('base64url'))}});
   }else if(verified&&!person.googleSubject){
    const claimed=await tx.user.updateMany({where:{id:person.id,googleSubject:null},data:{googleSubject:verified.subject}});
    if(claimed.count!==1)throw new ForbiddenException('Google identity was changed during acceptance.');
   }
   const existing=await tx.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:inv.organizationId,userId:person.id}}});
   if(existing?.role==='OWNER')throw new ForbiddenException('Workspace owner membership cannot be changed by an invitation.');
   await tx.organizationMembership.upsert({where:{organizationId_userId:{organizationId:inv.organizationId,userId:person.id}},create:{organizationId:inv.organizationId,userId:person.id,role:inv.role,status:'ACTIVE'},update:{role:inv.role,status:'ACTIVE'}});
   await tx.auditEvent.create({data:{actorId:person.id,action:'WORKSPACE_INVITATION_ACCEPTED',entityType:'WORKSPACE_INVITATION',entityId:inv.id,detail:{organizationId:inv.organizationId,role:inv.role}}});
   return person;
  },{isolationLevel:'Serializable'});
  const token=await this.jwt.signAsync({sub:user.id,role:user.role,pv:user.passwordVersion,wid:inv.organizationId});
  return {token,organizationId:inv.organizationId,user:{id:user.id,email:user.email,name:user.name,role:user.role}};
 }
 @UseGuards(IdentityGuard) @Post('accept-existing')
 async acceptExisting(@Req()req:ScopedRequest,@Res({passthrough:true})res:Response,@Body()body:{token?:string}){
  const result=await this.accept(String(body?.token||''),req.user.email);
  res.cookie('salesos_session',result.token,cookieOptions());
  return {organizationId:result.organizationId,user:result.user};
 }
 @Post('accept-google')
 async acceptGoogle(@Body()body:GoogleInvite,@Res({passthrough:true})res:Response){
  // Verify Google identity before creating a new user; email matches exactly.
  const google=await this.identity.verify(body?.googleCredential||'',process.env.GOOGLE_LOGIN_CLIENT_ID||'');
  const result=await this.accept(String(body?.token||''),google.email,{subject:google.subject,name:google.name});
  res.cookie('salesos_session',result.token,cookieOptions());
  return {organizationId:result.organizationId,user:result.user};
 }
}
