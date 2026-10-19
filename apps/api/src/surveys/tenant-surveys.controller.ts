import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {createHash,randomBytes} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {OutgoingMessageService} from '../communications/outgoing-message.service';
import {standardQuestionnaire,validateQuestionnaire,type SurveyQuestion} from './questionnaire';

const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const validEmail=(s:unknown)=>typeof s==='string'&&s.length<=254&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const contractingStages=['PILOT_CONTRACTED','PILOT_DELIVERED','PRODUCTION_NEGOTIATED','CLOSED_WON'];

@UseGuards(IdentityGuard)
@Controller('workspace-surveys')
export class TenantSurveysController{
 constructor(private db:PrismaService,private scope:TenantScopeService,private mail:OutgoingMessageService){}
 private async admin(req:ScopedRequest,orgId:string){
  const member=await this.scope.membership(req,orgId,true);
  if(!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('Workspace administrator required.');
  return member;
 }
 private async clientAccount(req:ScopedRequest,orgId:string,accountId:string,write=false){
  await this.scope.membership(req,orgId,write);
  const account=await this.scope.account(orgId,accountId);
  const eligible=account.status==='Customer'||await this.db.opportunity.count({where:{accountId,stage:{in:contractingStages}}});
  if(!eligible)throw new BadRequestException('Satisfaction surveys are available once the relationship reaches contracting or customer status.');
  return account;
 }

 @Get(':orgId/templates') async templates(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);
  const custom=await this.db.clientSurveyTemplate.findMany({where:{organizationId:orgId},select:{id:true,name:true,description:true,type:true,questions:true,active:true,createdAt:true},orderBy:{createdAt:'desc'}});
  return {
   builtIns:[
    {id:'builtin-nps',name:'Net Promoter Score',description:'0–10 recommendation rating with optional written feedback.',type:'NPS',active:true,questions:standardQuestionnaire('NPS','How likely are you to recommend our services to a colleague?')},
    {id:'builtin-csat',name:'Customer Satisfaction',description:'0–5 satisfaction rating with optional written feedback.',type:'CSAT',active:true,questions:standardQuestionnaire('CSAT','How satisfied are you with the recent service?')}
   ],
   custom
  };
 }

 @Post(':orgId/templates') async createTemplate(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:{name?:string;description?:string;questions?:unknown}){
  await this.admin(req,orgId);
  const name=String(body?.name||'').trim(),description=String(body?.description||'').trim();
  if(name.length<2||name.length>120||description.length>1000)throw new BadRequestException('Template name must be 2–120 characters and description under 1000 characters.');
  let questions:SurveyQuestion[];
  try{questions=validateQuestionnaire(body?.questions);}catch(e){throw new BadRequestException((e as Error).message);}
  try{return await this.db.clientSurveyTemplate.create({data:{organizationId:orgId,name,description:description||null,type:'CUSTOM',questions:questions as any,createdById:req.user.id}});}
  catch(e:any){if(String(e?.code)==='P2002')throw new BadRequestException('A survey template with this name already exists.');throw e;}
 }

 @Patch(':orgId/templates/:templateId') async updateTemplate(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('templateId')templateId:string,@Body()body:{name?:string;description?:string;questions?:unknown;active?:boolean}){
  await this.admin(req,orgId);
  const existing=await this.db.clientSurveyTemplate.findFirst({where:{id:templateId,organizationId:orgId}});
  if(!existing)throw new BadRequestException('Survey template not found.');
  const data:any={};
  if(body.name!==undefined){const name=String(body.name).trim();if(name.length<2||name.length>120)throw new BadRequestException('Template name must be 2–120 characters.');data.name=name;}
  if(body.description!==undefined){const description=String(body.description).trim();if(description.length>1000)throw new BadRequestException('Description is too long.');data.description=description||null;}
  if(body.questions!==undefined){try{data.questions=validateQuestionnaire(body.questions) as any;}catch(e){throw new BadRequestException((e as Error).message);}}
  if(body.active!==undefined)data.active=Boolean(body.active);
  return this.db.clientSurveyTemplate.update({where:{id:existing.id},data});
 }

