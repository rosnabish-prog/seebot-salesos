import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { createHash,randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard,AuthRequest,ensureCanEdit,ensureOwner } from '../common/auth.guard';
import { OutgoingMessageService } from '../communications/outgoing-message.service';
import { SurveyType,SURVEY_TYPES,validateSurveyScore,surveyClassification,scoreSummary } from './survey-validation';

const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const validEmail=(s:unknown)=>typeof s==='string'&&s.length<=254&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
const now=()=>new Date();

@Controller('surveys')
export class PublicSurveysController {
  constructor(private readonly db:PrismaService){}
  private async find(token:string){
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(token))throw new BadRequestException('Invalid survey link.');
    const item=await this.db.clientSurveyInvitation.findUnique({where:{tokenHash:hash(token)},include:{account:{select:{name:true}}}});
    if(!item||item.expiresAt<now()||!['SENT','ANSWERED'].includes(item.status))throw new BadRequestException('Survey expired or unavailable.');
    if(!item.isDemo&&process.env.SURVEYS_ENABLED!=='true')throw new ForbiddenException('Live surveys have not been enabled.');
    return item;
  }
  @Get(':token') async view(@Param('token')token:string){
    const item=await this.find(token);
    return {type:item.type,title:item.title,question:item.question,company:item.account.name,status:item.status,expiresAt:item.expiresAt,isDemo:item.isDemo};
  }
  @Post(':token/respond') async respond(@Param('token')token:string,@Body()body:{score:number;feedback?:string}){
    const item=await this.find(token);
    if(item.status!=='SENT')throw new BadRequestException('Survey was already submitted.');
    if(typeof body?.feedback!=='string'&&body?.feedback!==undefined)throw new BadRequestException('Feedback must be text.');
    if((body.feedback||'').length>4000)throw new BadRequestException('Feedback must be 4000 characters or less.');
    let score:number;
    try{score=validateSurveyScore(item.type as SurveyType,body.score);}catch(e){throw new BadRequestException((e as Error).message);}
    await this.db.$transaction(async tx=>{
      const changed=await tx.clientSurveyInvitation.updateMany({where:{id:item.id,status:'SENT',expiresAt:{gt:now()}},data:{status:'ANSWERED',respondedAt:now(),score,feedback:body.feedback?.trim()||null}});
      if(changed.count!==1)throw new BadRequestException('Survey was already completed or expired.');
      // A survey is feedback, never evidence that an opportunity stage was completed.
      if(!item.isDemo&&item.type==='NPS'&&score<=6){
        const opp=await tx.opportunity.findFirst({where:{accountId:item.accountId},orderBy:{updatedAt:'desc'},select:{id:true}});
        const account=await tx.account.findUniqueOrThrow({where:{id:item.accountId},select:{ownerId:true,name:true,organizationId:true}});
        await tx.task.create({data:{organizationId:account.organizationId,assigneeId:account.ownerId,opportunityId:opp?.id,title:`Client NPS follow-up: ${account.name}`,description:`Verified survey response: ${score}/10. Contact the client to discuss feedback.`,dueAt:new Date(Date.now()+2*86400000)}});
      }
    },{isolationLevel:'Serializable'});
    return {received:true,type:item.type,classification:surveyClassification(item.type as SurveyType,score)};
  }
}

