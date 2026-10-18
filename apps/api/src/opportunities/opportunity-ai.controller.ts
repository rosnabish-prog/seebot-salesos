import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { STAGES, STAGE_FIELDS, StageId } from '@seebot/shared';
import { AuthGuard, AuthRequest, ensureOwner, ensureCanEdit } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DemoOpportunityAssistant } from './opportunity-ai.demo';

const validFields=(stage:StageId,raw:unknown):Record<string,string>=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Fields object required.');
  const allowed = new Set(STAGE_FIELDS[stage].map(f=>f.key));
  const result:Record<string,string>={};
  for(const [key,value] of Object.entries(raw)){
    if(!allowed.has(key)||typeof value!=='string'||value.length>5000)throw new BadRequestException(`Invalid draft field: ${key}`);
    result[key]=value;
  }
  return result;
};

@UseGuards(AuthGuard)
@Controller('opportunities')
export class OpportunityAIController {
  constructor(private db:PrismaService,private demo:DemoOpportunityAssistant){}
  private async opportunity(req:AuthRequest,id:string,edit=false){
    const opp=await this.db.opportunity.findUnique({where:{id},include:{account:{include:{contacts:true}}}});
    if(!opp)throw new NotFoundException('Opportunity not found.');
    edit?ensureCanEdit(req.user,opp.ownerId):ensureOwner(req.user,opp.ownerId);
    return opp;
  }
  private async openOpportunity(req:AuthRequest,id:string){
    const opp=await this.opportunity(req,id,true);
    if(opp.status!=='OPEN')throw new BadRequestException('Only open opportunities can be edited.');
    if(!(opp.stage in STAGE_FIELDS))throw new BadRequestException('Invalid opportunity stage.');
    return opp;
  }
  @Get(':id/assistant')
  async getState(@Req()req:AuthRequest,@Param('id')id:string){
    const opp=await this.opportunity(req,id);
    const [draft,plans]=await Promise.all([
      this.db.opportunityStageDraft.findUnique({where:{opportunityId_stage:{opportunityId:id,stage:opp.stage}}}),
      this.db.intelligenceRun.findMany({where:{accountId:opp.accountId,kind:'OPPORTUNITY_PLAN',payload:{path:['opportunityId'],equals:id}},orderBy:{createdAt:'desc'},take:4})
    ]);
    return {draft,plans,mode:'DEMO'};
  }
  @Patch(':id/assistant/draft')
  async saveDraft(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{stage:string;fields:Record<string,string>;notes?:string}){
    const opp=await this.openOpportunity(req,id);
    if(body?.stage!==opp.stage)throw new BadRequestException('Stage changed; reload and review before saving.');
    const fields=validFields(opp.stage as StageId,body.fields);
    if(typeof body.notes!=='string' && body.notes!==undefined || (body.notes||'').length>6000)throw new BadRequestException('Notes exceed 6000 characters.');
    const draft=await this.db.opportunityStageDraft.upsert({where:{opportunityId_stage:{opportunityId:id,stage:opp.stage}},create:{opportunityId:id,stage:opp.stage,createdById:req.user.id,fields,notes:body.notes||''},update:{fields,notes:body.notes||'',version:{increment:1}}});
    await this.db.auditEvent.create({data:{actorId:req.user.id,action:'OPPORTUNITY_DRAFT_SAVED',entityType:'OPPORTUNITY',entityId:id,detail:{stage:opp.stage,keys:Object.keys(fields)}}});
    // A draft is never stage evidence, and never triggers opportunity progression.
    return draft;
  }
  @Post(':id/assistant/generate')
  async generate(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{fieldKey?:string;context?:string;fictionalScenario?:boolean}){
    const opp=await this.openOpportunity(req,id);
    if((body?.context||'').length>4000)throw new BadRequestException('Context exceeds 4000 characters.');
    const stage=opp.stage as StageId;
    if(body?.fieldKey&&!STAGE_FIELDS[stage].some(f=>f.key===body.fieldKey))throw new BadRequestException('Unknown field.');
    const prior=await this.db.opportunityStageDraft.findUnique({where:{opportunityId_stage:{opportunityId:id,stage}}});
    const suggestions=body?.fictionalScenario?this.demo.fictionalScenario(stage,body?.fieldKey):this.demo.suggest(opp,stage,body?.context||prior?.notes||'',body?.fieldKey);
    const draft=await this.db.opportunityStageDraft.upsert({where:{opportunityId_stage:{opportunityId:id,stage}},create:{opportunityId:id,stage,createdById:req.user.id,fields:prior?.fields as Prisma.InputJsonObject||{},notes:body?.context||'',suggestions:suggestions as unknown as Prisma.InputJsonArray},update:{suggestions:suggestions as unknown as Prisma.InputJsonArray,notes:body?.context??prior?.notes??'',version:{increment:1}}});
    return {suggestions,version:draft.version,mode:'DEMO',warning:'Mock suggestions based only on saved CRM data. Not independent research, verified client evidence, or a completed sales activity.'};
  }
  @Post(':id/assistant/revise')
  async revise(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{stage:string;fields:Record<string,string>;instruction:string;fieldKey?:string;notes?:string}){
    const opp=await this.openOpportunity(req,id);
    const stage=opp.stage as StageId;
    if(body?.stage!==stage)throw new BadRequestException('Stage changed; reload first.');
    if(typeof body.instruction!=='string'||!body.instruction.trim()||body.instruction.length>2000)throw new BadRequestException('Revision instruction required (max 2000 characters).');
    if(body.fieldKey&&!STAGE_FIELDS[stage].some(f=>f.key===body.fieldKey))throw new BadRequestException('Unknown field.');
    if(body.notes!==undefined&&(typeof body.notes!=='string'||body.notes.length>6000))throw new BadRequestException('Invalid notes.');
    const fields=validFields(stage,body.fields);
    const edited=this.demo.reviseFields(fields,body.instruction,body.fieldKey);
    const previous=await this.db.opportunityStageDraft.findUnique({where:{opportunityId_stage:{opportunityId:id,stage}}});
    const feedback=Array.isArray(previous?.feedback)?previous.feedback:[];
    const nextFeedback=[...feedback.slice(-19),{by:req.user.id,at:new Date().toISOString(),instruction:body.instruction,fieldKey:body.fieldKey||null}];
    const d=await this.db.opportunityStageDraft.upsert({where:{opportunityId_stage:{opportunityId:id,stage}},create:{opportunityId:id,stage,createdById:req.user.id,fields,notes:body.notes?.slice(0,6000)||'',feedback:nextFeedback as Prisma.InputJsonArray},update:{fields,notes:body.notes??previous?.notes??'',feedback:nextFeedback as Prisma.InputJsonArray,version:{increment:1}}});
    return {suggestedFields:edited.fields,changed:edited.changed,warning:edited.warning,version:d.version,mode:'DEMO'};
  }
  @Post(':id/assistant/plan')
  async generatePlan(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{context?:string}){
    const opp=await this.openOpportunity(req,id);
    if((body?.context||'').length>4000)throw new BadRequestException('Notes exceed 4000 characters.');
    const payload=this.demo.plan(opp,body?.context||'');
    const result=await this.db.intelligenceRun.create({data:{accountId:opp.accountId,createdById:req.user.id,kind:'OPPORTUNITY_PLAN',mode:'DEMO',payload:payload as unknown as Prisma.InputJsonObject}});
    return result;
  }
}
