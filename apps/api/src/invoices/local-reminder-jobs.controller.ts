import {BadRequestException,Controller,Get,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,requireManager} from '../common/auth.guard';
import {candidateReminders} from './local-reminder-preview';

/** Generates internal approval tasks only. Does not send an email or make external calls. */
@UseGuards(AuthGuard) @Controller('billing/automation')
export class LocalReminderJobsController {
 constructor(private db:PrismaService){}
 private async candidates(){const now=new Date();const invoices=await this.db.invoice.findMany({where:{status:{in:['SENT','PARTIALLY_PAID']},dueAt:{lt:now}},include:{payments:true,adjustments:true,account:{select:{id:true,name:true,ownerId:true}},reminders:true},take:1000});
  return invoices.flatMap(inv=>{const paid=inv.payments.reduce((n,p)=>n+Number(p.amount),0)+inv.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);return candidateReminders({id:inv.id,dueAt:inv.dueAt,total:Number(inv.total),paid,isDemo:inv.isDemo,status:inv.status},now).filter(m=>!inv.reminders.some(r=>r.scheduledFor.getTime()===m.scheduledFor.getTime())).slice(0,1).map(m=>({invoiceId:inv.id,invoiceNumber:inv.number,accountId:inv.account.id,clientName:inv.account.name,assigneeId:inv.account.ownerId,isDemo:inv.isDemo,currency:inv.currency,balance:Math.round((Number(inv.total)-paid)*100)/100,...m}));});
 }
 @Get('preview') async preview(@Req()req:AuthRequest){requireManager(req.user);return {simulation:true,sendsEmail:false,proposals:await this.candidates()};}
 @Post('create-approval-tasks') async enqueue(@Req()req:AuthRequest){requireManager(req.user);
  const proposed=await this.candidates();let created=0,skipped=0;
  for(const item of proposed){
   // Recheck inside a transaction to avoid reminders for paid invoices, with unique event guard.
   try{const done=await this.db.$transaction(async tx=>{
     const inv=await tx.invoice.findUnique({where:{id:item.invoiceId},include:{payments:true,adjustments:true,reminders:true}});
     if(!inv) return false;
     const paid=inv.payments.reduce((n,p)=>n+Number(p.amount),0)+inv.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);
     const eligible=candidateReminders({id:inv.id,dueAt:inv.dueAt,total:Number(inv.total),paid,status:inv.status,isDemo:inv.isDemo},new Date()).find(c=>c.day===item.day);
     if(!eligible||inv.reminders.some(r=>r.scheduledFor.getTime()===eligible.scheduledFor.getTime()))return false;
     // The event key is database-unique; this prevents duplicate jobs from parallel runs.
     await tx.localAutomationEvent.create({data:{key:eligible.key,entityType:'INVOICE',entityId:inv.id,action:'REMINDER_APPROVAL',isDemo:inv.isDemo,createdById:req.user.id}});
     await tx.invoiceReminder.create({data:{invoiceId:inv.id,createdById:req.user.id,scheduledFor:eligible.scheduledFor,status:'PENDING_APPROVAL',mode:'DRAFT_ONLY'}});
     if(!inv.isDemo)await tx.task.create({data:{assigneeId:item.assigneeId,opportunityId:inv.opportunityId,title:`Approve payment reminder: ${inv.number} (day ${eligible.day})`,description:`${item.clientName}: check recorded payments/disputes and review the reminder draft. This task does not send an email.`,dueAt:new Date()}});
     return true;
   },{isolationLevel:'Serializable'});if(done)created++;else skipped++;}catch(e:any){if(e?.code==='P2002'){skipped++;continue;}throw e;}
  }
  return {created,skipped,emailsSent:0,note:'Internal approval drafts only. No external emails sent.'};
 }
}
