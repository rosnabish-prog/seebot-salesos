import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Post,Req,Res,StreamableFile,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import type {AuthRequest} from '../common/auth.guard';
import {InvoicePdfService} from '../invoices/invoice-pdf.service';
import {OutgoingMessageService} from '../communications/outgoing-message.service';
import {amountMinor,receiptJournal} from './journal-policy';
import {receivableMinor} from './receivable-policy';
import {writeJournal} from './journal.service';
type ScopedRequest=AuthRequest & {selectedWorkspace?:string|null};
/** Tenant finance endpoints never delegate authorization to a global role. */
@UseGuards(IdentityGuard) @Controller('workspace-finance')
export class TenantInvoicesController{
 constructor(private db:PrismaService,private pdf:InvoicePdfService,private outbox:OutgoingMessageService){}
 private async finance(req:ScopedRequest,orgId:string){
  if(req.selectedWorkspace!==orgId)throw new ForbiddenException('Select the issuing organization.');
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}},include:{organization:{select:{status:true}}}});
  if(!member||member.status!=='ACTIVE'||!['SETUP','ACTIVE'].includes(member.organization.status)||!['OWNER','ADMIN','FINANCE'].includes(member.role))throw new ForbiddenException('Organization finance approval required.');
 }
 private async invoice(orgId:string,id:string){
  const inv=await this.db.invoice.findFirst({where:{id,account:{organizationId:orgId}},include:{account:true,taxReview:true,document:true,payments:true,adjustments:true,recipients:true}});
  if(!inv)throw new BadRequestException('Invoice unavailable in this workspace.');
  return inv;
 }
 @Post(':orgId/invoices/:id/approve')async approve(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.finance(req,orgId);const inv=await this.invoice(orgId,id);
  if(inv.status!=='DRAFT'||!inv.taxReview||inv.issuedAt||inv.document)throw new BadRequestException('Tax-reviewed, unissued draft required.');
  if(inv.taxReview.reviewedSubtotal.cmp(inv.subtotal)!==0||inv.taxReview.reviewedTax.cmp(inv.tax)!==0||inv.taxReview.reviewedTotal.cmp(inv.total)!==0)throw new BadRequestException('Invoice has changed since finance tax review.');
  return this.db.$transaction(async tx=>{
   const claimed=await tx.invoice.updateMany({where:{id,status:'DRAFT',issuedAt:null,account:{organizationId:orgId}},data:{status:'APPROVED'}});
   if(claimed.count!==1)throw new BadRequestException('Invoice was modified while awaiting approval.');
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'INVOICE',entityId:id,action:'TENANT_INVOICE_APPROVED',detail:{organizationId:orgId,taxReviewId:inv.taxReview?.id}}});
   return {invoiceId:id,status:'APPROVED'};
  },{isolationLevel:'Serializable'});
 }
 @Post(':orgId/invoices/:id/issue')async issue(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.finance(req,orgId);await this.invoice(orgId,id);
  return this.pdf.issue(id,req.user.id);
 }
 @Get(':orgId/invoices/:id/pdf')async document(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Res({passthrough:true})res:Response){
  await this.finance(req,orgId);await this.invoice(orgId,id);
  const {bytes,record}=await this.pdf.getVerifiedDocument(id);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="${record.invoiceNumber}.pdf"`);
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  return new StreamableFile(bytes);
 }
 /** Send through the finance operator's separately authorized Gmail connection. */
 @Post(':orgId/invoices/:id/email')async email(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.finance(req,orgId);const invoice=await this.invoice(orgId,id);
  if(invoice.isDemo||!invoice.document||!['APPROVED','SENT'].includes(invoice.status))throw new BadRequestException('A real approved and issued invoice PDF is required.');
  const recipients=[invoice.billingEmail,...invoice.recipients.map(r=>r.email)].filter((v,i,a)=>a.findIndex(x=>x.toLowerCase()===v.toLowerCase())===i);
  const results:{email:string;status:string}[]=[];
  let primarySent=false;
  for(const [index,recipientEmail] of recipients.entries()){
   try{
    const draft=await this.outbox.draft(req.user.id,{
     organizationId:orgId,recipientEmail,category:'INVOICE_NOTICE',entityType:'INVOICE',entityId:id,
     idempotencyKey:`invoice-mail:${orgId}:${id}:${recipientEmail.toLowerCase()}`,
     subject:`Invoice ${invoice.number} — ${invoice.account.name}`,
     bodyText:`Please find attached invoice ${invoice.number} for ${invoice.currency} ${invoice.total}, due ${invoice.dueAt.toISOString().slice(0,10)}.\n\nPlease contact our finance team regarding queries.`,
     attachmentInvoiceId:id
    });
    const sent=await this.outbox.send(draft.id,req.user.id);
    results.push({email:recipientEmail,status:sent.status});
    if(index===0&&sent.status==='SENT')primarySent=true;
   }catch(e){
    results.push({email:recipientEmail,status:'FAILED'});
    if(index===0)break;
   }
  }
  if(primarySent){
   await this.db.invoice.updateMany({where:{id,status:'APPROVED',account:{organizationId:orgId}},data:{status:'SENT',sentAt:new Date()}});
  }
  return {invoiceId:id,status:primarySent?'SENT':'FAILED',delivery:results,note:primarySent?'Primary billing address received a provider-confirmed send. Review additional recipient delivery statuses.':'No successful primary delivery was recorded; confirm Gmail configuration before retrying.'};
 }
 /** Confirmation of an ACTUAL external send only, never an email-dispatch claim. */
 @Post(':orgId/invoices/:id/record-external-send')async sent(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.finance(req,orgId);
  const invoice=await this.invoice(orgId,id);
  const reference=String(body?.reference||'').trim();
  if(invoice.isDemo||!invoice.document||invoice.status!=='APPROVED'||reference.length<5||reference.length>250)throw new BadRequestException('Issued, approved invoice and verified external sending reference required.');
  return this.db.$transaction(async tx=>{
   const updated=await tx.invoice.updateMany({where:{id,account:{organizationId:orgId},status:'APPROVED'},data:{status:'SENT',sentAt:new Date()}});
   if(updated.count!==1)throw new BadRequestException('Invoice changed during send confirmation.');
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'INVOICE',entityId:id,action:'EXTERNALLY_SENT_INVOICE_RECORDED',detail:{organizationId:orgId,reference}}});
   return {status:'SENT',emailDispatchedBySalesOS:false,reference};
  },{isolationLevel:'Serializable'});
 }
 @Post(':orgId/invoices/:id/payments')async payment(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string,@Body()body:any){
  await this.finance(req,orgId);
  const cents=amountMinor(body?.amount),paidAt=new Date(body?.paidAt);
  const reference=String(body?.reference||'').trim();
  if(!Number.isFinite(paidAt.getTime())||reference.length<3||reference.length>250)throw new BadRequestException('Valid payment date and reference required.');
  return this.db.$transaction(async tx=>{
   const current=await tx.invoice.findFirst({where:{id,account:{organizationId:orgId}},include:{payments:true,adjustments:true,document:true}});
   if(!current||!current.document||!['SENT','PARTIALLY_PAID'].includes(current.status))throw new BadRequestException('Invoice has not been issued or recorded as sent.');
   const due=receivableMinor(current).due;
   if(cents>due)throw new BadRequestException('Payment cannot exceed outstanding balance.');
   const amount=(cents/100).toFixed(2);
   const record=await tx.paymentRecord.create({data:{invoiceId:id,amount,paidAt,reference,recordedById:req.user.id,isDemo:current.isDemo}});
   if(!current.isDemo)await writeJournal(tx,{organizationId:orgId,externalKey:`payment:${record.id}`,sourceType:'PAYMENT',sourceId:record.id,currency:current.currency,memo:`Manually verified receipt: ${reference}`,postedById:req.user.id,lines:receiptJournal(amount)});
   const remaining=due-cents,status=remaining===0?'PAID':'PARTIALLY_PAID';
   await tx.invoice.update({where:{id},data:{status}});
   if(remaining===0)await tx.invoiceReminder.updateMany({where:{invoiceId:id,status:'PENDING_APPROVAL'},data:{status:'CANCELLED_PAYMENT_RECORDED'}});
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'INVOICE',entityId:id,action:'PAYMENT_MANUALLY_RECORDED',detail:{organizationId:orgId,amount,paidAt:paidAt.toISOString(),reference,remainingMinor:remaining}}});
   return {paymentId:record.id,status,remainingMinor:remaining};
  },{isolationLevel:'Serializable'});
 }
 @Get(':orgId/invoices/:id/payment-history')async history(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('id')id:string){
  await this.finance(req,orgId);const inv=await this.invoice(orgId,id);
  return {invoiceId:id,status:inv.status,currency:inv.currency,amountInvoiced:inv.total.toString(),amountRemainingMinor:receivableMinor(inv).due,payments:inv.payments.map(p=>({id:p.id,amount:p.amount.toString(),paidAt:p.paidAt,reference:p.reference,recordedById:p.recordedById}))};
 }
}
