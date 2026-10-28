import {BadRequestException,Body,Controller,Param,Patch,Post,Get,Req,UseGuards,ForbiddenException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {nextBillingDate} from '../commercial/commercial-policy';
import {candidateReminders} from '../invoices/local-reminder-preview';
import {reminderEligibility,reminderText} from '../invoices/reminder-policy';
import {OutgoingMessageService} from '../communications/outgoing-message.service';

@UseGuards(IdentityGuard)
@Controller('workspace-finance-automation')
export class TenantFinanceAutomationController{
 constructor(private db:PrismaService,private scope:TenantScopeService,private outgoing:OutgoingMessageService){}
 private async finance(req:ScopedRequest,orgId:string,adminOnly=false){
  return this.scope.membership(req,orgId,adminOnly?'admin':'finance');
 }
 @Get(':orgId/billing/schedules')async schedules(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.finance(req,orgId);
  const [schedules,contracts]=await Promise.all([
   this.db.billingSchedule.findMany({
    where:{contract:{opportunity:{account:{organizationId:orgId}}}},
    include:{contract:{select:{id:true,title:true,status:true,currency:true,opportunity:{select:{account:{select:{id:true,name:true}}}}}}},
    orderBy:{createdAt:'desc'},take:300
   }),
   this.db.contract.findMany({
    where:{opportunity:{account:{organizationId:orgId}},status:{in:['DRAFT','SIGNED']}},
    select:{id:true,title:true,status:true,currency:true,opportunity:{select:{account:{select:{id:true,name:true}}}},milestones:{select:{id:true,title:true,status:true,dueAt:true}}},
    orderBy:{createdAt:'desc'},take:200
   })
  ]);
  return {schedules,contracts:contracts.map(c=>({id:c.id,title:c.title,status:c.status,currency:c.currency,client:c.opportunity.account,milestones:c.milestones.filter(m=>m.status!=='REJECTED')}))};
 }
 @Post(':orgId/contracts/:contractId/billing-schedules')async createSchedule(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Body()body:any){
  await this.finance(req,orgId);const contract=await this.scope.contract(orgId,contractId);
  const description=String(body?.description||'').trim(),cadence=String(body?.cadence||'').toUpperCase(),currency=String(body?.currency||contract.currency||'USD').toUpperCase();
  if(description.length<3||description.length>250||!['MONTHLY','QUARTERLY','MILESTONE','ONE_TIME'].includes(cadence)||!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Valid description, cadence and ISO currency are required.');
  const amountRaw=String(body?.amount??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(amountRaw)||Number(amountRaw)<=0)throw new BadRequestException('Billing amount must be positive with up to two decimal places.');
  let nextDueAt:Date|null=null,milestoneId:string|null=null;
  if(cadence==='MILESTONE'){
   milestoneId=String(body?.milestoneId||'').trim();if(!milestoneId)throw new BadRequestException('Choose the delivery milestone that triggers this billing draft.');
   const milestone=await this.db.deliveryMilestone.findFirst({where:{id:milestoneId,contractId,account:{organizationId:orgId}}});if(!milestone)throw new BadRequestException('Milestone is unavailable for this contract.');
   if(milestone.status==='ACCEPTED')nextDueAt=new Date();
  }else{
   nextDueAt=new Date(body?.nextDueAt);if(!Number.isFinite(nextDueAt.getTime()))throw new BadRequestException('Choose a valid first billing date.');
  }
  const created=await this.db.billingSchedule.create({data:{contractId,description,cadence,amount:amountRaw,currency,nextDueAt,milestoneId,createdById:req.user.id}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_BILLING_SCHEDULE_CREATED',entityType:'BILLING_SCHEDULE',entityId:created.id,detail:{organizationId:orgId,contractId,cadence,milestoneId}}});
  return created;
 }
 @Patch(':orgId/billing/schedules/:scheduleId')async updateSchedule(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('scheduleId')scheduleId:string,@Body()body:any){
  await this.finance(req,orgId);
  const schedule=await this.db.billingSchedule.findFirst({where:{id:scheduleId,contract:{opportunity:{account:{organizationId:orgId}}}}});if(!schedule)throw new BadRequestException('Billing schedule unavailable.');
  const status=String(body?.status||'').toUpperCase();if(!['ACTIVE','PAUSED','CANCELLED'].includes(status))throw new BadRequestException('Status must be Active, Paused or Cancelled.');
  if(schedule.status==='CANCELLED')throw new BadRequestException('Cancelled schedules are immutable.');
  const updated=await this.db.billingSchedule.update({where:{id:schedule.id},data:{status}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_BILLING_SCHEDULE_STATUS',entityType:'BILLING_SCHEDULE',entityId:schedule.id,detail:{organizationId:orgId,status}}});
  return updated;
 }
 @Post(':orgId/billing/generate-drafts')async generate(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.finance(req,orgId);
  const candidates=await this.db.billingSchedule.findMany({where:{status:'ACTIVE',nextDueAt:{lte:new Date()},amount:{gt:0},contract:{opportunity:{account:{organizationId:orgId}}}},include:{contract:{include:{opportunity:{include:{account:{include:{contacts:true}}}}}}},take:100});
  let created=0,skipped=0;
  for(const schedule of candidates){
   const account=schedule.contract.opportunity.account;
   if(account.isDemo||schedule.contract.isDemo){skipped++;continue;}
   const billingEmail=account.contacts.find(c=>c.email&&/payable|finance|billing/i.test(c.title))?.email||account.contacts.find(c=>c.email)?.email;
   if(!billingEmail){skipped++;continue;}
   const key='billing-draft:'+schedule.id+':'+schedule.nextDueAt?.toISOString().slice(0,10);
   try{
    const done=await this.db.$transaction(async tx=>{
     await tx.localAutomationEvent.create({data:{key,entityType:'BILLING_SCHEDULE',entityId:schedule.id,action:'INVOICE_DRAFT',createdById:req.user.id}});
     const next=nextBillingDate(schedule.nextDueAt!,schedule.cadence);
     const invoice=await tx.invoice.create({data:{accountId:account.id,opportunityId:schedule.contract.opportunityId,contractId:schedule.contractId,number:'DRAFT-'+randomUUID(),currency:schedule.currency,lineItems:[{description:schedule.description,quantity:1,unitPrice:Number(schedule.amount)}],subtotal:schedule.amount!,total:schedule.amount!,tax:0,billingEmail,createdById:req.user.id,dueAt:new Date(schedule.nextDueAt!.getTime()+30*86400000),status:'DRAFT'}});
     await tx.billingSchedule.update({where:{id:schedule.id},data:next?{nextDueAt:next}:{nextDueAt:null,status:'PAUSED'}});
     await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_BILLING_DRAFT_PREPARED',entityType:'INVOICE',entityId:invoice.id,detail:{organizationId:orgId,scheduleId:schedule.id}}});
     return true;
    },{isolationLevel:'Serializable'});if(done)created++;
   }catch(e:any){if(e?.code==='P2002'){skipped++;continue;}throw e;}
  }
  return {created,skipped,issued:0,emailsSent:0,note:'Draft invoices only. Finance review, tax approval and explicit issue remain required.'};
 }
 private async reminderCandidates(orgId:string){
  const now=new Date(),invoices=await this.db.invoice.findMany({where:{status:{in:['SENT','PARTIALLY_PAID']},dueAt:{lt:now},account:{organizationId:orgId}},include:{payments:true,adjustments:true,account:{select:{id:true,name:true,ownerId:true}},reminders:true},take:500});
  return invoices.flatMap(inv=>{
   const paid=inv.payments.reduce((n,p)=>n+Number(p.amount),0)+inv.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);
   return candidateReminders({id:inv.id,dueAt:inv.dueAt,total:Number(inv.total),paid,isDemo:inv.isDemo,status:inv.status},now).filter(c=>!inv.reminders.some(r=>r.scheduledFor.getTime()===c.scheduledFor.getTime())).slice(0,1).map(c=>({invoiceId:inv.id,invoiceNumber:inv.number,clientName:inv.account.name,assigneeId:inv.account.ownerId,currency:inv.currency,balance:Math.round((Number(inv.total)-paid)*100)/100,isDemo:inv.isDemo,...c}));
  });
 }
 @Get(':orgId/reminders')async reminders(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.finance(req,orgId);
  const pending=await this.db.invoiceReminder.findMany({where:{invoice:{account:{organizationId:orgId}},status:{in:['PENDING_APPROVAL','APPROVED']}},include:{invoice:{select:{id:true,number:true,billingEmail:true,currency:true,total:true,dueAt:true,account:{select:{name:true}},payments:true,adjustments:true}}},orderBy:{scheduledFor:'asc'},take:200});
  return {candidates:await this.reminderCandidates(orgId),pending:pending.map(r=>({id:r.id,status:r.status,scheduledFor:r.scheduledFor,invoiceId:r.invoiceId,number:r.invoice.number,client:r.invoice.account.name,recipient:r.invoice.billingEmail,currency:r.invoice.currency,total:r.invoice.total}))};
 }
 @Post(':orgId/reminders/create-review-tasks')async createTasks(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.finance(req,orgId);const proposals=await this.reminderCandidates(orgId);let created=0,skipped=0;
  for(const item of proposals){
   try{const done=await this.db.$transaction(async tx=>{
    const invoice=await tx.invoice.findFirst({where:{id:item.invoiceId,account:{organizationId:orgId}},include:{payments:true,adjustments:true,reminders:true}});
    if(!invoice)return false;
    const paid=invoice.payments.reduce((n,p)=>n+Number(p.amount),0)+invoice.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);
    const eligible=candidateReminders({id:invoice.id,dueAt:invoice.dueAt,total:Number(invoice.total),paid,status:invoice.status,isDemo:invoice.isDemo},new Date()).find(c=>c.day===item.day);
    if(!eligible||invoice.reminders.some(r=>r.scheduledFor.getTime()===eligible.scheduledFor.getTime()))return false;
    await tx.localAutomationEvent.create({data:{key:eligible.key,entityType:'INVOICE',entityId:invoice.id,action:'REMINDER_APPROVAL',isDemo:invoice.isDemo,createdById:req.user.id}});
    await tx.invoiceReminder.create({data:{invoiceId:invoice.id,createdById:req.user.id,scheduledFor:eligible.scheduledFor,status:'PENDING_APPROVAL',mode:'DRAFT_ONLY'}});
    if(!invoice.isDemo)await tx.task.create({data:{organizationId:orgId,assigneeId:item.assigneeId,opportunityId:invoice.opportunityId,title:'Approve payment reminder: '+invoice.number+' (day '+eligible.day+')',description:item.clientName+': verify payments/disputes and review the reminder before sending.',dueAt:new Date()}});
    return true;
   },{isolationLevel:'Serializable'});if(done)created++;else skipped++;}catch(e:any){if(e?.code==='P2002'){skipped++;continue;}throw e;}
  }
  return {created,skipped,emailsSent:0,note:'Review tasks created. No reminder email was sent.'};
 }
 @Post(':orgId/reminders/:reminderId/approve')async approve(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('reminderId')reminderId:string){
  await this.finance(req,orgId,true);
  const reminder=await this.db.invoiceReminder.findFirst({where:{id:reminderId,invoice:{account:{organizationId:orgId}}},include:{invoice:{include:{payments:true,adjustments:true,account:true}}}});
  if(!reminder||reminder.status!=='PENDING_APPROVAL'||reminder.scheduledFor>new Date())throw new BadRequestException('Due pending reminder required.');
  const invoice=reminder.invoice,paid=invoice.payments.reduce((n,p)=>n+Number(p.amount),0)+invoice.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);
  const state=reminderEligibility({id:invoice.id,number:invoice.number,currency:invoice.currency,total:Number(invoice.total),paid,dueAt:invoice.dueAt,status:invoice.status,isDemo:invoice.isDemo,billingEmail:invoice.billingEmail},new Date());
  if(!state.eligible)throw new BadRequestException(state.reason);
  const updated=await this.db.invoiceReminder.updateMany({where:{id:reminderId,status:'PENDING_APPROVAL'},data:{status:'APPROVED'}});
  if(updated.count!==1)throw new BadRequestException('Reminder changed while approving.');
  await this.db.auditEvent.create({data:{actorId:req.user.id,entityType:'INVOICE',entityId:invoice.id,action:'TENANT_INVOICE_REMINDER_APPROVED',detail:{organizationId:orgId,reminderId,balance:state.balance}}});
  return {approved:true};
 }
 @Post(':orgId/reminders/:reminderId/send')async send(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('reminderId')reminderId:string){
  await this.finance(req,orgId);
  const reminder=await this.db.invoiceReminder.findFirst({where:{id:reminderId,status:'APPROVED',invoice:{account:{organizationId:orgId}}},include:{invoice:{include:{payments:true,adjustments:true,account:true}}}});
  if(!reminder)throw new BadRequestException('Approved reminder unavailable.');
  const invoice=reminder.invoice,paid=invoice.payments.reduce((n,p)=>n+Number(p.amount),0)+invoice.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);
  const state=reminderEligibility({id:invoice.id,number:invoice.number,currency:invoice.currency,total:Number(invoice.total),paid,dueAt:invoice.dueAt,status:invoice.status,isDemo:invoice.isDemo,billingEmail:invoice.billingEmail},new Date());
  if(!state.eligible)throw new BadRequestException(state.reason);
  const message=await this.outgoing.draft(req.user.id,{organizationId:orgId,recipientEmail:invoice.billingEmail,subject:'Payment reminder: invoice '+invoice.number,bodyText:reminderText({number:invoice.number,currency:invoice.currency,balance:state.balance,dueAt:invoice.dueAt,clientName:invoice.account.name}),category:'INVOICE_REMINDER',entityType:'INVOICE',entityId:invoice.id,idempotencyKey:'invoice-reminder:'+reminder.id});
  return this.outgoing.send(message.id,req.user.id);
 }
}
