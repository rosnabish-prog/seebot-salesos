import {isPlainEmail} from '../common/email';
import {WorkspaceAccessService,type WorkspacePermission} from '../workspace/workspace-access.service';
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
  constructor(private db:PrismaService,private gmail:GmailConnectionService,private pdf:InvoicePdfService,private access:WorkspaceAccessService){}
  private async authorize(userId:string,request:OutgoingRequest){
    let organizationId=request.organizationId||null,entityOrganizationId:string|null=null;
    if(request.entityType==='OUTREACH_DRAFT'){
      const d=await this.db.outreachDraft.findUnique({where:{id:request.entityId},include:{account:true,contact:true}});
      if(!d||d.contact?.optedOut||!d.contact?.email||d.contact.email.toLowerCase()!==request.recipientEmail.toLowerCase())throw new ForbiddenException('Outreach contact is unavailable or opted out.');
      entityOrganizationId=d.account.organizationId;
    }else if(request.entityType==='INVOICE'){
      const invoice=await this.db.invoice.findUnique({where:{id:request.entityId},include:{account:true,recipients:true}});
      if(!invoice||![invoice.billingEmail,...invoice.recipients.map(r=>r.email)].map(e=>e.toLowerCase()).includes(request.recipientEmail.toLowerCase()))throw new ForbiddenException('Invoice recipient is unavailable.');
      entityOrganizationId=invoice.account.organizationId;
    }else if(request.entityType==='CLIENT_SURVEY'){
      const survey=await this.db.clientSurveyInvitation.findUnique({where:{id:request.entityId},include:{account:true}});entityOrganizationId=survey?.account.organizationId||null;
      if(!survey||survey.recipientEmail.toLowerCase()!==request.recipientEmail.toLowerCase())throw new ForbiddenException('Survey recipient is unavailable.');
    }else if(request.entityType==='WORKSPACE_INVITATION'){
      const invite=await this.db.workspaceInvitation.findUnique({where:{id:request.entityId}});entityOrganizationId=invite?.organizationId||null;
    }else if(request.entityType==='EMPLOYEE_INVITATION'){
      const invite=await this.db.employeeInvitation.findUnique({where:{id:request.entityId}});entityOrganizationId=invite?.organizationId||null;
    }else if(request.entityType==='SIGNING_ENVELOPE'){
      const env=await this.db.signingEnvelope.findUnique({where:{id:request.entityId},include:{contract:{include:{opportunity:{include:{account:true}}}}}});entityOrganizationId=env?.contract.opportunity.account.organizationId||null;
    }else if(request.entityType==='CONTRACT'){
      const contract=await this.db.contract.findUnique({where:{id:request.entityId},include:{opportunity:{include:{account:true}}}});entityOrganizationId=contract?.opportunity.account.organizationId||null;
    }
    if(!entityOrganizationId||organizationId&&organizationId!==entityOrganizationId)throw new ForbiddenException('Message entity does not belong to this workspace.');
    organizationId=entityOrganizationId;
    const permission:WorkspacePermission=['WORKSPACE_INVITATION','EMPLOYEE_INVITATION'].includes(request.category)?'admin':['INVOICE_NOTICE','INVOICE_REMINDER'].includes(request.category)?'finance':'sales';
    const user=await this.db.user.findUnique({where:{id:userId},select:{id:true,name:true,email:true,role:true,active:true}});
    if(!user?.active)throw new ForbiddenException('Sender account is inactive.');
    await this.access.require({user,selectedWorkspace:organizationId} as any,organizationId,permission);
    if(request.attachmentInvoiceId){
      const invoice=await this.db.invoice.findFirst({where:{id:request.attachmentInvoiceId,account:{organizationId}}});
      if(!invoice||request.entityType!=='INVOICE'||invoice.id!==request.entityId)throw new ForbiddenException('Invoice attachment is outside the message scope.');
    }
    if(request.attachmentContractDocumentId){
      if(!['CONTRACT','SIGNING_ENVELOPE'].includes(request.entityType))throw new ForbiddenException('Contract attachments require a contract-scoped message.');
      const doc=await this.db.contractDocument.findFirst({where:{id:request.attachmentContractDocumentId,contract:{opportunity:{account:{organizationId}}}}});
      if(!doc)throw new ForbiddenException('Contract attachment is outside the message scope.');
      if(request.entityType==='CONTRACT'&&doc.contractId!==request.entityId)throw new ForbiddenException('Contract attachment does not match the message.');
      if(request.entityType==='SIGNING_ENVELOPE'){
       const envelope=await this.db.signingEnvelope.findUnique({where:{id:request.entityId}});
       if(envelope?.contractId!==doc.contractId)throw new ForbiddenException('Signing attachment does not match the message.');
      }
    }
    return organizationId;
  }
  async draft(userId:string,request:OutgoingRequest){
    if(!isPlainEmail(request.recipientEmail))throw new BadRequestException('Valid recipient email required.');
    if(!request.subject?.trim()||request.subject.length>250||/[\r\n]/.test(request.subject)||!request.bodyText?.trim()||request.bodyText.length>30000)throw new BadRequestException('Invalid email content.');
    const organizationId=await this.authorize(userId,request);
    const record=await this.db.outgoingMessage.upsert({
      where:{idempotencyKey:request.idempotencyKey},
      create:{createdById:userId,organizationId,recipientEmail:request.recipientEmail.toLowerCase().trim(),attachmentInvoiceId:request.attachmentInvoiceId||null,attachmentContractDocumentId:request.attachmentContractDocumentId||null,subject:request.subject,bodyText:request.bodyText,category:request.category,entityType:request.entityType,entityId:request.entityId,idempotencyKey:request.idempotencyKey},
      update:{}
    });
    if(record.organizationId!==organizationId)throw new ForbiddenException('Delivery key belongs to another workspace.');
    if(record.createdById!==userId)throw new ForbiddenException('Delivery key belongs to another user.');
    return record;
  }
  async send(messageId:string,actorId:string,expectedOrganizationId?:string){
    const draft=await this.db.outgoingMessage.findUnique({where:{id:messageId}});
    if(!draft)throw new BadRequestException('Message not found.');
    if(expectedOrganizationId&&draft.organizationId!==expectedOrganizationId)throw new ForbiddenException('Select the message workspace.');
    if(draft.createdById!==actorId)throw new ForbiddenException('Only the initiating employee can send through their connected mailbox.');
    const actor=await this.db.user.findUnique({where:{id:actorId},select:{active:true}});
    if(!actor?.active)throw new ForbiddenException('The sender account is inactive.');
    await this.authorize(actorId,draft);
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
        await tx.auditEvent.create({data:{actorId,action:'GMAIL_MESSAGE_SENT',entityType:draft.entityType,entityId:draft.entityId,detail:{organizationId:draft.organizationId,outgoingMessageId:messageId,category:draft.category,recipientEmail:draft.recipientEmail,providerMessageId:providerId}}});
      });
      return {status:'SENT',messageId:draft.id,providerMessageId:providerId};
    }catch(err){
      // Network uncertainty means a retry MAY duplicate a message. Manual review is required.
      await this.db.outgoingMessage.update({where:{id:messageId},data:{status:'FAILED',errorMessage:err instanceof Error?err.message.slice(0,500):'Delivery failed'}});
      throw err;
    }
  }
  async status(messageId:string,actorId:string,organizationId?:string){return this.db.outgoingMessage.findFirst({where:{id:messageId,createdById:actorId,...(organizationId?{organizationId}:{})},select:{id:true,category:true,recipientEmail:true,subject:true,status:true,attempts:true,sentAt:true,providerMessageId:true,errorMessage:true}});}
}
