import {BadRequestException,Body,Controller,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard} from '../workspace/identity.guard';
import {WorkspaceAccessService} from '../workspace/workspace-access.service';
import type {ScopedRequest} from '../workspace/tenant-scope.service';
import {PrismaService} from '../prisma/prisma.service';

@UseGuards(IdentityGuard) @Controller('workspace-operations')
export class OperationsController{
 constructor(private db:PrismaService,private access:WorkspaceAccessService){}
 @Get(':orgId')async status(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.access.require(req,orgId,'admin');
  const [settings,jobs,failed]=await Promise.all([
   this.db.workspaceAutomation.findUnique({where:{organizationId:orgId},select:{billingDrafts:true,reminderTasks:true,enabledById:true,updatedAt:true}}),
   this.db.backgroundJob.findMany({where:{organizationId:orgId},select:{id:true,kind:true,status:true,attempts:true,lastError:true,result:true,availableAt:true,createdAt:true,finishedAt:true},orderBy:{createdAt:'desc'},take:50}),
   this.db.backgroundJob.count({where:{organizationId:orgId,status:'FAILED'}})
  ]);
  return {settings:settings||{billingDrafts:false,reminderTasks:false},jobs,failed,notice:'Hourly preparation requires a running worker. Invoice issue, approval and email sending remain explicit actions.'};
 }
 @Patch(':orgId')async configure(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:{billingDrafts?:boolean;reminderTasks?:boolean}){
  await this.access.require(req,orgId,'admin');
  if(typeof body?.billingDrafts!=='boolean'||typeof body?.reminderTasks!=='boolean')throw new BadRequestException('Both automation choices are required.');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${orgId} FOR UPDATE`;
   const member=await tx.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}},include:{organization:true}});
   if(member?.status!=='ACTIVE'||!['OWNER','ADMIN'].includes(member.role)||!['SETUP','ACTIVE'].includes(member.organization.status))throw new BadRequestException('Active administrator membership required.');
   const data={billingDrafts:body.billingDrafts,reminderTasks:body.reminderTasks,enabledById:req.user.id};
   const setting=await tx.workspaceAutomation.upsert({where:{organizationId:orgId},create:{organizationId:orgId,...data},update:data});
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'ORGANIZATION',entityId:orgId,action:'WORKSPACE_AUTOMATION_CONFIGURED',detail:{organizationId:orgId,...data}}});return setting;
  });
 }
 @Post(':orgId/jobs/:jobId/retry')async retry(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('jobId')id:string){
  await this.access.require(req,orgId,'admin');
  const changed=await this.db.backgroundJob.updateMany({where:{id,organizationId:orgId,status:'FAILED'},data:{status:'PENDING',attempts:0,availableAt:new Date(),finishedAt:null,lastError:null}});
  if(changed.count!==1)throw new BadRequestException('Failed job unavailable.');
  await this.db.auditEvent.create({data:{actorId:req.user.id,entityType:'ORGANIZATION',entityId:orgId,action:'WORKSPACE_JOB_RETRIED',detail:{organizationId:orgId,jobId:id}}});return {queued:true};
 }
}
