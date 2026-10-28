import {BadRequestException,Controller,Get,Param,Query,Req,Res,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {PrismaService} from '../prisma/prisma.service';
import {WorkspaceAccessService} from './workspace-access.service';
import {IdentityGuard} from './identity.guard';
import type {ScopedRequest} from './tenant-scope.service';
import {AuthRateLimitService} from '../auth/auth-rate-limit.service';

export const EXPORT_RESOURCES=['accounts','contacts','opportunities','activities','proposals','contracts','invoices','payments','tasks','campaigns','milestones','memberships','audit'] as const;
/** Explicit projections exclude identity credentials, OAuth secrets, invitation/signing tokens and storage keys. */
@UseGuards(IdentityGuard)
@Controller('workspace-exports')
export class WorkspaceExportController{
 constructor(private db:PrismaService,private access:WorkspaceAccessService,private limits:AuthRateLimitService){}
 @Get(':orgId')async manifest(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Res({passthrough:true})res:Response){
  await this.access.require(req,orgId,'admin');res.setHeader('Cache-Control','private, no-store');
  return {format:'salesos-business-export-v1',resources:EXPORT_RESOURCES,pageSize:100,notice:'Paginated business records. Document binaries and provider/security credentials are excluded. This is not a database backup.'};
 }
 @Get(':orgId/:resource')async page(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('resource')resource:string,@Query('after')after:string|undefined,@Query('limit')rawLimit:string|undefined,@Res({passthrough:true})res:Response){
  await this.access.require(req,orgId,'admin');
  if(!(EXPORT_RESOURCES as readonly string[]).includes(resource))throw new BadRequestException('Unknown export resource.');
  const limit=rawLimit===undefined?100:Number(rawLimit);
  if(!Number.isInteger(limit)||limit<1||limit>100||after&&(!/^[a-zA-Z0-9_-]{1,150}$/.test(after)))throw new BadRequestException('Invalid export page.');
  await this.limits.consume('workspace-export',orgId+':'+req.user.id,120,60_000);
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const account={organizationId:orgId},opportunity={account},contract={opportunity},invoice={account};
  const configs:Record<string,{model:string;where:object;select:object;key?:string}>={
   accounts:{model:'account',where:account,select:{id:true,name:true,domain:true,website:true,industry:true,status:true,priority:true,hypothesis:true,country:true,billingAddress:true,taxRegistrationNumber:true,ownerId:true,createdAt:true,updatedAt:true}},
   contacts:{model:'contact',where:{account},select:{id:true,accountId:true,name:true,title:true,email:true,linkedinUrl:true,source:true,verified:true,verificationReference:true,verifiedAt:true,optedOut:true,createdAt:true}},
   opportunities:{model:'opportunity',where:opportunity,select:{id:true,accountId:true,title:true,stage:true,status:true,ownerId:true,serviceLine:true,nextAction:true,nextActionAt:true,estimatedAmount:true,contractedAmount:true,currency:true,closedAt:true,closedReason:true,createdAt:true,updatedAt:true}},
   activities:{model:'activity',where:{opportunity},select:{id:true,opportunityId:true,actorId:true,type:true,outcome:true,note:true,occurredAt:true}},
   proposals:{model:'proposal',where:{opportunity},select:{id:true,opportunityId:true,title:true,amount:true,currency:true,acceptanceCriteria:true,status:true,createdAt:true}},
   contracts:{model:'contract',where:contract,select:{id:true,opportunityId:true,title:true,type:true,status:true,evidenceReference:true,signedAt:true,expiresAt:true,committedAmount:true,currency:true,createdAt:true}},
   invoices:{model:'invoice',where:invoice,select:{id:true,accountId:true,opportunityId:true,contractId:true,number:true,status:true,currency:true,lineItems:true,subtotal:true,tax:true,total:true,billingEmail:true,notes:true,dueAt:true,issuedAt:true,sentAt:true,createdAt:true,updatedAt:true}},
   payments:{model:'paymentRecord',where:{invoice},select:{id:true,invoiceId:true,amount:true,paidAt:true,reference:true,recordedById:true,createdAt:true}},
   tasks:{model:'task',where:{organizationId:orgId},select:{id:true,title:true,description:true,status:true,dueAt:true,opportunityId:true,assigneeId:true,createdAt:true,completedAt:true}},
   campaigns:{model:'campaign',where:{organizationId:orgId},select:{id:true,name:true,sector:true,status:true,objective:true,ownerId:true,createdAt:true}},
   milestones:{model:'deliveryMilestone',where:{account},select:{id:true,accountId:true,contractId:true,title:true,description:true,acceptanceCriteria:true,status:true,dueAt:true,actualAcceptedAt:true,createdAt:true}},
   memberships:{model:'organizationMembership',where:{organizationId:orgId},key:'userId',select:{userId:true,role:true,status:true,createdAt:true,user:{select:{name:true,email:true}}}},
   audit:{model:'auditEvent',where:{OR:[{entityType:'ORGANIZATION',entityId:orgId},{detail:{path:['organizationId'],equals:orgId}}]},select:{id:true,actorId:true,action:true,entityType:true,entityId:true,createdAt:true}}
  };
  const config=configs[resource],key=config.key||'id';
  // A keyset predicate, not a unique cursor lookup: foreign/deleted cursors cannot alter tenant scope.
  const rows=await (this.db as any)[config.model].findMany({where:{AND:[config.where,...(after?[{[key]:{gt:after}}]:[])]},select:config.select,orderBy:{[key]:'asc'},take:limit+1});
  const data=rows.slice(0,limit),next=rows.length>limit?data.at(-1)[key]:null;
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'WORKSPACE_EXPORT_PAGE',entityType:'ORGANIZATION',entityId:orgId,detail:{organizationId:orgId,resource,count:data.length}}});
  return {format:'salesos-business-export-v1',organizationId:orgId,resource,generatedAt:new Date().toISOString(),data,next};
 }
}
