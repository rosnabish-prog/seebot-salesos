import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmailConnectionService } from '../integrations/google/gmail-connection.service';
import { InvoicePdfService } from '../invoices/invoice-pdf.service';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

export interface OutgoingRequest {
  recipientEmail:string; subject:string; bodyText:string; category:string; entityType:string; entityId:string;
  organizationId?:string|null; attachmentInvoiceId?:string|null; attachmentContractDocumentId?:string|null; idempotencyKey:string;
}

@Injectable()
export class OutgoingMessageService {
  constructor(private db:PrismaService,private gmail:GmailConnectionService,private pdf:InvoicePdfService){}
  async draft(userId:string,request:OutgoingRequest){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.recipientEmail)||request.recipientEmail.length>254)throw new BadRequestException('Valid recipient email required.');
    if(!request.subject?.trim()||request.subject.length>250||/[\r\n]/.test(request.subject)||!request.bodyText?.trim()||request.bodyText.length>30000)throw new BadRequestException('Invalid email content.');
    const record=await this.db.outgoingMessage.upsert({
      where:{idempotencyKey:request.idempotencyKey},
      create:{createdById:userId,organizationId:request.organizationId||null,recipientEmail:request.recipientEmail.toLowerCase().trim(),attachmentInvoiceId:request.attachmentInvoiceId||null,attachmentContractDocumentId:request.attachmentContractDocumentId||null,subject:request.subject,bodyText:request.bodyText,category:request.category,entityType:request.entityType,entityId:request.entityId,idempotencyKey:request.idempotencyKey},
      update:{}
    });
    if(record.createdById!==userId)throw new ForbiddenException('Delivery key belongs to another user.');
    return record;
  }
  async send(messageId:string,actorId:string){
    const draft=await this.db.outgoingMessage.findUnique({where:{id:messageId}});
    if(!draft)throw new BadRequestException('Message not found.');
    if(draft.createdById!==actorId)throw new ForbiddenException('Only the initiating employee can send through their connected mailbox.');
    const actor=await this.db.user.findUnique({where:{id:actorId},select:{active:true}});
    if(!actor?.active)throw new ForbiddenException('The sender account is inactive.');
    if(draft.status==='SENT')return {status:'SENT',messageId:draft.id,providerMessageId:draft.providerMessageId};
    if(draft.category==='CONTRACT_SIGNING_INVITATION'){
      const env=await this.db.signingEnvelope.findUnique({where:{id:draft.entityId}});
      if(!env||env.status!=='INVITED'||env.revokedAt||env.expiresAt<=new Date())throw new BadRequestException('Signing invitation was revoked, completed or expired.');
    }
    if(draft.category==='WORKSPACE_INVITATION'){
      const invitation=await this.db.workspaceInvitation.findUnique({where:{id:draft.entityId}});
      if(!invitation||invitation.status!=='PENDING'||invitation.expiresAt<=new Date()||invitation.organizationId!==draft.organizationId||invitation.email!==draft.recipientEmail)
        throw new BadRequestException('Workspace invitation is no longer valid.');
    }
    if(draft.category==='EMPLOYEE_INVITATION'){
      const inv=await this.db.employeeInvitation.findUnique({where:{id:draft.entityId}});
      if(!inv||inv.status!=='PENDING'||inv.expiresAt<=new Date())throw new BadRequestException('Employee invitation has already been used or has expired.');
    }
    if(draft.category==='CLIENT_SURVEY'){
      const invite=await this.db.clientSurveyInvitation.findUnique({where:{id:draft.entityId}});
      if(!invite||invite.status!=='DRAFT'||invite.expiresAt<=new Date()||invite.isDemo)throw new BadRequestException('Survey invitation is unavailable or expired.');
    }
    if(draft.category==='INVOICE_REMINDER'){
      const invoice=await this.db.invoice.findUnique({where:{id:draft.entityId},include:{payments:true,adjustments:true,reminders:true}});
      const paid=(invoice?.payments.reduce((sum,p)=>sum+Number(p.amount),0)||0)+(invoice?.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((sum,a)=>sum+Number(a.amount),0)||0);
      if(!invoice||invoice.isDemo||!['SENT','PARTIALLY_PAID'].includes(invoice.status)||Number(invoice.total)-paid<=0||invoice.dueAt>=new Date()||!invoice.reminders.some(r=>r.status==='APPROVED'&&draft.idempotencyKey===`invoice-reminder:${r.id}`))
        throw new BadRequestException('Reminder blocked: finance approval, actual overdue balance and an active invoice are required.');
    }
    if(draft.category==='INVOICE_NOTICE'){
      const inv=await this.db.invoice.findUnique({where:{id:draft.entityId},include:{document:true}});
      if(!inv||inv.isDemo||!inv.document||!['APPROVED','SENT'].includes(inv.status))throw new BadRequestException('Invoice is not approved for sending.');
    }
    const locked=await this.db.outgoingMessage.updateMany({where:{id:messageId,status:{in:['DRAFT','FAILED']}},data:{status:'SENDING',attempts:{increment:1},errorMessage:null}});
    if(locked.count!==1)throw new ConflictException('This message is already processing.');
    try{
      const attachment=draft.attachmentInvoiceId?await this.pdf.getVerifiedDocument(draft.attachmentInvoiceId):null;
      let signedPdf:{fileName:string;bytes:Buffer}|undefined;
      if(draft.attachmentContractDocumentId){
        const doc=await this.db.contractDocument.findUnique({where:{id:draft.attachmentContractDocumentId}});
        if(!doc||doc.kind!=='EXECUTED')throw new BadRequestException('Executed document is required for email attachment.');
        if(!doc.verifiedAt){
          const verifiedSigning=await this.db.signingEnvelope.findFirst({where:{signedDocumentId:doc.id,status:'SIGNED',recipientEmail:draft.recipientEmail}});
          if(!verifiedSigning)throw new BadRequestException('Document has not been verified or securely executed by the recipient.');
        }
        const bytes=await readFile(path.join(process.env.DOCUMENT_STORAGE_DIR||path.resolve(process.cwd(),'private-contract-documents'),doc.storageKey));
        if(createHash('sha256').update(bytes).digest('hex')!==doc.sha256)throw new BadRequestException('Contract PDF integrity failure.');
        signedPdf={fileName:doc.fileName,bytes};
      }
      const file=attachment?{fileName:`${attachment.record.invoiceNumber}.pdf`,bytes:attachment.bytes}:signedPdf;
      const providerId=await this.gmail.send(actorId,draft.recipientEmail,draft.subject,draft.bodyText,file);
      const conn=await this.db.gmailConnection.findUnique({where:{userId:actorId}});
      await this.db.$transaction(async tx=>{
        await tx.outgoingMessage.update({where:{id:messageId},data:{status:'SENT',sentAt:new Date(),providerMessageId:providerId,gmailConnectionId:conn?.id}});
        if(draft.category==='CLIENT_SURVEY')await tx.clientSurveyInvitation.update({where:{id:draft.entityId},data:{status:'SENT',sentAt:new Date()}});
        if(draft.category==='INVOICE_REMINDER') { const rid=draft.idempotencyKey.split(':')[1];await tx.invoiceReminder.update({where:{id:rid},data:{status:'SENT',sentAt:new Date()}}); }
        await tx.auditEvent.create({data:{actorId,action:'GMAIL_MESSAGE_SENT',entityType:draft.entityType,entityId:draft.entityId,detail:{outgoingMessageId:messageId,category:draft.category,recipientEmail:draft.recipientEmail,providerMessageId:providerId}}});
      });
      return {status:'SENT',messageId:draft.id,providerMessageId:providerId};
    }catch(err){
      // Network uncertainty means a retry MAY duplicate a message. Manual review is required.
      await this.db.outgoingMessage.update({where:{id:messageId},data:{status:'FAILED',errorMessage:err instanceof Error?err.message.slice(0,500):'Delivery failed'}});
      throw err;
    }
  }
  async status(messageId:string,actorId:string){return this.db.outgoingMessage.findFirst({where:{id:messageId,createdById:actorId},select:{id:true,category:true,recipientEmail:true,subject:true,status:true,attempts:true,sentAt:true,providerMessageId:true,errorMessage:true}});}
}
