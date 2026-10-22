import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActivityOutcome, ActivityType, ContractStatus, ContractType, ProposalStatus, Prisma, TaskStatus } from '@prisma/client';
import { AuthGuard, AuthRequest,allowManageAll,ensureCanEdit,ensureOwner,requireManager } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunityWorkflowService } from './workflow.service';
@UseGuards(AuthGuard) @Controller('opportunities')
export class OpportunitiesController {
  constructor(private db:PrismaService, private flow:OpportunityWorkflowService) {}
  private async authorized(req:AuthRequest,id:string,edit=false) {
    const opp=await this.db.opportunity.findFirst({where:{id,account:{organizationId:req.user.organizationId}}});
    if(!opp)throw new BadRequestException('Opportunity not found.');
    if(edit)ensureCanEdit(req.user,opp.ownerId);else ensureOwner(req.user,opp.ownerId);
    return opp;
  }
  @Get() async list(@Req() req:AuthRequest,@Query('stage')stage?:string,@Query('q')q?:string) {
    return this.db.opportunity.findMany({where:{account:{organizationId:req.user.organizationId},...(allowManageAll(req.user)?{}:{ownerId:req.user.id}),...(stage?{stage}:{}),...(q?{OR:[{title:{contains:q,mode:'insensitive'}},{account:{name:{contains:q,mode:'insensitive'}}}]}:{})},include:{account:true,owner:{select:{id:true,name:true}},tasks:{where:{status:'OPEN'},select:{id:true,dueAt:true}},stageVisits:{where:{exitedAt:null},select:{stage:true,evidence:true}}},orderBy:{updatedAt:'desc'},take:250});
  }
  @Post() async create(@Req()req:AuthRequest,@Body()body:{accountId:string;title:string;serviceLine:string;ownerId?:string}) {
    if(['CEO','DIRECTOR','TECHNICAL_REVIEWER'].includes(req.user.role))throw new ForbiddenException('Read-only role.');
    const account=await this.db.account.findUnique({where:{id:body.accountId}});
    if(!account||account.organizationId!==req.user.organizationId)throw new BadRequestException('Account not found.');ensureOwner(req.user,account.ownerId);
    if(!body.title?.trim()||!body.serviceLine?.trim())throw new BadRequestException('Title and service line required.');
    return this.db.opportunity.create({data:{accountId:account.id,title:body.title.trim(),serviceLine:body.serviceLine,ownerId:allowManageAll(req.user)&&body.ownerId?body.ownerId:req.user.id,stageVisits:{create:{stage:'ACCOUNT_RESEARCHED'}}}});
  }
  @Get(':id') async get(@Req()req:AuthRequest,@Param('id')id:string) {
    await this.authorized(req,id);
    const opp=await this.db.opportunity.findUnique({where:{id},include:{account:{include:{contacts:{orderBy:{createdAt:'desc'}}}},owner:{select:{id:true,name:true,email:true}},stageVisits:{orderBy:{enteredAt:'desc'},include:{comments:{orderBy:{createdAt:'asc'},include:{author:{select:{id:true,name:true}}}}}},transitions:{orderBy:{createdAt:'desc'}},activities:{orderBy:{occurredAt:'desc'},include:{actor:{select:{name:true}}}},tasks:{orderBy:{createdAt:'desc'},include:{assignee:{select:{name:true}}}},proposals:{orderBy:{createdAt:'desc'}},contracts:{orderBy:{createdAt:'desc'}}}});
    const stageState=await this.flow.stageState(id);
    return {...opp,stageState};
  }
  @Patch(':id/estimate') async estimate(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{estimatedAmount:number|null;currency:string}){
    const opp=await this.authorized(req,id,true);
    if(opp.status!=='OPEN')throw new BadRequestException('Only open opportunity estimates may be changed.');
    const amount=body.estimatedAmount===null?null:Number(body.estimatedAmount);
    if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>1e10))throw new BadRequestException('Enter a valid nonnegative estimate.');
    if(!/^[A-Z]{3}$/.test(body.currency||''))throw new BadRequestException('Enter a valid currency code.');
    return this.db.$transaction(async tx=>{
      const updated=await tx.opportunity.update({where:{id},data:{estimatedAmount:amount,currency:body.currency}});
      await tx.auditEvent.create({data:{actorId:req.user.id,action:'OPPORTUNITY_ESTIMATE_UPDATED',entityType:'OPPORTUNITY',entityId:id,detail:{amount,currency:body.currency}}});return updated;
    });
  }
  @Patch(':id/evidence') async evidence(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{fields:Record<string,unknown>}) {
    await this.authorized(req,id,true);
    if(!body.fields||typeof body.fields!=='object'||Array.isArray(body.fields))throw new BadRequestException('fields object required.');
    for(const val of Object.values(body.fields))if(typeof val!=='string'||val.length>5000)throw new BadRequestException('Fields must be text under 5000 characters.');
    return this.flow.saveEvidence(id,req.user.id,body.fields);
  }
  @Post(':id/comments') async comment(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{body:string}) {
    await this.authorized(req,id,true);
    if(!body.body?.trim()||body.body.length>10000)throw new BadRequestException('Comment required (max 10,000 characters).');
    const visit=await this.db.stageVisit.findFirst({where:{opportunityId:id,exitedAt:null}});
    if(!visit)throw new BadRequestException('Active stage not found.');
    const c=await this.db.stageComment.create({data:{visitId:visit.id,authorId:req.user.id,body:body.body.trim()},include:{author:{select:{name:true,id:true}}}});
    await this.db.auditEvent.create({data:{actorId:req.user.id,action:'COMMENT_POSTED',entityType:'OPPORTUNITY',entityId:id,detail:{commentId:c.id,stage:visit.stage}}});
    return c;
  }
  @Post(':id/transition') async transition(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{targetStage:string;reason?:string;override?:boolean}) {
    await this.authorized(req,id,true);
    return this.flow.manualTransition(id,req.user.id,body,['SUPER_ADMIN','SALES_MANAGER'].includes(req.user.role));
  }
  @Post(':id/close') async close(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{status:string;reason:string}) {
    const existing=await this.authorized(req,id,true);
    if(existing.status!=='OPEN')throw new BadRequestException('Only open opportunities can be closed or nurtured.');
    if(!['CLOSED_LOST','NURTURE','UNQUALIFIED'].includes(body.status)||!body.reason?.trim())throw new BadRequestException('Valid closure status and reason are required.');
    return this.db.$transaction(async tx=>{
      const opp=await tx.opportunity.update({where:{id},data:{status:body.status as any,closedReason:body.reason.trim(),closedAt:body.status==='NURTURE'?null:new Date(),version:{increment:1}}});
      await tx.auditEvent.create({data:{actorId:req.user.id,action:'OPPORTUNITY_STATUS_CHANGED',entityType:'OPPORTUNITY',entityId:id,detail:{status:body.status,reason:body.reason}}});
      return opp;
    });
  }
  @Post(':id/reopen') async reopen(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{reason:string}) {
    requireManager(req.user);await this.authorized(req,id,true);
    if(!body.reason?.trim())throw new BadRequestException('Reason required.');
    return this.db.$transaction(async tx=>{
      const opp=await tx.opportunity.update({where:{id},data:{status:'OPEN',closedAt:null,closedReason:null,version:{increment:1}}});
      await tx.auditEvent.create({data:{actorId:req.user.id,action:'OPPORTUNITY_REOPENED',entityType:'OPPORTUNITY',entityId:id,detail:{reason:body.reason}}});return opp;
    });
  }
  @Post(':id/activities') async addActivity(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{type:ActivityType;outcome:ActivityOutcome;note:string}) {
    await this.authorized(req,id,true);
    if(!['EMAIL','CALL','MEETING','LINKEDIN','NOTE','OTHER'].includes(body.type)||!['OUTBOUND','POSITIVE','NEUTRAL','NEGATIVE','NO_RESPONSE','OPTED_OUT','BOUNCED'].includes(body.outcome)||!body.note?.trim())throw new BadRequestException('Valid activity type, outcome, and notes required.');
    const activity=await this.db.activity.create({data:{opportunityId:id,actorId:req.user.id,type:body.type,outcome:body.outcome,note:body.note.trim()}});
    await this.flow.tryAutoAdvance(id,req.user.id);return activity;
  }
  @Post(':id/proposals') async proposal(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{title:string;amount:number;currency:string;acceptanceCriteria:string;status:ProposalStatus}) {
    await this.authorized(req,id,true);
    if(!body.title?.trim()||!body.acceptanceCriteria?.trim()||typeof body.amount!=='number'||!Number.isFinite(body.amount)||body.amount<0||!['DRAFT','SENT','ACCEPTED','DECLINED'].includes(body.status)||!/^[A-Z]{3}$/.test(body.currency))throw new BadRequestException('Valid title, fee, ISO currency, criteria and status required.');
    const proposal=await this.db.proposal.create({data:{opportunityId:id,title:body.title,amount:body.amount,currency:body.currency,status:body.status,acceptanceCriteria:body.acceptanceCriteria}});
    await this.flow.tryAutoAdvance(id,req.user.id);return proposal;
  }
  @Post(':id/contracts') async contract(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{title:string;type:ContractType;status:ContractStatus;evidenceReference?:string;committedAmount?:number;currency?:string;signatureDueAt?:string;expiresAt?:string;parentContractId?:string}) {
    await this.authorized(req,id,true);
    if(!body.title?.trim()||!['NDA','MSA','SOW','DPA','PRODUCTION_OTHER'].includes(body.type)||!['DRAFT','SIGNED','PENDING_SIGNATURE','EXPIRED','TERMINATED'].includes(body.status))throw new BadRequestException('Valid contract details required.');
    if(body.status==='SIGNED')throw new BadRequestException('Create a draft, upload the executed PDF, verify it, then confirm the signing in Client Management.');
    if((body.signatureDueAt&&!Number.isFinite(new Date(body.signatureDueAt).getTime()))||(body.expiresAt&&!Number.isFinite(new Date(body.expiresAt).getTime())))throw new BadRequestException('Invalid contract dates.');

    if(body.parentContractId){
      if(body.type!=='SOW')throw new BadRequestException('Only SOW agreements may reference an MSA.');
      const master=await this.db.contract.findFirst({where:{id:body.parentContractId,type:'MSA',opportunity:{accountId:(await this.db.opportunity.findUnique({where:{id}}))?.accountId}}});
      if(!master)throw new BadRequestException('Parent MSA must belong to the same client account.');
    }
    const opp=await this.db.opportunity.findUnique({where:{id},include:{account:{select:{isDemo:true}}}});
    const contract=await this.db.contract.create({data:{opportunityId:id,title:body.title,type:body.type,status:body.status,isDemo:Boolean(opp?.account.isDemo),evidenceReference:body.evidenceReference||null,committedAmount:body.committedAmount,currency:body.currency,signedAt:null,signatureDueAt:body.signatureDueAt?new Date(body.signatureDueAt):null,expiresAt:body.expiresAt?new Date(body.expiresAt):null,parentContractId:body.parentContractId||null}});
    await this.flow.tryAutoAdvance(id,req.user.id);return contract;
  }
}
