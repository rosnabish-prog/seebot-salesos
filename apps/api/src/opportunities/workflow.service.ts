import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, Opportunity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STAGES, STAGE_INDEX, StageId } from '@seebot/shared';
import {defaultPipelineConfig,parsePipelineConfig,stageConfig,type PipelineConfig} from '../workspace/pipeline-config';
@Injectable()
export class OpportunityWorkflowService {
  constructor(private db:PrismaService) {}

  private async pipeline(tx:Prisma.TransactionClient|PrismaService,opp:Opportunity):Promise<PipelineConfig>{
    const account=await tx.account.findUnique({where:{id:opp.accountId},select:{organizationId:true}});
    if(!account?.organizationId)return defaultPipelineConfig();
    const settings=await tx.workspaceSettings.findUnique({where:{organizationId:account.organizationId},select:{pipelineConfig:true}});
    return parsePipelineConfig(settings?.pipelineConfig);
  }

  private async prefill(tx:Prisma.TransactionClient|PrismaService,opp:Opportunity,config:PipelineConfig,evidence:Record<string,unknown>){
    const stage=stageConfig(config,opp.stage);if(!stage)return {};
    const wanted=stage.fields.filter(field=>field.autoFill&&!String(evidence[field.key]??'').trim());
    if(!wanted.length)return {};
    const [account,contact,contract]=await Promise.all([
      tx.account.findUnique({where:{id:opp.accountId},select:{name:true,website:true,industry:true,country:true,hypothesis:true}}),
      tx.contact.findFirst({where:{accountId:opp.accountId,optedOut:false},orderBy:[{verified:'desc'},{createdAt:'asc'}],select:{name:true,email:true,title:true}}),
      tx.contract.findFirst({where:{opportunityId:opp.id},orderBy:{createdAt:'desc'},select:{title:true,status:true}})
    ]);
    const values:Record<string,unknown>={
      'account.name':account?.name,'account.website':account?.website,'account.industry':account?.industry,'account.country':account?.country,'account.hypothesis':account?.hypothesis,
      'opportunity.title':opp.title,'opportunity.serviceLine':opp.serviceLine,'opportunity.currency':opp.currency,
      'primaryContact.name':contact?.name,'primaryContact.email':contact?.email,'primaryContact.title':contact?.title,
      'latestContract.title':contract?.title,'latestContract.status':contract?.status
    };
    const out:Record<string,string>={};
    for(const field of wanted){const value=field.autoFill?values[field.autoFill]:undefined;if(value!==undefined&&value!==null&&String(value).trim())out[field.key]=String(value);}
    return out;
  }

  async requirements(tx:Prisma.TransactionClient,opp:Opportunity,visit:{evidence:unknown},stage=opp.stage):Promise<string[]> {
    const id=stage as StageId;
    if(!(id in STAGE_INDEX))return ['Invalid stage'];
    const config=await this.pipeline(tx,opp),configured=stageConfig(config,id);
    if(!configured)return ['Invalid stage'];
    const evidence=(visit.evidence && typeof visit.evidence==='object' && !Array.isArray(visit.evidence) ?visit.evidence:{}) as Record<string,unknown>;
    const missing=configured.fields.filter(f=>f.required && (typeof evidence[f.key]!=='string' || !(evidence[f.key] as string).trim())).map(f=>f.label);
    if(Object.values(evidence).some(v=>typeof v==='string' && /DEMO ONLY|DEMO_ONLY/i.test(v)))missing.push('Fictional demo data cannot be submitted as genuine stage evidence');
    if(id==='ACCOUNT_RESEARCHED' && typeof evidence.companySummary==='string' && evidence.companySummary.includes('Independent company research is still required.')) missing.push('Replace the demo CRM outline with verified research findings');
    if(id==='DECISION_MAKER_IDENTIFIED') {
      const contact=await tx.contact.findFirst({where:{accountId:opp.accountId,verified:true,optedOut:false,OR:[{email:{not:null}},{linkedinUrl:{not:null}}]}});
      if(!contact)missing.push('At least one verified buyer contact with a professional contact channel');
    }
    if(id==='OUTREACH_INITIATED') {
      const activity=await tx.activity.findFirst({where:{opportunityId:opp.id,outcome:'OUTBOUND',type:{in:['EMAIL','CALL','LINKEDIN']}}});
      if(!activity)missing.push('At least one logged outbound outreach activity');
    }
    if(id==='INTEREST_ESTABLISHED') {
      const response=await tx.activity.findFirst({where:{opportunityId:opp.id,outcome:'POSITIVE'}});
      if(!response)missing.push('A logged positive response');
    }
    if(id==='PILOT_PROPOSED') {
      const proposal=await tx.proposal.findFirst({where:{opportunityId:opp.id,status:{in:['SENT','ACCEPTED']}}});
      if(!proposal)missing.push('A sent pilot proposal with acceptance criteria and fee');
    }
    if(id==='PILOT_CONTRACTED') {
      const signed=await tx.contract.findFirst({where:{opportunityId:opp.id,type:'SOW',status:'SIGNED',signedAt:{not:null}}});
      if(!signed)missing.push('Executed pilot statement of work and signing evidence');
    }
    if(id==='PILOT_DELIVERED' && evidence.clientAcceptance!=='Accepted')missing.push('Client acceptance must be Accepted');
    if(id==='PRODUCTION_NEGOTIATED') {
      const contract=await tx.contract.findFirst({where:{opportunityId:opp.id,type:'PRODUCTION_OTHER',status:'SIGNED',signedAt:{not:null},evidenceReference:{not:null},committedAmount:{not:null}}});
      if(!contract)missing.push('Signed production contract with evidence and committed value');
    }
    return [...new Set(missing)];
  }