@UseGuards(AuthGuard) @Controller('clients/:accountId/surveys')
export class ClientSurveysController {
  constructor(private readonly db:PrismaService,private readonly mail:OutgoingMessageService){}
  private async account(req:AuthRequest,id:string,edit=false){
    const a=await this.db.account.findUnique({where:{id}});
    if(!a||a.status!=='Customer')throw new BadRequestException('Client not found.');
    if(edit)ensureCanEdit(req.user,a.ownerId);else ensureOwner(req.user,a.ownerId);
    return a;
  }
  @Get() async list(@Req()req:AuthRequest,@Param('accountId')accountId:string){
    await this.account(req,accountId);
    const entries=await this.db.clientSurveyInvitation.findMany({where:{accountId},select:{id:true,type:true,title:true,recipientEmail:true,status:true,score:true,feedback:true,createdAt:true,sentAt:true,respondedAt:true,expiresAt:true,isDemo:true},orderBy:{createdAt:'desc'},take:150});
    const nps=scoreSummary('NPS',entries.filter(e=>e.status==='ANSWERED'&&e.type==='NPS').map(e=>e.score!));
    const csat=scoreSummary('CSAT',entries.filter(e=>e.status==='ANSWERED'&&e.type==='CSAT').map(e=>e.score!));
    return {entries,aggregates:{nps,csat}};
  }
  @Post() async invite(@Req()req:AuthRequest,@Param('accountId')accountId:string,@Body()body:{email:string;type:SurveyType;title?:string;question?:string}){
    const account=await this.account(req,accountId,true);
    if(!validEmail(body?.email)||!SURVEY_TYPES.includes(body.type))throw new BadRequestException('Valid email and NPS/CSAT type required.');
    if(!account.isDemo&&(process.env.SURVEYS_ENABLED!=='true'||!(process.env.CORS_ORIGIN||'').startsWith('https://')))throw new ForbiddenException('Live surveys require SURVEYS_ENABLED and a verified HTTPS public origin.');
    const token=randomBytes(32).toString('base64url');
    const title=(body.title||`${body.type} feedback request`).trim().slice(0,180);
    const question=(body.question|| (body.type==='NPS'?'How likely are you to recommend our services to a colleague?':'How satisfied are you with the recent service?')).trim().slice(0,700);
    if(!title||!question)throw new BadRequestException('Title and question required.');
    const invite=await this.db.clientSurveyInvitation.create({data:{accountId,createdById:req.user.id,recipientEmail:body.email.trim().toLowerCase(),type:body.type,title,question,tokenHash:hash(token),isDemo:account.isDemo,expiresAt:new Date(Date.now()+14*86400000)}});
    const url=`${(process.env.CORS_ORIGIN||'http://localhost:3000').replace(/\/$/,'')}/survey/${token}`;
    // For demo clients never send to real inboxes, but allow end-to-end local UI testing.
    if(account.isDemo){await this.db.clientSurveyInvitation.update({where:{id:invite.id},data:{status:'SENT',sentAt:now()}});return {id:invite.id,status:'DEMO_READY',previewUrl:url,notice:'Fictional client survey, no email was sent.'};}
    const outgoing=await this.mail.draft(req.user.id,{recipientEmail:invite.recipientEmail,subject:title,bodyText:`${account.name} has requested your feedback.\n\n${question}\n\nComplete the survey here: ${url}\n\nThis link expires in 14 days and can only be used once.`,category:'CLIENT_SURVEY',entityType:'CLIENT_SURVEY',entityId:invite.id,idempotencyKey:`client-survey:${invite.id}`});
    try{const sent=await this.mail.send(outgoing.id,req.user.id);if(sent.status==='SENT')await this.db.clientSurveyInvitation.update({where:{id:invite.id},data:{status:'SENT',sentAt:now()}});return {id:invite.id,status:sent.status,notice:'Invitation sent through connected Gmail.'};}
    catch{return {id:invite.id,status:'NOT_SENT',outgoingMessageId:outgoing.id,notice:'Survey recorded but NOT sent; connect Gmail, then retry the message.'};}
  }
  @Post(':surveyId/revoke') async revoke(@Req()req:AuthRequest,@Param('accountId')accountId:string,@Param('surveyId')surveyId:string){
    await this.account(req,accountId,true);
    const updated=await this.db.clientSurveyInvitation.updateMany({where:{id:surveyId,accountId,status:{in:['DRAFT','SENT']}},data:{status:'REVOKED'}});
    if(!updated.count)throw new BadRequestException('Survey was not active.');
    return {revoked:true};
  }
}
