import {companyDomain} from '../workspace/company-email';
import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { createHash,randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, AuthRequest } from '../common/auth.guard';
import { GoogleIdentityService } from '../integrations/google/google-identity.service';
import { OutgoingMessageService } from '../communications/outgoing-message.service';
import {MfaService} from '../auth/mfa.service';

const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const roles=['CEO','DIRECTOR','SALES_MANAGER','SALES_REP','TECHNICAL_REVIEWER'] as const;

@Controller('employee-invitations')
export class EmployeeInvitationController {
  constructor(private db:PrismaService,private identity:GoogleIdentityService,private mfa:MfaService,private outbox:OutgoingMessageService){}
  @UseGuards(AuthGuard) @Post()
  async invite(@Req()req:AuthRequest,@Body()body:{email:string;name:string;role:string}){
    if(req.user.role!=='SUPER_ADMIN')throw new ForbiddenException('Only the workspace owner can invite employees.');
    const email=body?.email?.trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')||email.length>254||typeof body?.name!=='string'||body.name.trim().length<2||body.name.length>160||!roles.includes(body.role as any))throw new BadRequestException('Valid name, email and staff role required.');
    companyDomain(email);
    const org=await this.db.organization.findUnique({where:{slug:'seebot'}});
    if(!org)throw new BadRequestException('Seebot organization has not been initialized.');
    if(await this.db.user.findUnique({where:{email}}))throw new BadRequestException('An employee already uses this email.');
    const token=randomBytes(32).toString('base64url');
    const inv=await this.db.employeeInvitation.create({data:{organizationId:org.id,createdById:req.user.id,invitedEmail:email,invitedName:body.name.trim(),role:body.role as any,tokenHash:hash(token),expiresAt:new Date(Date.now()+7*86400000)}});
    const origin=(process.env.CORS_ORIGIN||'http://localhost:3000').replace(/\/$/,'');
    const msg=await this.outbox.draft(req.user.id,{organizationId:org.id,recipientEmail:email,subject:'Invitation to your Seebot SalesOS workspace',bodyText:`Hello ${inv.invitedName},\n\nYou have been invited to Seebot SalesOS. Use the private link below and your verified Google account ${email} to accept. This invitation expires in 7 days.\n\n${origin}/accept-invite?token=${encodeURIComponent(token)}\n\nIf unexpected, ignore this invitation.`,category:'EMPLOYEE_INVITATION',entityType:'EMPLOYEE_INVITATION',entityId:inv.id,idempotencyKey:`employee-invite:${inv.id}`});
    let delivery='NOT_SENT';try{const sent=await this.outbox.send(msg.id,req.user.id);delivery=sent.status;await this.db.employeeInvitation.update({where:{id:inv.id},data:{deliveredAt:new Date()}});}catch{delivery='FAILED';}
    return {id:inv.id,recipientEmail:email,expiresAt:inv.expiresAt,delivery,deliveryMessageId:msg.id,notice:delivery==='SENT'?'Invitation delivered through Gmail.':'Invitation created but NOT delivered; configure Gmail and retry the outgoing message. Do not assume the employee received it.'};
  }
  @UseGuards(AuthGuard) @Get() async list(@Req()req:AuthRequest){
    if(req.user.role!=='SUPER_ADMIN')throw new ForbiddenException('Workspace owner required.');
    const org=await this.db.organization.findUnique({where:{slug:'seebot'}});
    return this.db.employeeInvitation.findMany({where:{organizationId:org?.id||'not-found'},select:{id:true,invitedEmail:true,invitedName:true,role:true,status:true,createdAt:true,expiresAt:true,deliveredAt:true,redeemedAt:true},orderBy:{createdAt:'desc'},take:100});
  }
  @Post('accept') async accept(@Body()body:{invitationToken:string;googleCredential:string}){
    if(!/^[\w-]{32,100}$/.test(body?.invitationToken||''))throw new UnauthorizedException('Invitation invalid.');
    const identity=await this.identity.verify(body.googleCredential,process.env.GOOGLE_LOGIN_CLIENT_ID||'');
    companyDomain(identity.email);
    const invitation=await this.db.employeeInvitation.findUnique({where:{tokenHash:hash(body.invitationToken)},include:{organization:true}});
    if(!invitation||invitation.status!=='PENDING'||invitation.expiresAt<new Date()||identity.email!==invitation.invitedEmail||invitation.organization.slug!=='seebot')throw new UnauthorizedException('Invitation expired or not addressed to this Google account.');
    // Public customer-workspace registration remains disabled until tenant isolation is audited.
    if(await this.db.user.findUnique({where:{email:identity.email}}))throw new BadRequestException('This email already has a SalesOS account. Sign in instead.');
    const result=await this.db.$transaction(async tx=>{
      const consumed=await tx.employeeInvitation.updateMany({where:{id:invitation.id,status:'PENDING',expiresAt:{gt:new Date()}},data:{status:'ACCEPTED',redeemedAt:new Date()}});
      if(consumed.count!==1)throw new UnauthorizedException('Invitation already used.');
      const user=await tx.user.create({data:{email:identity.email,name:invitation.invitedName,role:invitation.role,passwordHash:await argon2.hash(randomBytes(32).toString('hex')),googleSubject:identity.subject}});
      await tx.organizationMembership.create({data:{organizationId:invitation.organizationId,userId:user.id,role:'MEMBER',status:'ACTIVE'}});
      await tx.auditEvent.create({data:{actorId:user.id,action:'EMPLOYEE_INVITATION_ACCEPTED',entityType:'USER',entityId:user.id,detail:{organizationId:invitation.organizationId,method:'GOOGLE'}}});
      return user;
    },{isolationLevel:'Serializable'});
    // Invitation + Google account are not a complete SalesOS sign-in.
    // Finish the same mandatory one-time MFA as every other employee.
    return this.mfa.begin({id:result.id,email:result.email});
  }
}
