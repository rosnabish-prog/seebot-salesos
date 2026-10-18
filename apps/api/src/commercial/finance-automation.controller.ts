import {BadRequestException,Controller,Param,Post,Req,UseGuards} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,ensureCanEdit,requireManager} from '../common/auth.guard';
import {nextBillingDate} from './commercial-policy';
/** Offline billing automation: ONLY creates drafts for finance review; never issues or emails invoices. */
@UseGuards(AuthGuard) @Controller('commercial/finance')
export class FinanceAutomationController{
 constructor(private db:PrismaService){}
 @Post('generate-drafts') async generate(@Req()req:AuthRequest){requireManager(req.user);
  const candidates=await this.db.billingSchedule.findMany({where:{status:'ACTIVE',nextDueAt:{lte:new Date()},amount:{gt:0}},include:{contract:{include:{opportunity:{include:{account:{include:{contacts:true}}}}}}},take:100});
  let created=0,skipped=0;
  for(const s of candidates){
   const a=s.contract.opportunity.account;if(a.isDemo||s.contract.isDemo){skipped++;continue;}
   const billingEmail=a.contacts.find(c=>c.email&&/payable|finance|billing/i.test(c.title))?.email||a.contacts.find(c=>c.email)?.email;
   if(!billingEmail){skipped++;continue;}
   const key=`billing-draft:${s.id}:${s.nextDueAt?.toISOString().slice(0,10)}`;
   try{
    const did=await this.db.$transaction(async tx=>{
      await tx.localAutomationEvent.create({data:{key,entityType:'BILLING_SCHEDULE',entityId:s.id,action:'INVOICE_DRAFT',createdById:req.user.id}});
      const next=nextBillingDate(s.nextDueAt!,s.cadence);
      const inv=await tx.invoice.create({data:{accountId:a.id,opportunityId:s.contract.opportunityId,contractId:s.contractId,number:`DRAFT-${randomUUID()}`,currency:s.currency,lineItems:[{description:s.description,quantity:1,unitPrice:Number(s.amount)}],subtotal:s.amount!,total:s.amount!,tax:0,billingEmail:billingEmail!,createdById:req.user.id,dueAt:new Date(s.nextDueAt!.getTime()+30*86400000),status:'DRAFT'}});
      await tx.billingSchedule.update({where:{id:s.id},data:next?{nextDueAt:next}:{nextDueAt:null,status:'PAUSED'}});
      await tx.auditEvent.create({data:{actorId:req.user.id,action:'BILLING_DRAFT_PREPARED',entityType:'INVOICE',entityId:inv.id,detail:{scheduleId:s.id,invoiceNumber:inv.number}}});
      return inv.id;
    },{isolationLevel:'Serializable'});
    if(did)created++;
   }catch(e:any){if(e?.code==='P2002'){skipped++;continue;}throw e;}
  }
  return {created,skipped,issued:0,emailsSent:0,note:'Generated DRAFT invoices only. Finance must review line items and tax before issuing.'};
 }
 @Post('invoices/:id/void-draft') async voidDraft(@Req()req:AuthRequest,@Param('id')id:string){
  const inv=await this.db.invoice.findUnique({where:{id},include:{account:true,document:true}});if(!inv)throw new BadRequestException('Invoice not found.');ensureCanEdit(req.user,inv.account.ownerId);requireManager(req.user);
  if(!['DRAFT','APPROVED'].includes(inv.status)||inv.document||inv.issuedAt)throw new BadRequestException('An issued invoice cannot be silently voided; use a credit-note process.');
  await this.db.$transaction(async tx=>{await tx.invoice.update({where:{id},data:{status:'VOID'}});await tx.auditEvent.create({data:{actorId:req.user.id,action:'INVOICE_VOIDED_BEFORE_ISSUE',entityType:'INVOICE',entityId:id}});});
  return {status:'VOID',note:'Voided before issue, no financial document was sent.'};
 }
}
