import {ForbiddenException,Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {nextBillingDate} from '../commercial/commercial-policy';
import {candidateReminders} from '../invoices/local-reminder-preview';
import {isPlainEmail} from '../common/email';

export function preparationEnabled(slug:string){
 return slug==='seebot'||(process.env.NODE_ENV==='production'?process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED==='true':process.env.TENANT_SCOPED_CRM_PREVIEW==='true');
}
/** Both HTTP actions and background work use the same transaction/idempotency boundary. */
@Injectable()
export class FinancePreparationService{
 constructor(private db:PrismaService){}
 private async authorize(tx:Prisma.TransactionClient,organizationId:string,actorId:string,automatic:false|'billing'|'reminders'=false){
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id=${organizationId} FOR UPDATE`;
  const member=await tx.organizationMembership.findUnique({where:{organizationId_userId:{organizationId,userId:actorId}},include:{organization:true,user:{select:{active:true}}}});
  if(!member?.user.active||member.status!=='ACTIVE'||!['OWNER','ADMIN','FINANCE'].includes(member.role)||!['SETUP','ACTIVE'].includes(member.organization.status))throw new ForbiddenException('Active finance membership required for preparation.');
  if(!preparationEnabled(member.organization.slug))throw new ForbiddenException('Tenant preparation is disabled for this deployment.');
  if(automatic){const config=await tx.workspaceAutomation.findUnique({where:{organizationId}});if(!config||config.enabledById!==actorId||!(automatic==='billing'?config.billingDrafts:config.reminderTasks))throw new ForbiddenException('Automatic preparation is disabled.');}
 }
 async billing(organizationId:string,actorId:string,automatic=false){
  await this.db.$transaction(tx=>this.authorize(tx,organizationId,actorId,automatic?'billing':false));
  const schedules=await this.db.billingSchedule.findMany({where:{status:'ACTIVE',nextDueAt:{lte:new Date()},amount:{gt:0},contract:{status:'SIGNED',isDemo:false,opportunity:{account:{organizationId,isDemo:false}}}},select:{id:true},orderBy:[{nextDueAt:'asc'},{id:'asc'}],take:100});
  let created=0,skipped=0;
  for(const candidate of schedules){
   const done=await this.db.$transaction(async tx=>{
    await this.authorize(tx,organizationId,actorId,automatic?'billing':false);
    const schedule=await tx.billingSchedule.findFirst({where:{id:candidate.id,status:'ACTIVE',nextDueAt:{lte:new Date()},amount:{gt:0},contract:{status:'SIGNED',isDemo:false,opportunity:{account:{organizationId,isDemo:false}}}},include:{contract:{include:{opportunity:{include:{account:{include:{contacts:true}}}}}}}});
    if(!schedule?.nextDueAt||!schedule.amount)return false;
    if(schedule.cadence==='MILESTONE'&&!(await tx.deliveryMilestone.findFirst({where:{id:schedule.milestoneId||'',contractId:schedule.contractId,status:'ACCEPTED',account:{organizationId}}})))return false;
    const account=schedule.contract.opportunity.account;
    const contact=account.contacts.find(c=>!c.optedOut&&c.email&&/payable|finance|billing/i.test(c.title))||account.contacts.find(c=>!c.optedOut&&c.email);
    if(!isPlainEmail(contact?.email))return false;const billingEmail=contact.email;
    const key='billing-draft:'+schedule.id+':'+schedule.nextDueAt.toISOString().slice(0,10);
    if(await tx.localAutomationEvent.findUnique({where:{key}}))return false;
    await tx.localAutomationEvent.create({data:{key,entityType:'BILLING_SCHEDULE',entityId:schedule.id,action:'INVOICE_DRAFT',createdById:actorId}});
    const invoice=await tx.invoice.create({data:{accountId:account.id,opportunityId:schedule.contract.opportunityId,contractId:schedule.contractId,number:'DRAFT-'+randomUUID(),currency:schedule.currency,lineItems:[{description:schedule.description,quantity:1,unitPrice:Number(schedule.amount)}],subtotal:schedule.amount,total:schedule.amount,tax:0,billingEmail,createdById:actorId,dueAt:new Date(schedule.nextDueAt.getTime()+30*86400000),status:'DRAFT'}});
    const next=nextBillingDate(schedule.nextDueAt,schedule.cadence);
    await tx.billingSchedule.update({where:{id:schedule.id},data:next?{nextDueAt:next}:{nextDueAt:null,status:'PAUSED'}});
    await tx.auditEvent.create({data:{actorId,action:'TENANT_BILLING_DRAFT_PREPARED',entityType:'INVOICE',entityId:invoice.id,detail:{organizationId,scheduleId:schedule.id}}});
    return true;
   });
   if(done)created++;else skipped++;
  }
  return {created,skipped,issued:0,emailsSent:0};
 }
 async reminders(organizationId:string,actorId:string,automatic=false){
  await this.db.$transaction(tx=>this.authorize(tx,organizationId,actorId,automatic?'reminders':false));
  let created=0,skipped=0;
  // Filter already prepared milestones before LIMIT so old invoices cannot starve new work.
  for(const day of [1,5]){
   const cutoff=new Date(Date.now()-day*86400000);
   const candidates=await this.db.$queryRaw<{id:string}[]>`
    SELECT i.id FROM "Invoice" i JOIN "Account" a ON a.id=i."accountId"
    WHERE a."organizationId"=${organizationId} AND i.status IN ('SENT','PARTIALLY_PAID')
     AND NOT i."isDemo" AND NOT a."isDemo" AND i."dueAt"<=${cutoff}
     AND i.total-COALESCE((SELECT SUM(p.amount) FROM "PaymentRecord" p WHERE p."invoiceId"=i.id),0)
      -COALESCE((SELECT SUM(c.amount) FROM "InvoiceAdjustment" c WHERE c."invoiceId"=i.id AND c.status='APPROVED' AND c.kind='CREDIT_NOTE'),0)>0.005
     AND NOT EXISTS (SELECT 1 FROM "LocalAutomationEvent" e WHERE e.key='invoice:'||i.id||':overdue:'||${String(day)})
    ORDER BY i."dueAt",i.id LIMIT 100`;
   for(const candidate of candidates){
    const done=await this.db.$transaction(async tx=>{
     await this.authorize(tx,organizationId,actorId,automatic?'reminders':false);
     const invoice=await tx.invoice.findFirst({where:{id:candidate.id,isDemo:false,account:{organizationId,isDemo:false}},include:{payments:true,adjustments:true,reminders:true,account:{select:{ownerId:true,name:true}}}});
     if(!invoice)return false;
     const paid=invoice.payments.reduce((n,p)=>n+Number(p.amount),0)+invoice.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);
     const eligible=candidateReminders({id:invoice.id,dueAt:invoice.dueAt,total:Number(invoice.total),paid,status:invoice.status,isDemo:false},new Date()).find(c=>c.day===day);
     if(!eligible||await tx.localAutomationEvent.findUnique({where:{key:eligible.key}}))return false;
     await tx.localAutomationEvent.create({data:{key:eligible.key,entityType:'INVOICE',entityId:invoice.id,action:'REMINDER_APPROVAL',createdById:actorId}});
     if(!invoice.reminders.some(r=>r.scheduledFor.getTime()===eligible.scheduledFor.getTime())){
      await tx.invoiceReminder.create({data:{invoiceId:invoice.id,createdById:actorId,scheduledFor:eligible.scheduledFor,status:'PENDING_APPROVAL',mode:'DRAFT_ONLY'}});
      const owner=await tx.organizationMembership.findUnique({where:{organizationId_userId:{organizationId,userId:invoice.account.ownerId}},include:{user:{select:{active:true}}}});
      const assigneeId=owner?.status==='ACTIVE'&&owner.user.active?invoice.account.ownerId:actorId;
      await tx.task.create({data:{organizationId,assigneeId,opportunityId:invoice.opportunityId,title:'Approve payment reminder: '+invoice.number+' (day '+day+')',description:invoice.account.name+': verify payments/disputes and review the reminder before sending.',dueAt:new Date()}});
     }
     return true;
    });
    if(done)created++;else skipped++;
   }
  }
  return {created,skipped,emailsSent:0};
 }
}
