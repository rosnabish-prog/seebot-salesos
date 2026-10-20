import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, Opportunity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STAGES, STAGE_INDEX, STAGE_FIELDS, StageId } from '@seebot/shared';
import {configuredFields,safePipelineConfig,PipelineConfig} from './pipeline-config';
@Injectable()
export class OpportunityWorkflowService {
  constructor(private db:PrismaService) {}

  private async pipelineConfig(tx:Prisma.TransactionClient,accountId:string):Promise<PipelineConfig>{
    const account=await tx.account.findUnique({where:{id:accountId},select:{organizationId:true}});
    if(!account?.organizationId)return {extraFields:{},mappings:{}};
    const row=await tx.workspaceSettings.findUnique({where:{organizationId:account.organizationId},select:{pipelineConfig:true}});
    return safePipelineConfig(row?.pipelineConfig);
  }
  private async fieldDefs(tx:Prisma.TransactionClient,opp:Opportunity,stage:StageId){
    return configuredFields(await this.pipelineConfig(tx,opp.accountId),stage);
  }
  /** Copy data only from the same account or earlier visits in the SAME opportunity.
      No missing business approvals can be fabricated from prefilled text. */
  private async prefill(tx:Prisma.TransactionClient,opp:Opportunity,stage:StageId){
    const config=await this.pipelineConfig(tx,opp.accountId);
    const mappings=config.mappings[stage]||{};
    const account=await tx.account.findUnique({where:{id:opp.accountId},select:{name:true,domain:true,industry:true,hypothesis:true}});
    const recent=await tx.stageVisit.findMany({where:{opportunityId:opp.id},orderBy:{enteredAt:'desc'},select:{evidence:true}});
    const sources:Record<string,string>={
      'account.name':account?.name||'','account.domain':account?.domain||'',
      'account.industry':account?.industry||'','account.hypothesis':account?.hypothesis||'',
      'opportunity.title':opp.title,'opportunity.serviceLine':opp.serviceLine,
    };
    const prefill:Record<string,string>={};
    for(const [target,source] of Object.entries(mappings)){
      let value=sources[source]||'';
      if(source.startsWith('evidence.')){
        const key=source.slice('evidence.'.length);
        for(const visit of recent){
          const data=visit.evidence;
          if(data&&typeof data==='object'&&!Array.isArray(data)){
            const found=(data as Record<string,unknown>)[key];
            if(typeof found==='string'&&found.trim()){value=found;break;}
          }
        }
      }
      if(value.trim()&&!/DEMO ONLY|DEMO_ONLY/i.test(value))prefill[target]=value.slice(0,5000);
    }
    return prefill;
  }

  async requirements(tx:Prisma.TransactionClient,opp:Opportunity,visit:{evidence:unknown},stage=opp.stage):Promise<string[]> {
    const id=stage as StageId;
    if(!(id in STAGE_FIELDS))return ['Invalid stage'];
    const evidence=(visit.evidence && typeof visit.evidence==='object' && !Array.isArray(visit.evidence) ?visit.evidence:{}) as Record<string,unknown>;
    const missing=(await this.fieldDefs(tx,opp,id)).filter(f=>f.required && (typeof evidence[f.key]!=='string' || !(evidence[f.key] as string).trim())).map(f=>f.label);
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
    const missing=await this.requirements(this.db,opportunity,visit);
    return {missing,ready:missing.length===0,evidence:visit.evidence,visitId:visit.id,fields:await this.fieldDefs(this.db,opportunity,opportunity.stage as StageId)};
  }

  /** Stage updates and supporting evidence are saved atomically with an auto-transition where eligible. */
  async saveEvidence(oppId:string,actorId:string,patch:Record<string,unknown>) {
    return this.db.$transaction(async tx=> {
      const opp=await tx.opportunity.findUnique({where:{id:oppId}});
      if(!opp||opp.status!=='OPEN')throw new BadRequestException('Open opportunity not found.');
      const stage=opp.stage as StageId;
      const allowed=new Set((await this.fieldDefs(tx,opp,stage)).map(f=>f.key));
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
    const initialEvidence=stage==='CLOSED_WON'?{}:await this.prefill(tx,opp,stage);
    await tx.stageVisit.create({data:{opportunityId:opp.id,stage,evidence:initialEvidence}});
    await tx.task.updateMany({where:{opportunityId:opp.id,status:'OPEN',title:{startsWith:'Stage:'}},data:{status:'DONE',completedAt:new Date()}});
    if(stage!=='CLOSED_WON') {
      const stageName=STAGES.find(s=>s.id===stage)?.label||stage;
      await tx.task.create({data:{opportunityId:opp.id,assigneeId:opp.ownerId,title:`Stage: Complete ${stageName}`,description:'Complete required evidence and activities to advance this opportunity.'}});
    }
    await tx.stageTransition.create({data:{opportunityId:opp.id,fromStage:opp.stage,toStage:stage,actorId,reason,automated}});
    // The same account becomes visible in Client Management once a pilot contract is in progress.
    // No second company or duplicate contacts are ever created.
    if(stage==='PILOT_CONTRACTED'){
      await tx.account.updateMany({where:{id:opp.accountId,status:{not:'Customer'}},data:{status:'Contracting'}});
    }
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
