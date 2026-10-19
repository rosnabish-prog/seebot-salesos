import {BadRequestException,Body,Controller,Get,NotFoundException,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {DemoIntelligenceProvider} from './demo-provider';

const nonempty=(value:unknown,max:number)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;

@UseGuards(IdentityGuard)
@Controller('workspace-intelligence')
export class TenantIntelligenceController{
 constructor(private db:PrismaService,private scope:TenantScopeService,private demo:DemoIntelligenceProvider){}
 private async account(req:ScopedRequest,orgId:string,id:string,write=false){
  await this.scope.membership(req,orgId,write);
  const account=await this.db.account.findFirst({where:{id,organizationId:orgId},include:{contacts:true}});
  if(!account)throw new NotFoundException('Account not found in this workspace.');
  return account;
 }
 private async draft(req:ScopedRequest,orgId:string,id:string,write=false){
  await this.scope.membership(req,orgId,write);
  const draft=await this.db.outreachDraft.findUnique({where:{id},include:{account:true,contact:true,revisions:{orderBy:{createdAt:'desc'},take:15}}});
  if(!draft||draft.account.organizationId!==orgId)throw new NotFoundException('Outreach draft not found in this workspace.');
  return draft;
 }
 @Get(':orgId/accounts/:id')async overview(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  const account=await this.account(req,orgId,id);
  const [runs,drafts,messages]=await Promise.all([
   this.db.intelligenceRun.findMany({where:{accountId:id},orderBy:{createdAt:'desc'},take:25}),
   this.db.outreachDraft.findMany({where:{accountId:id},include:{contact:{select:{id:true,name:true,title:true,email:true,optedOut:true,verified:true}},revisions:{select:{id:true,instruction:true,createdAt:true},orderBy:{createdAt:'desc'},take:10}},orderBy:{updatedAt:'desc'},take:40}),
   this.db.outreachMessage.findMany({where:{accountId:id},orderBy:{createdAt:'asc'},take:100})
  ]);
  return {account:{id:account.id,name:account.name,industry:account.industry,website:account.website,hypothesis:account.hypothesis},contacts:account.contacts,runs,drafts,messages,mode:'DEMO'};
 }
 @Post(':orgId/accounts/:id/research')async research(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  const account=await this.account(req,orgId,id,true),payload=this.demo.research(account);
  return this.db.intelligenceRun.create({data:{accountId:id,createdById:req.user.id,kind:'RESEARCH',payload}});
 }
 @Post(':orgId/accounts/:id/discover')async discover(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  const account=await this.account(req,orgId,id,true),payload=this.demo.discover(account);
  return this.db.intelligenceRun.create({data:{accountId:id,createdById:req.user.id,kind:'LOOKALIKES',payload}});
 }
 @Post(':orgId/accounts/:id/rank')async rank(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  const account=await this.account(req,orgId,id,true),payload=this.demo.rank(account.contacts);
  return this.db.intelligenceRun.create({data:{accountId:id,createdById:req.user.id,kind:'CONTACT_RANKING',payload}});
 }
 @Post(':orgId/accounts/:id/drafts')async createDraft(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:{contactId?:string}){
  const account=await this.account(req,orgId,id,true);
  if(!nonempty(body?.contactId,100))throw new BadRequestException('Select an existing contact.');
  const contact=account.contacts.find(c=>c.id===body.contactId);
  if(!contact)throw new BadRequestException('Contact does not belong to this account.');
  if(contact.optedOut)throw new BadRequestException('Contact opted out.');
  if(!contact.email)throw new BadRequestException('A professional email is required to draft outreach.');
  const generated=this.demo.draft(account,contact);
  return this.db.outreachDraft.create({data:{accountId:id,contactId:contact.id,ownerId:req.user.id,subject:generated.subject,body:generated.body}});
 }
 @Patch(':orgId/drafts/:id')async edit(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:{subject?:string;body?:string}){
  const draft=await this.draft(req,orgId,id,true);
  if(draft.status!=='DRAFT')throw new BadRequestException('This draft is locked after simulated sending. Create a new draft.');
  if(!nonempty(body?.subject,250)||!nonempty(body?.body,20000))throw new BadRequestException('Subject and body are required.');
  const subject=body.subject!.trim(),content=body.body!.trim();if(subject===draft.subject&&content===draft.body)return draft;
  return this.db.$transaction(async tx=>{
   await tx.outreachRevision.create({data:{draftId:id,instruction:'Manual edit',beforeSubject:draft.subject,beforeBody:draft.body,afterSubject:subject,afterBody:content}});
   return tx.outreachDraft.update({where:{id},data:{subject,body:content,version:{increment:1}}});
  });
 }
 @Post(':orgId/drafts/:id/revise')async revise(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:{instruction:string}){
  const draft=await this.draft(req,orgId,id,true);
  if(draft.status!=='DRAFT')throw new BadRequestException('Sent demo drafts cannot be revised.');
  if(!nonempty(body?.instruction,500))throw new BadRequestException('Enter a revision instruction.');
  const result=this.demo.revise(draft.subject,draft.body,body.instruction.trim());
  return this.db.$transaction(async tx=>{
   await tx.outreachRevision.create({data:{draftId:id,instruction:'DEMO: '+body.instruction.trim(),beforeSubject:draft.subject,beforeBody:draft.body,afterSubject:result.subject,afterBody:result.body}});
   return tx.outreachDraft.update({where:{id},data:{subject:result.subject,body:result.body,version:{increment:1}}});
  });
 }
 @Post(':orgId/drafts/:id/simulate-send')async simulateSend(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  const draft=await this.draft(req,orgId,id,true);
  if(draft.status!=='DRAFT')throw new BadRequestException('This draft is already simulated as sent.');
  if(!draft.contact?.email||draft.contact.optedOut)throw new BadRequestException('Contact email missing or opted out.');
  return this.db.$transaction(async tx=>{
   const changed=await tx.outreachDraft.updateMany({where:{id,status:'DRAFT'},data:{status:'SIMULATED_SENT'}});
   if(changed.count!==1)throw new BadRequestException('Draft was already sent in simulation.');
   return tx.outreachMessage.create({data:{accountId:draft.accountId,draftId:id,contactId:draft.contactId,direction:'OUTBOUND',mode:'DEMO',subject:draft.subject,body:draft.body}});
  });
 }
 @Post(':orgId/drafts/:id/simulate-reply')async simulateReply(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:{reply:string}){
  const draft=await this.draft(req,orgId,id,true);
  if(draft.status!=='SIMULATED_SENT')throw new BadRequestException('Simulate sending before adding a demo reply.');
  if(!nonempty(body?.reply,12000))throw new BadRequestException('Enter a simulated reply.');
  const analysis=this.demo.analyze(body.reply);
  return this.db.outreachMessage.create({data:{accountId:draft.accountId,draftId:id,contactId:draft.contactId,direction:'INBOUND',mode:'DEMO',subject:'Re: '+draft.subject,body:body.reply.trim(),analysis}});
 }
}
