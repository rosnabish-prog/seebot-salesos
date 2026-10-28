import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import type {AuthRequest} from '../common/auth.guard';

/** Owners can recover their own suspended company without selecting its disabled CRM. */
@UseGuards(IdentityGuard)
@Controller('workspace-lifecycle')
export class WorkspaceLifecycleController{
 constructor(private db:PrismaService){}
 @Post(':workspaceId/status')async status(@Req()req:AuthRequest&{authAt?:number},@Param('workspaceId')id:string,@Body()body:{status?:string;confirmation?:string}){
  if(!req.authAt||Date.now()-req.authAt>5*60_000)throw new ForbiddenException('Sign in again before changing organization access.');
  if(!['SUSPENDED','ACTIVE'].includes(body?.status||''))throw new BadRequestException('Choose Suspend or Reactivate.');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${id} FOR UPDATE`;
   const membership=await tx.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId:req.user.id}},include:{organization:true}});
   if(membership?.status!=='ACTIVE'||membership.role!=='OWNER')throw new ForbiddenException('Only the active organization owner can change organization access.');
   const org=membership.organization;
   if(org.slug==='seebot')throw new ForbiddenException('The platform workspace is managed by an operator.');
   if(body.confirmation!==org.slug)throw new BadRequestException('Enter the organization identifier to confirm.');
   if(body.status==='SUSPENDED'){
    if(!['SETUP','ACTIVE'].includes(org.status))throw new BadRequestException('Only an active organization can be suspended.');
    await tx.organization.update({where:{id},data:{status:'SUSPENDED',suspendedFromStatus:org.status}});
    await tx.workspaceInvitation.updateMany({where:{organizationId:id,status:'PENDING'},data:{status:'REVOKED'}});
   }else{
    // An owner cannot bypass an operator suspension or an unknown lifecycle state.
    if(org.status!=='SUSPENDED'||!['SETUP','ACTIVE'].includes(org.suspendedFromStatus||''))throw new ForbiddenException('This suspension requires an operator to restore access.');
    await tx.organization.update({where:{id},data:{status:org.suspendedFromStatus!,suspendedFromStatus:null}});
   }
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'ORGANIZATION',entityId:id,action:body.status==='SUSPENDED'?'WORKSPACE_OWNER_SUSPENDED':'WORKSPACE_OWNER_REACTIVATED',detail:{organizationId:id}}});
   return {changed:true};
  });
 }
}