  async stageState(oppId:string) {
    const opportunity=await this.db.opportunity.findUnique({where:{id:oppId}});
    if(!opportunity)throw new BadRequestException('Opportunity not found');
    const visit=await this.db.stageVisit.findFirst({where:{opportunityId:oppId,exitedAt:null},orderBy:{enteredAt:'desc'}});
    if(!visit)throw new BadRequestException('Active stage visit missing');
    const config=await this.pipeline(this.db,opportunity);
    const missing=await this.requirements(this.db,opportunity,visit);
    const evidence=(visit.evidence&&typeof visit.evidence==='object'&&!Array.isArray(visit.evidence)?visit.evidence:{}) as Record<string,unknown>;
    const prefill=await this.prefill(this.db,opportunity,config,evidence);
    return {missing,ready:missing.length===0,evidence:visit.evidence,prefill,visitId:visit.id,stage:stageConfig(config,opportunity.stage)};
  }

  /** Stage updates and supporting evidence are saved atomically with an auto-transition where eligible. */
  async saveEvidence(oppId:string,actorId:string,patch:Record<string,unknown>) {
    return this.db.$transaction(async tx=> {
      const opp=await tx.opportunity.findUnique({where:{id:oppId}});
      if(!opp||opp.status!=='OPEN')throw new BadRequestException('Open opportunity not found.');
      const stage=opp.stage as StageId;
      const config=await this.pipeline(tx,opp),configured=stageConfig(config,stage);
      const allowed=new Set(configured?.fields.map(f=>f.key)||[]);
      for(const key of Object.keys(patch))if(!allowed.has(key))throw new BadRequestException(`Unrecognized field: ${key}`);
      const visit=await tx.stageVisit.findFirst({where:{opportunityId:oppId,exitedAt:null},orderBy:{enteredAt:'desc'}});
      if(!visit)throw new BadRequestException('Active stage visit missing.');
      const old=(visit.evidence && typeof visit.evidence==='object'&&!Array.isArray(visit.evidence)?visit.evidence:{}) as Record<string,unknown>;
      const evidence={...old,...patch};
      await tx.stageVisit.update({where:{id:visit.id},data:{evidence:evidence as Prisma.InputJsonObject}});
      await tx.auditEvent.create({data:{actorId,action:'STAGE_EVIDENCE_UPDATED',entityType:'OPPORTUNITY',entityId:oppId,detail:{stage,keys:Object.keys(patch)}}});
      const missing=await this.requirements(tx,opp,{evidence},stage);
      if(!missing.length&&stage!=='CLOSED_WON') {
        const updated=await this.advance(tx,opp,visit.id,actorId,true);
        return {advanced:true,stage:updated.stage,missing:[]};
      }
      return {advanced:false,stage,missing};
    },{isolationLevel:'Serializable'});
  }

