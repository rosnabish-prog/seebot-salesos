import {BadRequestException,Body,Controller,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {OpportunityWorkflowService} from './workflow.service';

@UseGuards(IdentityGuard) @Controller('workspace-business')
export class TenantSalesController{
 constructor(private db:PrismaService,private scope:TenantScopeService,private workflow:OpportunityWorkflowService){}
 private async editable(req:ScopedRequest,orgId:string,id:string){
  await this.scope.membership(req,orgId,'sales');
  const opportunity=await this.scope.opportunity(orgId,id);
  if(opportunity.status!=='OPEN')throw new BadRequestException('Only open opportunities can be changed.');
  return opportunity;
 }
 @Get(':orgId/opportunities/:id/sales-records')async records(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.scope.membership(req,orgId);await this.scope.opportunity(orgId,id);
  const [activities,proposals]=await Promise.all([
   this.db.activity.findMany({where:{opportunityId:id},orderBy:{occurredAt:'desc'},take:100}),
   this.db.proposal.findMany({where:{opportunityId:id},orderBy:{createdAt:'desc'},take:100})
  ]);return {activities,proposals};
 }
 @Post(':orgId/opportunities/:id/activities')async activity(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.editable(req,orgId,id);
  const note=String(body?.note||'').trim();
  if(!['EMAIL','CALL','MEETING','LINKEDIN','NOTE','OTHER'].includes(body?.type)||!['OUTBOUND','POSITIVE','NEUTRAL','NEGATIVE','NO_RESPONSE','OPTED_OUT','BOUNCED'].includes(body?.outcome)||note.length<3||note.length>5000)throw new BadRequestException('Valid activity, outcome and evidence notes are required.');
  const created=await this.db.$transaction(async tx=>{
   const activity=await tx.activity.create({data:{opportunityId:id,actorId:req.user.id,type:body.type,outcome:body.outcome,note}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_ACTIVITY_RECORDED',entityType:'OPPORTUNITY',entityId:id,detail:{organizationId:orgId,activityId:activity.id}}});return activity;
  });
  await this.workflow.tryAutoAdvance(id,req.user.id);return created;
 }
 @Post(':orgId/opportunities/:id/proposals')async proposal(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.editable(req,orgId,id);
  const title=String(body?.title||'').trim(),criteria=String(body?.acceptanceCriteria||'').trim(),amount=String(body?.amount??'');
  if(title.length<3||title.length>200||criteria.length<10||criteria.length>5000||!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)||!['DRAFT','SENT','ACCEPTED','DECLINED'].includes(body?.status)||!/^[A-Z]{3}$/.test(body?.currency||''))throw new BadRequestException('Proposal title, fee, currency, status and acceptance criteria are required.');
  const proposal=await this.db.$transaction(async tx=>{
   const created=await tx.proposal.create({data:{opportunityId:id,title,acceptanceCriteria:criteria,amount,currency:body.currency,status:body.status}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_PROPOSAL_RECORDED',entityType:'OPPORTUNITY',entityId:id,detail:{organizationId:orgId,proposalId:created.id,status:created.status}}});return created;
  });await this.workflow.tryAutoAdvance(id,req.user.id);return proposal;
 }
 @Patch(':orgId/opportunities/:id/estimate')async estimate(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.editable(req,orgId,id);
  const amount=body?.estimatedAmount===null?null:String(body?.estimatedAmount??'');
  if(amount!==null&&!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount)||!/^[A-Z]{3}$/.test(body?.currency||''))throw new BadRequestException('Nonnegative estimate and ISO currency required.');
  return this.db.opportunity.update({where:{id},data:{estimatedAmount:amount,currency:body.currency}});
 }
 @Post(':orgId/opportunities/:id/close')async close(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.editable(req,orgId,id);const reason=String(body?.reason||'').trim();
  if(!['CLOSED_LOST','NURTURE','UNQUALIFIED'].includes(body?.status)||reason.length<3||reason.length>2000)throw new BadRequestException('Closure status and reason required.');
  return this.db.$transaction(async tx=>{
   const updated=await tx.opportunity.update({where:{id},data:{status:body.status,closedReason:reason,closedAt:body.status==='NURTURE'?null:new Date(),version:{increment:1}}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_OPPORTUNITY_CLOSED',entityType:'OPPORTUNITY',entityId:id,detail:{organizationId:orgId,status:body.status,reason}}});return updated;
  });
 }
}
