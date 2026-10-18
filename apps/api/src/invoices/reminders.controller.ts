import { BadRequestException,Controller,Get,Param,Post,Req,UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard,AuthRequest,allowManageAll,ensureOwner,requireManager } from '../common/auth.guard';
import { OutgoingMessageService } from '../communications/outgoing-message.service';
import { reminderEligibility,reminderText } from './reminder-policy';

@UseGuards(AuthGuard) @Controller('billing/reminders')
export class InvoiceRemindersController {
  constructor(private db:PrismaService,private outgoing:OutgoingMessageService){}
  private async snapshot(id:string,req:AuthRequest){
    const i=await this.db.invoice.findUnique({where:{id},include:{account:true,payments:true,adjustments:true}});
    if(!i)throw new BadRequestException('Invoice not found.');ensureOwner(req.user,i.account.ownerId);
    const paid=i.payments.reduce((sum,p)=>sum+Number(p.amount),0)+i.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((sum,a)=>sum+Number(a.amount),0);
    const state=reminderEligibility({id:i.id,number:i.number,currency:i.currency,total:Number(i.total),paid,dueAt:i.dueAt,status:i.status,isDemo:i.isDemo,billingEmail:i.billingEmail},new Date());
    return {invoice:i,state};
  }
  @Get('due') async due(@Req()req:AuthRequest){
    if(!allowManageAll(req.user))throw new BadRequestException('Manager permissions required.');
    const now=new Date();const invoices=await this.db.invoice.findMany({where:{isDemo:false,status:{in:['SENT','PARTIALLY_PAID']},dueAt:{lt:now},...(allowManageAll(req.user)?{}:{account:{ownerId:req.user.id}})},include:{account:{select:{id:true,name:true,ownerId:true}},payments:true,adjustments:true},take:250});
    return invoices.map(i=>({id:i.id,accountId:i.accountId,account:i.account.name,number:i.number,currency:i.currency,dueAt:i.dueAt,recipient:i.billingEmail,...reminderEligibility({id:i.id,number:i.number,currency:i.currency,total:Number(i.total),paid:i.payments.reduce((sum,p)=>sum+Number(p.amount),0)+i.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((sum,a)=>sum+Number(a.amount),0),dueAt:i.dueAt,status:i.status,isDemo:i.isDemo,billingEmail:i.billingEmail},now)})).filter(i=>i.eligible);
  }
  @Get(':id/demo-preview') async previewDemo(@Req()req:AuthRequest,@Param('id')id:string){
    const {invoice,state}=await this.snapshot(id,req);
    if(!invoice.isDemo)throw new BadRequestException('Demo-only preview is not available for real client invoices.');
    return {simulation:true,recipient:invoice.billingEmail,subject:`DEMO · Reminder for invoice ${invoice.number}`,body:reminderText({number:invoice.number,currency:invoice.currency,balance:state.balance,dueAt:invoice.dueAt,clientName:invoice.account.name}),notice:'No email has been created or sent. Fictional invoice only.'};
  }
  @Post(':id/approve/:reminderId') async approve(@Req()req:AuthRequest,@Param('id')id:string,@Param('reminderId')reminderId:string){
    requireManager(req.user);
    const {invoice,state}=await this.snapshot(id,req);
    if(!state.eligible)throw new BadRequestException(state.reason);
    const updated=await this.db.invoiceReminder.updateMany({where:{id:reminderId,invoiceId:id,status:'PENDING_APPROVAL',scheduledFor:{lte:new Date()}},data:{status:'APPROVED'}});
    if(!updated.count)throw new BadRequestException('There is no due, pending reminder to approve.');
    await this.db.auditEvent.create({data:{actorId:req.user.id,entityType:'INVOICE',entityId:id,action:'INVOICE_REMINDER_APPROVED',detail:{reminderId,balance:state.balance,currency:invoice.currency}}});
    return {approved:true,reminderId,notice:'Approval recorded. Prepare and explicitly send the email from the authorized mailbox.'};
  }
  @Post(':id/prepare') async prepare(@Req()req:AuthRequest,@Param('id')id:string){
    const {invoice:i,state}=await this.snapshot(id,req);requireManager(req.user);
    if(!state.eligible)throw new BadRequestException(state.reason);
    const reminder=await this.db.invoiceReminder.findFirst({where:{invoiceId:id,status:'PENDING_APPROVAL'}});
    if(!reminder)throw new BadRequestException('Schedule the overdue reminder from the invoice workspace first.');
    const draft=await this.outgoing.draft(req.user.id,{recipientEmail:i.billingEmail,subject:`Payment reminder: invoice ${i.number}`,bodyText:reminderText({number:i.number,currency:i.currency,balance:state.balance,dueAt:i.dueAt,clientName:i.account.name}),category:'INVOICE_REMINDER',entityType:'INVOICE',entityId:id,idempotencyKey:`invoice-reminder:${reminder.id}`});
    return {outgoingMessageId:draft.id,status:draft.status,preview:{to:i.billingEmail,subject:draft.subject,body:draft.bodyText},notice:'Prepared only. Approval and live Gmail authorization required before an email can be sent.'};
  }
}