  private async advance(tx:Prisma.TransactionClient,opp:Opportunity,visitId:string,actorId:string,automated:boolean,reason?:string,target?:StageId) {
    const index=STAGE_INDEX[opp.stage as StageId];
    const stage=target||STAGES[index+1]?.id;
    if(!stage)throw new BadRequestException('This opportunity is already at the last stage.');
    const updated=await tx.opportunity.updateMany({where:{id:opp.id,version:opp.version,stage:opp.stage,status:'OPEN'},data:{stage,version:{increment:1},...(stage==='CLOSED_WON'?{status:'CLOSED_WON',closedAt:new Date()}: {})}});
    if(updated.count!==1)throw new ConflictException('Opportunity changed. Refresh and retry.');
    await tx.stageVisit.update({where:{id:visitId},data:{exitedAt:new Date()}});
    await tx.stageVisit.create({data:{opportunityId:opp.id,stage}});
    await tx.task.updateMany({where:{opportunityId:opp.id,status:'OPEN',title:{startsWith:'Stage:'}},data:{status:'DONE',completedAt:new Date()}});
    if(stage!=='CLOSED_WON') {
      const config=await this.pipeline(tx,opp);
      const stageName=stageConfig(config,stage)?.label||STAGES.find(s=>s.id===stage)?.label||stage;
      await tx.task.create({data:{organizationId:(await tx.account.findUnique({where:{id:opp.accountId},select:{organizationId:true}}))?.organizationId,opportunityId:opp.id,assigneeId:opp.ownerId,title:`Stage: Complete ${stageName}`,description:'Complete required evidence and activities to advance this opportunity.'}});
    }
    await tx.stageTransition.create({data:{opportunityId:opp.id,fromStage:opp.stage,toStage:stage,actorId,reason,automated}});
    if(stage==='CLOSED_WON') {
      const contract=await tx.contract.findFirst({where:{opportunityId:opp.id,type:'PRODUCTION_OTHER',status:'SIGNED'},orderBy:{signedAt:'desc'}});
      if(contract?.committedAmount)await tx.opportunity.update({where:{id:opp.id},data:{contractedAmount:contract.committedAmount,currency:contract.currency||opp.currency}});
      await tx.account.update({where:{id:opp.accountId},data:{status:'Customer',clientSince:new Date()}});
    }
    await tx.auditEvent.create({data:{actorId,action:automated?'STAGE_AUTO_ADVANCED':'STAGE_MANUALLY_MOVED',entityType:'OPPORTUNITY',entityId:opp.id,detail:{from:opp.stage,to:stage,reason:reason||''}}});
    return {stage};
  }

  async tryAutoAdvance(oppId:string,actorId:string) {
    return this.db.$transaction(async tx=> {
      const opp=await tx.opportunity.findUnique({where:{id:oppId}});
      if(!opp||opp.status!=='OPEN'||opp.stage==='CLOSED_WON')return {advanced:false};
      const visit=await tx.stageVisit.findFirst({where:{opportunityId:oppId,exitedAt:null},orderBy:{enteredAt:'desc'}});
      if(!visit)return {advanced:false};
      const missing=await this.requirements(tx,opp,visit);
      if(missing.length)return {advanced:false,missing};
      const out=await this.advance(tx,opp,visit.id,actorId,true);
      return {advanced:true,...out};
    },{isolationLevel:'Serializable'});
  }

  async manualTransition(oppId:string,actorId:string,body:{targetStage:string;reason?:string;override?:boolean},canOverride:boolean) {
    return this.db.$transaction(async tx=>{
      const opp=await tx.opportunity.findUnique({where:{id:oppId}});
      if(!opp||opp.status!=='OPEN')throw new BadRequestException('Open opportunity not found.');
      if(!(body.targetStage in STAGE_INDEX)||body.targetStage===opp.stage)throw new BadRequestException('Invalid destination stage.');
      const visit=await tx.stageVisit.findFirst({where:{opportunityId:oppId,exitedAt:null}});
      if(!visit)throw new BadRequestException('Active stage missing.');
      const from=STAGE_INDEX[opp.stage as StageId],to=STAGE_INDEX[body.targetStage as StageId];
      const missing=await this.requirements(tx,opp,visit);
      const requiresOverride= to!==from+1 || missing.length>0;
      if(requiresOverride && (!canOverride||!body.override||!body.reason?.trim()))throw new BadRequestException({message:'Manager override and reason required',missing});
      // A Closed Won stage always requires signed production evidence; no manager bypass.
      if(body.targetStage==='CLOSED_WON') {
        const contract=await tx.contract.findFirst({where:{opportunityId:oppId,type:'PRODUCTION_OTHER',status:'SIGNED',evidenceReference:{not:null},committedAmount:{not:null}}});
        if(!contract)throw new BadRequestException('A signed production contract is mandatory to close won.');
      }
      return this.advance(tx,opp,visit.id,actorId,false,body.reason,body.targetStage as StageId);
    },{isolationLevel:'Serializable'});
  }
}