 @Get(':orgId/clients/:accountId') async list(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string){
  await this.clientAccount(req,orgId,accountId);
  const entries=await this.db.clientSurveyInvitation.findMany({where:{accountId},select:{id:true,type:true,title:true,recipientEmail:true,status:true,score:true,feedback:true,questionnaire:true,answers:true,createdAt:true,sentAt:true,respondedAt:true,expiresAt:true,isDemo:true,templateId:true},orderBy:{createdAt:'desc'},take:200});
  const npsScores=entries.filter(x=>x.status==='ANSWERED'&&x.type==='NPS'&&typeof x.score==='number').map(x=>x.score!);
  const csatScores=entries.filter(x=>x.status==='ANSWERED'&&x.type==='CSAT'&&typeof x.score==='number').map(x=>x.score!);
  const nps=npsScores.length?Math.round(100*(npsScores.filter(x=>x>=9).length-npsScores.filter(x=>x<=6).length)/npsScores.length):null;
  const csat=csatScores.length?Math.round(100*csatScores.filter(x=>x>=4).length/csatScores.length):null;
  const customAnswered=entries.filter(x=>x.status==='ANSWERED'&&x.type==='CUSTOM').length;
  return {entries,aggregates:{nps:{responses:npsScores.length,score:nps},csat:{responses:csatScores.length,score:csat},customResponses:customAnswered}};
 }

 @Post(':orgId/clients/:accountId') async invite(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Body()body:{email?:string;templateId?:string;type?:'NPS'|'CSAT';title?:string}){
  const account=await this.clientAccount(req,orgId,accountId,true);
  if(!validEmail(body?.email))throw new BadRequestException('Valid recipient email required.');
  let type:'NPS'|'CSAT'|'CUSTOM'='NPS',title='Net Promoter Score',question='How likely are you to recommend our services to a colleague?',questions:SurveyQuestion[]=standardQuestionnaire('NPS',question),templateId:string|null=null;
  if(body?.templateId){
   const template=await this.db.clientSurveyTemplate.findFirst({where:{id:body.templateId,organizationId:orgId,active:true}});
   if(!template)throw new BadRequestException('Active survey template not found.');
   let validated:SurveyQuestion[];try{validated=validateQuestionnaire(template.questions);}catch{throw new BadRequestException('The selected survey template is invalid.');}
   type='CUSTOM';title=template.name;question=template.description||'Please share your feedback.';questions=validated;templateId=template.id;
  }else if(body?.type==='CSAT'){
   type='CSAT';title='Customer Satisfaction';question='How satisfied are you with the recent service?';questions=standardQuestionnaire('CSAT',question);
  }else if(body?.type==='NPS'||!body?.type){
   type='NPS';
  }else throw new BadRequestException('Choose NPS, CSAT, or a custom questionnaire.');
  if(body?.title){const customTitle=String(body.title).trim();if(customTitle.length<2||customTitle.length>180)throw new BadRequestException('Survey title must be 2–180 characters.');title=customTitle;}
  const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+14*86400000);
  const invite=await this.db.clientSurveyInvitation.create({data:{accountId,createdById:req.user.id,recipientEmail:String(body.email).trim().toLowerCase(),type,title,question,templateId,questionnaire:questions as any,tokenHash:hash(token),isDemo:account.isDemo,expiresAt}});
  const base=(process.env.CORS_ORIGIN||'http://localhost:3000').replace(/\/$/,'');
  const url=base+'/survey/'+token;
  if(account.isDemo){
   await this.db.clientSurveyInvitation.update({where:{id:invite.id},data:{status:'SENT',sentAt:new Date()}});
   return {id:invite.id,status:'DEMO_READY',previewUrl:url,notice:'Fictional survey is ready in the private preview; no real email was sent.'};
  }
  const outgoing=await this.mail.draft(req.user.id,{organizationId:orgId,recipientEmail:invite.recipientEmail,subject:title,bodyText:account.name+' has requested your feedback.\n\n'+question+'\n\nComplete the questionnaire here: '+url+'\n\nThis link expires in 14 days and can only be used once.',category:'CLIENT_SURVEY',entityType:'CLIENT_SURVEY',entityId:invite.id,idempotencyKey:'client-survey:'+invite.id});
  try{const sent=await this.mail.send(outgoing.id,req.user.id);return {id:invite.id,status:sent.status,notice:'Survey invitation sent through the connected mailbox.'};}
  catch{return {id:invite.id,status:'NOT_SENT',outgoingMessageId:outgoing.id,notice:'Survey saved but not sent. Connect an approved mailbox and retry from Outgoing Messages.'};}
 }

 @Post(':orgId/clients/:accountId/:surveyId/revoke') async revoke(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('accountId')accountId:string,@Param('surveyId')surveyId:string){
  await this.clientAccount(req,orgId,accountId,true);
  const changed=await this.db.clientSurveyInvitation.updateMany({where:{id:surveyId,accountId,status:{in:['DRAFT','SENT']}},data:{status:'REVOKED'}});
  if(!changed.count)throw new BadRequestException('Survey is no longer active.');
  return {revoked:true};
 }
}
