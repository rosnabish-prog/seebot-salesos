import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, AuthRequest, ensureOwner, ensureCanEdit } from '../common/auth.guard';
import { DemoIntelligenceProvider } from './demo-provider';

const nonempty=(s:unknown,max:number)=>typeof s==='string' && s.trim().length>0 && s.length<=max;
@UseGuards(AuthGuard)
@Controller('intelligence')
export class IntelligenceController {
  constructor(private db:PrismaService,private demo:DemoIntelligenceProvider){}
  private async account(req:AuthRequest,id:string,write=false){
    const a=await this.db.account.findUnique({where:{id},include:{contacts:true}});
    if(!a)throw new NotFoundException('Account not found.');
    write?ensureCanEdit(req.user,a.ownerId):ensureOwner(req.user,a.ownerId);
    return a;
  }
  private async draft(req:AuthRequest,id:string,write=false){
    const d=await this.db.outreachDraft.findUnique({where:{id},include:{account:true,contact:true,revisions:{orderBy:{createdAt:'desc'},take:15}}});
    if(!d)throw new NotFoundException('Draft not found.');
    write?ensureCanEdit(req.user,d.account.ownerId):ensureOwner(req.user,d.account.ownerId);
    return d;
  }
  @Get('integrations') integrations(){return {
    openai:{mode:'DEMO',liveEnabled:false,keyPresent:Boolean(process.env.OPENAI_API_KEY),description:'External research and models are not enabled in this release.'},
    apollo:{mode:'DEMO',liveEnabled:false,keyPresent:Boolean(process.env.APOLLO_API_KEY),description:'People and company search is simulated.'},
    gmail:{mode:'DEMO',liveEnabled:false,oauthConfigured:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),description:'No mailbox connection, external email, or inbox reading takes place.'}
  };}
  @Get('accounts/:id') async overview(@Req()req:AuthRequest,@Param('id')id:string){
    const a=await this.account(req,id);
    const [runs,drafts,messages]=await Promise.all([
      this.db.intelligenceRun.findMany({where:{accountId:id},orderBy:{createdAt:'desc'},take:25}),
      this.db.outreachDraft.findMany({where:{accountId:id},include:{contact:{select:{id:true,name:true,title:true,email:true,optedOut:true}},revisions:{select:{id:true,instruction:true,createdAt:true},orderBy:{createdAt:'desc'},take:10}},orderBy:{updatedAt:'desc'},take:40}),
      this.db.outreachMessage.findMany({where:{accountId:id},orderBy:{createdAt:'asc'},take:100})]);
    return {account:{id:a.id,name:a.name,industry:a.industry,website:a.website,hypothesis:a.hypothesis,ownerId:a.ownerId},contacts:a.contacts,runs,drafts,messages,mode:'DEMO'};
  }
  @Post('accounts/:id/research') async research(@Req()req:AuthRequest,@Param('id')id:string){
    const a=await this.account(req,id,true);const payload=this.demo.research(a);
    return this.db.intelligenceRun.create({data:{accountId:id,createdById:req.user.id,kind:'RESEARCH',payload}});
  }
  @Post('accounts/:id/discover') async discover(@Req()req:AuthRequest,@Param('id')id:string){
    const a=await this.account(req,id,true);const payload=this.demo.discover(a);
    return this.db.intelligenceRun.create({data:{accountId:id,createdById:req.user.id,kind:'LOOKALIKES',payload}});
  }
  @Post('accounts/:id/rank') async rank(@Req()req:AuthRequest,@Param('id')id:string){
    const a=await this.account(req,id,true);const payload=this.demo.rank(a.contacts);
    return this.db.intelligenceRun.create({data:{accountId:id,createdById:req.user.id,kind:'CONTACT_RANKING',payload}});
  }
  @Post('runs/:id/approve') async approve(@Req()req:AuthRequest,@Param('id')id:string){
    const run=await this.db.intelligenceRun.findUnique({where:{id}});
    if(!run)throw new NotFoundException('Intelligence result not found.');
    await this.account(req,run.accountId,true);
    if(run.mode!=='DEMO')throw new BadRequestException('Unsupported provider mode.');
    // Approval denotes acknowledgment of a TEST result, not endorsement as fact or stage evidence.
    return this.db.intelligenceRun.update({where:{id},data:{status:'REVIEWED_DEMO',reviewedAt:new Date()}});
  }
  @Post('accounts/:id/drafts') async createDraft(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{contactId?:string}){
    const a=await this.account(req,id,true);
    if(!nonempty(body?.contactId,100))throw new BadRequestException('Select an existing contact.');
    const c=a.contacts.find(x=>x.id===body.contactId);
    if(!c)throw new BadRequestException('Contact does not belong to this account.');
    if(c.optedOut)throw new BadRequestException('Contact opted out.');
    if(!c.email)throw new BadRequestException('A professional email is required to draft email outreach.');
    const generated=this.demo.draft(a,c);
    return this.db.outreachDraft.create({data:{accountId:id,contactId:c.id,ownerId:req.user.id,subject:generated.subject,body:generated.body}});
  }
  @Patch('drafts/:id') async edit(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{subject?:string;body?:string}){
    const d=await this.draft(req,id,true);
    if(d.status!=='DRAFT')throw new BadRequestException('This draft is locked after simulated sending. Create a new draft.');
    if(!nonempty(body?.subject,250)||!nonempty(body?.body,20000))throw new BadRequestException('Subject and body are required (maximum 250 and 20,000 characters).');
    const subject=body.subject!.trim(), content=body.body!.trim();
    if(subject===d.subject&&content===d.body)return d;
    return this.db.$transaction(async tx=>{
      await tx.outreachRevision.create({data:{draftId:id,instruction:'Manual edit',beforeSubject:d.subject,beforeBody:d.body,afterSubject:subject,afterBody:content}});
      return tx.outreachDraft.update({where:{id},data:{subject,body:content,version:{increment:1}}});
    });
  }
  @Post('drafts/:id/revise') async revise(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{instruction:string}){
    const d=await this.draft(req,id,true);
    if(d.status!=='DRAFT')throw new BadRequestException('Sent demo drafts cannot be revised.');
    if(!nonempty(body?.instruction,500))throw new BadRequestException('Enter a revision instruction (maximum 500 characters).');
    const result=this.demo.revise(d.subject,d.body,body.instruction.trim());
    if(!nonempty(result.subject,250)||!nonempty(result.body,20000))throw new BadRequestException('Revision exceeded safe limits.');
    return this.db.$transaction(async tx=>{
      await tx.outreachRevision.create({data:{draftId:id,instruction:`DEMO: ${body.instruction.trim()}`,beforeSubject:d.subject,beforeBody:d.body,afterSubject:result.subject,afterBody:result.body}});
      return tx.outreachDraft.update({where:{id},data:{subject:result.subject,body:result.body,version:{increment:1}}});
    });
  }
  @Post('drafts/:id/simulate-send') async simulateSend(@Req()req:AuthRequest,@Param('id')id:string){
    const d=await this.draft(req,id,true);
    if(d.status!=='DRAFT')throw new BadRequestException('This draft is already simulated as sent.');
    if(!d.contact?.email||d.contact.optedOut)throw new BadRequestException('Contact email missing or opted out.');
    const result=await this.db.$transaction(async tx=>{
      const changed=await tx.outreachDraft.updateMany({where:{id,status:'DRAFT'},data:{status:'SIMULATED_SENT'}});
      if(changed.count!==1)throw new BadRequestException('Draft was already sent in simulation.');
      return tx.outreachMessage.create({data:{accountId:d.accountId,draftId:id,contactId:d.contactId,direction:'OUTBOUND',mode:'DEMO',subject:d.subject,body:d.body}});
    });
    return result;
  }
  @Post('drafts/:id/simulate-reply') async simulateReply(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{reply:string}){
    const d=await this.draft(req,id,true);
    if(d.status!=='SIMULATED_SENT')throw new BadRequestException('Simulate sending the draft before adding a demo reply.');
    if(!nonempty(body?.reply,12000))throw new BadRequestException('Enter a simulated reply (maximum 12,000 characters).');
    const analysis=this.demo.analyze(body.reply);
    return this.db.outreachMessage.create({data:{accountId:d.accountId,draftId:id,contactId:d.contactId,direction:'INBOUND',mode:'DEMO',subject:`Re: ${d.subject}`,body:body.reply.trim(),analysis}});
  }
}
