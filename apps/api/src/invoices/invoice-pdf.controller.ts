import { BadRequestException, Controller, Get, Param, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard,AuthRequest,ensureOwner,requireManager } from '../common/auth.guard';
import { OutgoingMessageService } from '../communications/outgoing-message.service';
import { InvoicePdfService } from './invoice-pdf.service';

@UseGuards(AuthGuard) @Controller('invoice-documents')
export class InvoicePdfController {
  constructor(private db:PrismaService,private pdf:InvoicePdfService,private outbox:OutgoingMessageService){}
  private async authorize(user:AuthRequest['user'],id:string){
    const inv=await this.db.invoice.findUnique({where:{id},include:{account:true,document:true,recipients:true}});
    if(!inv||inv.account.organizationId!==user.organizationId)throw new BadRequestException('Invoice not found.');ensureOwner(user,inv.account.ownerId);return inv;
  }
  @Post(':id/issue') async issue(@Req()req:AuthRequest,@Param('id')id:string){await this.authorize(req.user,id);requireManager(req.user);return this.pdf.issue(id,req.user.id);}
  @Get(':id/pdf') async download(@Req()req:AuthRequest,@Param('id')id:string,@Res({passthrough:true})res:Response){
    await this.authorize(req.user,id);const {bytes,record}=await this.pdf.getVerifiedDocument(id);
    res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Disposition',`attachment; filename="${record.invoiceNumber}.pdf"`);
    res.setHeader('X-Content-Type-Options','nosniff');return new StreamableFile(bytes);
  }
  @Post(':id/email') async email(@Req()req:AuthRequest,@Param('id')id:string){
    const inv=await this.authorize(req.user,id);requireManager(req.user);
    if(inv.isDemo||inv.status!=='APPROVED'||!inv.document)throw new BadRequestException('Invoice PDF must be issued before sharing by email.');
    const msg=await this.outbox.draft(req.user.id,{recipientEmail:inv.billingEmail,subject:`Invoice ${inv.number} — ${inv.account.name}`,bodyText:`Please find attached invoice ${inv.number} for ${inv.currency} ${inv.total}, issued to ${inv.account.name}. Payment due: ${new Date(inv.dueAt).toISOString().slice(0,10)}. Please contact Seebot if you have any questions.`,attachmentInvoiceId:inv.id,category:'INVOICE_NOTICE',entityType:'INVOICE',entityId:inv.id,idempotencyKey:`invoice-notice:${inv.id}`});
    const result=await this.outbox.send(msg.id,req.user.id);
    if(result.status!=='SENT')return {status:result.status,invoiceNumber:inv.number,deliveryFailed:true,notice:'Invoice was not sent. Review Gmail connection and retry the same message.'};
    const deliveries=[{email:inv.billingEmail,status:result.status}];
    for(const recipient of inv.recipients.filter(r=>r.email.toLowerCase()!==inv.billingEmail.toLowerCase())){
      try{
        const follow=await this.outbox.draft(req.user.id,{recipientEmail:recipient.email,subject:`Invoice ${inv.number} — ${inv.account.name}`,bodyText:`Please find attached invoice ${inv.number} for ${inv.account.name}. Payment is due on ${new Date(inv.dueAt).toISOString().slice(0,10)}.`,attachmentInvoiceId:inv.id,category:'INVOICE_NOTICE',entityType:'INVOICE',entityId:inv.id,idempotencyKey:`invoice-notice:${inv.id}:${recipient.id}`});
        const sent=await this.outbox.send(follow.id,req.user.id);deliveries.push({email:recipient.email,status:sent.status});
      }catch{deliveries.push({email:recipient.email,status:'FAILED'});}
    }
    await this.db.invoice.update({where:{id},data:{status:'SENT',sentAt:new Date()}});
    return {...result,invoiceNumber:inv.number,deliveries,notice:deliveries.some(d=>d.status!=='SENT')?'Primary invoice sent. Some additional recipients failed; inspect outbound message records and retry safely.':'Invoice PDF delivered to all selected billing recipients.'};
  }
}
