import {writeJournal} from '../accounting/journal.service';
import {receiptJournal} from '../accounting/journal-policy';
import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunityWorkflowService } from '../opportunities/workflow.service';
import { AuthGuard, AuthRequest, allowManageAll, ensureCanEdit, ensureOwner, requireManager } from '../common/auth.guard';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Response } from 'express';
const storageDir = process.env.DOCUMENT_STORAGE_DIR || path.resolve(process.cwd(), 'private-contract-documents');
function text(value:unknown,max=1000){return typeof value==='string'?value.trim().slice(0,max):'';}
function validDate(value:unknown,name:string){const date=new Date(String(value));if(!value||!Number.isFinite(date.valueOf()))throw new BadRequestException(`Invalid ${name}.`);return date;}
function money(value:unknown,label:string,positive=true){const n=Number(value);if(value===undefined||value===null||value===''||!Number.isFinite(n)||n<0||(positive&&n===0)||!Number.isInteger(Math.round(n*100))||Math.abs(n)>1e10)throw new BadRequestException(`Invalid ${label}.`);return Math.round(n*100)/100;}
function iso(value:string){if(!/^[A-Z]{3}$/.test(value||''))throw new BadRequestException('Three-letter currency code required.');return value;}
function invoiceBalance(invoice:{total:unknown;payments:{amount:unknown}[];adjustments?:{amount:unknown;status:string;kind:string}[]}){const paid=invoice.payments.reduce((sum,p)=>sum+Number(p.amount),0),credited=(invoice.adjustments||[]).filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((sum,a)=>sum+Number(a.amount),0);return {paid:+paid.toFixed(2),credited:+credited.toFixed(2),balance:+Math.max(0,Number(invoice.total)-paid-credited).toFixed(2)};}
function effectiveInvoice(invoice:any){const totals=invoiceBalance(invoice);const overdue=['SENT','PARTIALLY_PAID'].includes(invoice.status)&&totals.balance>0&&new Date(invoice.dueAt)<new Date();return {...invoice,...totals,effectiveStatus:overdue?'OVERDUE':totals.balance===0&&invoice.status!=='DRAFT'?'PAID':invoice.status};}
const writeRoles = new Set(['SUPER_ADMIN','SALES_MANAGER','SALES_REP']);
@UseGuards(AuthGuard) @Controller('clients')
export class ClientsController {
 constructor(private db:PrismaService,private flow:OpportunityWorkflowService){}
 private async account(req:AuthRequest,id:string,edit=false){const a=await this.db.account.findUnique({where:{id}});if(!a||a.organizationId!==req.user.organizationId)throw new BadRequestException('Account not found.');if(edit)ensureCanEdit(req.user,a.ownerId);else ensureOwner(req.user,a.ownerId);return a;}
 private async contract(req:AuthRequest,id:string,edit=false){const c=await this.db.contract.findUnique({where:{id},include:{opportunity:{include:{account:true}}}});if(!c||c.opportunity.account.organizationId!==req.user.organizationId)throw new BadRequestException('Contract not found.');if(edit)ensureCanEdit(req.user,c.opportunity.ownerId);else ensureOwner(req.user,c.opportunity.ownerId);return c;}
 private async invoice(req:AuthRequest,id:string,edit=false){const i=await this.db.invoice.findUnique({where:{id},include:{account:true,payments:true,adjustments:true,reminders:{orderBy:{scheduledFor:'desc'}}}});if(!i||i.account.organizationId!==req.user.organizationId)throw new BadRequestException('Invoice not found.');if(edit)ensureCanEdit(req.user,i.account.ownerId);else ensureOwner(req.user,i.account.ownerId);return i;}
 @Get() async list(@Req()req:AuthRequest,@Query('includeDemo')includeDemo?:string){return this.db.account.findMany({where:{organizationId:req.user.organizationId,status:'Customer',...(includeDemo==='true'?{}:{isDemo:false}),...(allowManageAll(req.user)?{}:{ownerId:req.user.id})},include:{owner:{select:{name:true}},contacts:{select:{id:true,name:true,title:true,email:true,verified:true}},opportunities:{select:{id:true,stage:true,status:true,contractedAmount:true,currency:true}},clientReviews:{where:{type:'NPS'},orderBy:{occurredAt:'desc'},take:1},clientIssues:{where:{status:'OPEN'},select:{id:true,severity:true}},invoices:{select:{id:true,total:true,status:true,dueAt:true,currency:true}}},orderBy:{updatedAt:'desc'},take:200});}
 @Get(':id') async detail(@Req()req:AuthRequest,@Param('id')id:string){await this.account(req,id);const data=await this.db.account.findUnique({where:{id},include:{owner:{select:{id:true,name:true}},contacts:{orderBy:{createdAt:'desc'}},opportunities:{include:{contracts:{include:{documents:{select:{id:true,fileName:true,sha256:true,kind:true,uploadedAt:true,verifiedAt:true}},signatureEvents:{orderBy:{occurredAt:'asc'}}}},owner:{select:{name:true}}},orderBy:{createdAt:'desc'}},invoices:{include:{document:{select:{id:true,invoiceNumber:true,sha256:true,createdAt:true}},adjustments:true,payments:{orderBy:{paidAt:'desc'}},reminders:{orderBy:{scheduledFor:'desc'}}},orderBy:{createdAt:'desc'}},clientReviews:{orderBy:{occurredAt:'desc'}},clientIssues:{orderBy:{createdAt:'desc'}}}});if(!data)return null;return {...data,invoices:data.invoices.map(effectiveInvoice)};}
 @Get('contracts/:id') async getContract(@Req()req:AuthRequest,@Param('id')id:string){await this.contract(req,id);return this.db.contract.findUnique({where:{id},include:{documents:{orderBy:{uploadedAt:'desc'}},signatureEvents:{orderBy:{occurredAt:'asc'}}}});}
 @Post('contracts/:id/signature-events') async signatureEvent(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{event:string;signerName?:string;signerEmail?:string;notes?:string}){
   const c=await this.contract(req,id,true);if(!c.isDemo)throw new BadRequestException('Live signing is not connected. Upload a genuine signed PDF instead; never simulate real signature events.');
   if(!['DEMO_SENT','DEMO_VIEWED','DEMO_SIGNED','DEMO_DECLINED'].includes(body.event))throw new BadRequestException('Invalid demo signing event.');
   return this.db.contractSignatureEvent.create({data:{contractId:id,event:body.event,signerName:text(body.signerName,120)||null,signerEmail:text(body.signerEmail,254)||null,notes:text(body.notes,1000)||null,recordedById:req.user.id,source:'DEMO_ONLY',isDemo:true}});
 }
 @Post('contracts/:id/documents') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024}})) async upload(@Req()req:AuthRequest,@Param('id')id:string,@UploadedFile()file:any,@Body()body:{kind?:string}){
   const c=await this.contract(req,id,true);
   if(!file?.buffer||file.buffer.length<8||file.buffer.subarray(0,5).toString()!=='%PDF-')throw new BadRequestException('Upload a valid PDF up to 10 MB.');
   const kind=['EXECUTED','DRAFT','AMENDMENT','OTHER'].includes(body.kind||'')?body.kind!:'EXECUTED';
   const storageKey=randomUUID()+'.pdf';const sha256=createHash('sha256').update(file.buffer).digest('hex');
   mkdirSync(storageDir,{recursive:true,mode:0o700});const finalPath=path.join(storageDir,storageKey);
   await fs.writeFile(finalPath,file.buffer,{flag:'wx',mode:0o600});
   try { const doc=await this.db.contractDocument.create({data:{contractId:id,fileName:path.basename(file.originalname||'contract.pdf').slice(0,200),storageKey,mimeType:'application/pdf',size:file.buffer.length,sha256,kind,uploadedById:req.user.id}});
     await this.db.auditEvent.create({data:{actorId:req.user.id,action:'CONTRACT_PDF_UPLOADED',entityType:'CONTRACT',entityId:id,detail:{documentId:doc.id,sha256,kind}}});return doc;
   }catch(e){await fs.unlink(finalPath).catch(()=>{});throw e;}
 }
 @Get('documents/:id/download') async download(@Req()req:AuthRequest,@Param('id')id:string,@Res({passthrough:true})res:Response){const document=await this.db.contractDocument.findUnique({where:{id},include:{contract:{include:{opportunity:true}}}});if(!document)throw new BadRequestException('Document not found.');const account=await this.db.account.findFirst({where:{id:document.contract.opportunity.accountId,organizationId:req.user.organizationId}});if(!account)throw new ForbiddenException('Document unavailable in this organization.');ensureOwner(req.user,document.contract.opportunity.ownerId);const filename=path.join(storageDir,document.storageKey);if(!existsSync(filename))throw new BadRequestException('Document file missing from secure storage.');const safe=document.fileName.replace(/[\r\n"\\]/g,'_');res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${safe}"`);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return new StreamableFile(createReadStream(filename));}
 @Post('contracts/:id/documents/:docId/verify') async verify(@Req()req:AuthRequest,@Param('id')id:string,@Param('docId')docId:string){const contract=await this.contract(req,id);requireManager(req.user);const doc=await this.db.contractDocument.findFirst({where:{id:docId,contractId:id,kind:'EXECUTED'}});if(!doc)throw new BadRequestException('Executed contract PDF missing.');return this.db.$transaction(async tx=>{const d=await tx.contractDocument.update({where:{id:docId},data:{verifiedById:req.user.id,verifiedAt:new Date()}});await tx.auditEvent.create({data:{actorId:req.user.id,action:'SIGNED_DOCUMENT_MANUALLY_VERIFIED',entityType:'CONTRACT',entityId:id,detail:{documentId:docId,sha256:doc.sha256}}});return d;});}
 @Post('contracts/:id/confirm-signed') async confirmSigned(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{documentId:string;signedAt:string;notes?:string}){
   const c=await this.contract(req,id);requireManager(req.user);
   if(c.status==='SIGNED')throw new BadRequestException('Contract already marked signed.');
   const doc=await this.db.contractDocument.findFirst({where:{id:body.documentId,contractId:id,kind:'EXECUTED',verifiedAt:{not:null}}});
   if(!doc)throw new BadRequestException('A manually verified executed PDF is required.');
   const signedAt=validDate(body.signedAt,'actual signing date');if(signedAt>new Date())throw new BadRequestException('Signing date cannot be in the future.');
   await this.db.$transaction(async tx=>{
     await tx.contract.update({where:{id},data:{status:'SIGNED',signedAt,evidenceReference:`document:${doc.id}:${doc.sha256}`}});
     await tx.contractSignatureEvent.create({data:{contractId:id,event:c.isDemo?'DEMO_MANUAL_SIGNATURE_CONFIRMATION':'SIGNED_DOCUMENT_MANUALLY_CONFIRMED',source:'MANUAL_DOCUMENT_REVIEW',externalReference:doc.id,isDemo:c.isDemo,notes:text(body.notes,1000),occurredAt:signedAt,recordedById:req.user.id}});
     await tx.auditEvent.create({data:{actorId:req.user.id,action:'CONTRACT_SIGNED_WITH_VERIFIED_PDF',entityType:'CONTRACT',entityId:id,detail:{documentId:doc.id,sha256:doc.sha256,isDemo:c.isDemo}}});
   });
   if(!c.isDemo)await this.flow.tryAutoAdvance(c.opportunityId,req.user.id);
   return this.db.contract.findUnique({where:{id}});
 }
 @Post(':id/invoices') async createInvoice(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{number:string;contractId?:string;opportunityId?:string;currency:string;billingEmail:string;dueAt:string;notes?:string;lines:{description:string;quantity:number;unitPrice:number}[];tax?:number}){
   const account=await this.account(req,id,true);if(account.status!=='Customer')throw new BadRequestException('Invoices can be created only for client accounts.');const lines=body.lines;if(!Array.isArray(lines)||!lines.length||lines.length>40)throw new BadRequestException('Include 1–40 invoice lines.');
   const cleaned=lines.map(line=>({description:text(line.description,300),quantity:Number(line.quantity),unitPrice:money(line.unitPrice,'unit price',false)}));if(cleaned.some(l=>!l.description||!Number.isFinite(l.quantity)||l.quantity<=0||l.quantity>100000))throw new BadRequestException('Invalid invoice line.');
   const subtotal=+cleaned.reduce((v,l)=>v+l.quantity*l.unitPrice,0).toFixed(2),tax=money(body.tax??0,'tax',false),total=+(subtotal+tax).toFixed(2);
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.billingEmail||''))throw new BadRequestException('Valid billing email required.');
   if(body.contractId){const c=await this.db.contract.findFirst({where:{id:body.contractId,opportunity:{accountId:id}}});if(!c)throw new BadRequestException('Contract does not belong to this client.');}
   if(body.opportunityId){const o=await this.db.opportunity.findFirst({where:{id:body.opportunityId,accountId:id}});if(!o)throw new BadRequestException('Opportunity does not belong to this client.');}
   return this.db.invoice.create({data:{number:`DRAFT-${randomUUID()}`,accountId:id,contractId:body.contractId||null,opportunityId:body.opportunityId||null,currency:iso(body.currency),billingEmail:body.billingEmail.trim().toLowerCase(),dueAt:validDate(body.dueAt,'due date'),notes:text(body.notes,3000)||null,subtotal,tax,total,lineItems:cleaned,isDemo:account.isDemo,createdById:req.user.id}});
 }
 @Patch(':id/billing-profile') async billingProfile(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{billingAddress?:string;taxRegistrationNumber?:string}){
   await this.account(req,id,true);
   if(!body||typeof body.billingAddress!=='string'||body.billingAddress.length>1200)throw new BadRequestException('Billing address is required.');
   return this.db.account.update({where:{id},data:{billingAddress:text(body.billingAddress,1200),taxRegistrationNumber:text(body.taxRegistrationNumber,60)||null}});
 }
 @Get('invoices/:id') async getInvoice(@Req()req:AuthRequest,@Param('id')id:string){return effectiveInvoice(await this.invoice(req,id));}
 @Post('invoices/:id/approve') async approveInvoice(@Req()req:AuthRequest,@Param('id')id:string){const i=await this.invoice(req,id);requireManager(req.user);if(i.status!=='DRAFT')throw new BadRequestException('Only draft invoices may be approved.');return this.db.$transaction(async tx=>{const r=await tx.invoice.update({where:{id},data:{status:'APPROVED'}});await tx.auditEvent.create({data:{actorId:req.user.id,action:'INVOICE_APPROVED',entityType:'INVOICE',entityId:id}});return r;});}
 @Post('invoices/:id/record-sent') async recordSent(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{reference:string}){const i=await this.invoice(req,id,true);if(i.status!=='APPROVED')throw new BadRequestException('Invoice must be approved first.');if(!text(body.reference))throw new BadRequestException('Provide actual external sending evidence; Gmail sending is not connected yet.');return this.db.$transaction(async tx=>{const r=await tx.invoice.update({where:{id},data:{status:'SENT',issuedAt:new Date(),sentAt:new Date()}});await tx.auditEvent.create({data:{actorId:req.user.id,action:i.isDemo?'DEMO_INVOICE_MARKED_SENT':'EXTERNALLY_SENT_INVOICE_RECORDED',entityType:'INVOICE',entityId:id,detail:{reference:text(body.reference,500)}}});return r;});}
 @Post('invoices/:id/payments') async addPayment(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{amount:number;paidAt:string;reference:string}){
   await this.invoice(req,id);requireManager(req.user);
   const amount=money(body.amount,'payment');if(!text(body.reference))throw new BadRequestException('Payment reference is required.');const paidAt=validDate(body.paidAt,'payment date');
   return this.db.$transaction(async tx=>{
     const current=await tx.invoice.findUnique({where:{id},include:{payments:true,adjustments:true}});
     if(!current||!['SENT','PARTIALLY_PAID'].includes(current.status))throw new BadRequestException('Cannot record payment on an unissued or closed invoice.');
     const {balance}=invoiceBalance(current);if(amount>balance+.001)throw new BadRequestException('Payment exceeds outstanding balance.');
     const payment=await tx.paymentRecord.create({data:{invoiceId:id,amount,paidAt,reference:text(body.reference,250),recordedById:req.user.id,isDemo:current.isDemo}});
     if(!current.isDemo){const org=await tx.account.findUnique({where:{id:current.accountId},select:{organizationId:true}});if(!org?.organizationId)throw new BadRequestException('Organization ownership required for journal posting.');await writeJournal(tx,{organizationId:org.organizationId,externalKey:`payment:${payment.id}`,sourceType:'PAYMENT',sourceId:payment.id,currency:current.currency,memo:`Recorded payment ${payment.reference}`,postedById:req.user.id,lines:receiptJournal(amount)});}
     const status=amount>=balance-.001?'PAID':'PARTIALLY_PAID';await tx.invoice.update({where:{id},data:{status}});
     if(status==='PAID')await tx.invoiceReminder.updateMany({where:{invoiceId:id,status:'PENDING_APPROVAL'},data:{status:'CANCELLED_PAYMENT_RECORDED'}});
     await tx.auditEvent.create({data:{actorId:req.user.id,action:'PAYMENT_MANUALLY_RECORDED',entityType:'INVOICE',entityId:id,detail:{amount,reference:text(body.reference,250),demo:current.isDemo}}});return payment;
   },{isolationLevel:'Serializable'});
 }
 @Post('invoices/:id/reminders') async scheduleReminder(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{daysAfterDue?:number}){
   const i=await this.invoice(req,id,true);const {balance}=invoiceBalance(i);if(!['SENT','PARTIALLY_PAID'].includes(i.status)||balance<=0)throw new BadRequestException('Only unpaid, sent invoices can have reminders.');
   const days=Number(body.daysAfterDue??5);if(!Number.isInteger(days)||days<1||days>90)throw new BadRequestException('Days must be between 1 and 90.');const when=new Date(i.dueAt);when.setUTCDate(when.getUTCDate()+days);const effective=when<new Date()?new Date():when;
   const existing=await this.db.invoiceReminder.findFirst({where:{invoiceId:id,status:'PENDING_APPROVAL'}});if(existing)return existing;
   return this.db.$transaction(async tx=>{const r=await tx.invoiceReminder.create({data:{invoiceId:id,scheduledFor:effective,status:'PENDING_APPROVAL',mode:'DRAFT_ONLY',createdById:req.user.id}});await tx.task.create({data:{organizationId:req.user.organizationId,title:`Invoice ${i.number}: review overdue reminder`,description:`Check payment and dispute status before emailing ${i.billingEmail}. Balance ${balance} ${i.currency}. Reminder is NOT sent automatically in this preview.`,assigneeId:i.account.ownerId,opportunityId:i.opportunityId,dueAt:effective}});return r;});
 }
 @Post(':id/reviews') async review(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{type:string;title:string;score?:number;summary:string;occurredAt?:string;actionItems?:string[]}){
   const a=await this.account(req,id,true);if(!['NPS','CSAT','MBR','QBR'].includes(body.type))throw new BadRequestException('Invalid review type.');if(!text(body.title)||!text(body.summary))throw new BadRequestException('Title and summary required.');
   const max=body.type==='NPS'?10:5;if(['NPS','CSAT'].includes(body.type)&&(!Number.isInteger(body.score)||Number(body.score)<0||Number(body.score)>max))throw new BadRequestException(`Score must be 0–${max}.`);
   const actions=(Array.isArray(body.actionItems)?body.actionItems:[]).map(x=>text(x,500)).filter(Boolean).slice(0,30);
   return this.db.$transaction(async tx=>{
     const review=await tx.clientReview.create({data:{accountId:id,type:body.type,title:text(body.title,150),score:['NPS','CSAT'].includes(body.type)?body.score:null,summary:text(body.summary,8000),actionItems:actions,recordedById:req.user.id,occurredAt:body.occurredAt?validDate(body.occurredAt,'review date'):new Date(),isDemo:a.isDemo}});
     if(body.type==='NPS'&&Number(body.score)<=6){
       const opp=await tx.opportunity.findFirst({where:{accountId:id},orderBy:{updatedAt:'desc'},select:{id:true}});
       await tx.task.create({data:{organizationId:req.user.organizationId,assigneeId:a.ownerId,opportunityId:opp?.id,title:`Client NPS follow-up: ${a.name}`,description:`Score ${body.score}/10. Review the recorded feedback and agree corrective actions. ${a.isDemo?'DEMO ONLY — not a real client.':''}`,dueAt:new Date(Date.now()+2*86400000)}});
     }
     await tx.auditEvent.create({data:{actorId:req.user.id,action:'CLIENT_REVIEW_RECORDED',entityType:'ACCOUNT',entityId:id,detail:{reviewId:review.id,type:body.type,demo:a.isDemo}}});return review;
   });
 }
 @Post(':id/issues') async issue(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{title:string;details?:string;severity?:string}){
   const a=await this.account(req,id,true);if(!text(body.title))throw new BadRequestException('Issue title required.');if(!['LOW','MEDIUM','HIGH','CRITICAL'].includes(body.severity||'MEDIUM'))throw new BadRequestException('Invalid severity.');
   return this.db.$transaction(async tx=>{
     const issue=await tx.clientIssue.create({data:{accountId:id,title:text(body.title,200),details:text(body.details,4000)||null,severity:body.severity||'MEDIUM',isDemo:a.isDemo}});
     if(['HIGH','CRITICAL'].includes(body.severity||'')){
       const opp=await tx.opportunity.findFirst({where:{accountId:id},orderBy:{updatedAt:'desc'},select:{id:true}});
       await tx.task.create({data:{organizationId:req.user.organizationId,assigneeId:a.ownerId,opportunityId:opp?.id,title:`Resolve client escalation: ${a.name}`,description:`${text(body.title,200)} ${a.isDemo?'DEMO ONLY — not a real client.':''}`,dueAt:new Date(Date.now()+86400000)}});
     }
     await tx.auditEvent.create({data:{actorId:req.user.id,action:'CLIENT_ISSUE_RECORDED',entityType:'ACCOUNT',entityId:id,detail:{issueId:issue.id,severity:issue.severity,demo:a.isDemo}}});return issue;
   });
 }
 @Patch('issues/:id') async resolveIssue(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{status:string}){const issue=await this.db.clientIssue.findUnique({where:{id},include:{account:true}});if(!issue)throw new BadRequestException('Issue not found.');ensureCanEdit(req.user,issue.account.ownerId);if(!['OPEN','RESOLVED'].includes(body.status))throw new BadRequestException('Invalid status.');return this.db.clientIssue.update({where:{id},data:{status:body.status,resolvedAt:body.status==='RESOLVED'?new Date():null}});}
}

// Explicitly isolated, idempotent demo scenario. Never modifies real client accounts.
@UseGuards(AuthGuard) @Controller('demo-scenarios')
export class ClientDemoController {
 constructor(private db:PrismaService){}
 @Post('seebot-client') async create(@Req()req:AuthRequest){requireManager(req.user);
   const domain='seebot-client-demo.example';
   const seebot=await this.db.organization.findUnique({where:{slug:'seebot'},select:{id:true}});if(!seebot)throw new BadRequestException('Seebot bootstrap required.');
   const found=await this.db.account.findFirst({where:{domain,organizationId:seebot.id},include:{opportunities:{select:{id:true}}}});
   if(found)return {accountId:found.id,reused:true};
   const today=new Date(),days=(offset:number)=>new Date(today.getTime()+offset*86400000);
   const result=await this.db.$transaction(async tx=>{
     const a=await tx.account.create({data:{organizationId:seebot.id,name:'DEMO · Orion Vision Labs (fictional)',domain,website:'https://seebot-client-demo.example',industry:'Sports Computer Vision',priority:'HIGH',hypothesis:'DEMO ONLY — synthetic client for testing. No real commercial relationship.',ownerId:req.user.id,status:'Customer',clientSince:days(-80),isDemo:true}});
     await tx.contact.createMany({data:[{accountId:a.id,name:'Taylor Morgan (fictional)',title:'Head of Computer Vision',email:'taylor@seebot-client-demo.example',source:'DEMO_ONLY',verified:false},{accountId:a.id,name:'Alex Rivera (fictional)',title:'Accounts Payable',email:'billing@seebot-client-demo.example',source:'DEMO_ONLY',verified:false},{accountId:a.id,name:'Jordan Chen (fictional)',title:'Procurement Lead',email:'procurement@seebot-client-demo.example',source:'DEMO_ONLY',verified:false}]});
     const o=await tx.opportunity.create({data:{accountId:a.id,title:'DEMO · Multisport Annotation Program',ownerId:req.user.id,serviceLine:'Sports Computer Vision',stage:'CLOSED_WON',status:'CLOSED_WON',estimatedAmount:120000,contractedAmount:96000,currency:'USD',closedAt:days(-80),stageVisits:{create:{stage:'CLOSED_WON',evidence:{demo:'DEMO ONLY — simulated win for UI testing'}}}}});
     const contract=await tx.contract.create({data:{opportunityId:o.id,title:'DEMO · Annual Annotation Services Agreement',type:'PRODUCTION_OTHER',status:'SIGNED',evidenceReference:'DEMO_ONLY_NO_REAL_SIGNATURE',committedAmount:96000,currency:'USD',signedAt:days(-80),isDemo:true}});
     await tx.contractSignatureEvent.createMany({data:[{contractId:contract.id,event:'DEMO_SENT',signerName:'Jordan Chen',signerEmail:'procurement@seebot-client-demo.example',source:'DEMO_ONLY',isDemo:true,occurredAt:days(-85),recordedById:req.user.id},{contractId:contract.id,event:'DEMO_VIEWED',signerName:'Jordan Chen',source:'DEMO_ONLY',isDemo:true,occurredAt:days(-84),recordedById:req.user.id},{contractId:contract.id,event:'DEMO_SIGNED',signerName:'Jordan Chen',source:'DEMO_ONLY',isDemo:true,occurredAt:days(-80),recordedById:req.user.id}]});
     const inv1=await tx.invoice.create({data:{accountId:a.id,opportunityId:o.id,contractId:contract.id,number:'DEMO-ORION-001',currency:'USD',lineItems:[{description:'DEMO · April data annotation services',quantity:1,unitPrice:8000}],subtotal:8000,total:8000,tax:0,dueAt:days(-60),issuedAt:days(-90),sentAt:days(-90),status:'PAID',isDemo:true,billingEmail:'billing@seebot-client-demo.example',createdById:req.user.id}});
     await tx.paymentRecord.create({data:{invoiceId:inv1.id,amount:8000,paidAt:days(-62),reference:'DEMO-PAYMENT-001',recordedById:req.user.id,isDemo:true}});
     await tx.invoice.create({data:{accountId:a.id,opportunityId:o.id,contractId:contract.id,number:'DEMO-ORION-002',currency:'USD',lineItems:[{description:'DEMO · May data annotation services',quantity:1,unitPrice:8000}],subtotal:8000,total:8000,tax:0,dueAt:days(-12),issuedAt:days(-42),sentAt:days(-42),status:'SENT',isDemo:true,billingEmail:'billing@seebot-client-demo.example',createdById:req.user.id}});
     await tx.invoice.create({data:{accountId:a.id,opportunityId:o.id,contractId:contract.id,number:'DEMO-ORION-003',currency:'USD',lineItems:[{description:'DEMO · June data annotation services',quantity:1,unitPrice:8000}],subtotal:8000,total:8000,tax:0,dueAt:days(18),issuedAt:days(-12),sentAt:days(-12),status:'SENT',isDemo:true,billingEmail:'billing@seebot-client-demo.example',createdById:req.user.id}});
     await tx.clientReview.createMany({data:[{accountId:a.id,type:'NPS',title:'DEMO · Quarterly client feedback',score:3,summary:'DEMO ONLY — Client expressed concern over QA turnaround and asked for a corrective plan.',recordedById:req.user.id,isDemo:true,occurredAt:days(-5)},{accountId:a.id,type:'MBR',title:'DEMO · Monthly Business Review',summary:'DEMO ONLY — Client requested improved weekly QA reporting and fewer missed handoff deadlines.',actionItems:['Share corrective-action plan','Review next month capacity forecast'],recordedById:req.user.id,isDemo:true,occurredAt:days(-10)}]});
     await tx.clientIssue.create({data:{accountId:a.id,title:'DEMO · QA turnaround below agreed target',details:'Fictional escalation; test low client health and executive attention.',severity:'HIGH',status:'OPEN',isDemo:true}});
     await tx.task.create({data:{organizationId:req.user.organizationId,title:'DEMO · Review low NPS with Orion contact',description:'Synthetic scenario; not a real task for client outreach.',dueAt:days(4),opportunityId:o.id,assigneeId:req.user.id}});
     await tx.auditEvent.create({data:{actorId:req.user.id,action:'DEMO_CLIENT_CREATED',entityType:'ACCOUNT',entityId:a.id,detail:{mode:'DEMO',synthetic:true}}});
     return a;
   });return {accountId:result.id,reused:false};
 }
}
