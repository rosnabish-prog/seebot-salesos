import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Post,Req,Res,StreamableFile,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {createHash,randomUUID} from 'node:crypto';
import * as path from 'node:path';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {canApproveCustomerCredit,receivableMinor} from './receivable-policy';
import {writeJournal} from './journal.service';
import {creditJournal} from './journal-policy';

const folder=process.env.CREDIT_NOTE_STORAGE_DIR||path.resolve(process.cwd(),'private-credit-documents');
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const clean=(value:any)=>String(value??'').replace(/[^\x20-\x7e]/g,'?').slice(0,120);
const money=(value:unknown)=>{const raw=String(value??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||Number(raw)<=0)throw new BadRequestException('Credit amount must be positive with at most two decimal places.');return raw;};

@UseGuards(IdentityGuard)
@Controller('workspace-credit-notes')
export class TenantCreditNotesController{
 constructor(private db:PrismaService,private scope:TenantScopeService){}
 private async finance(req:ScopedRequest,orgId:string,adminOnly=false){
  return this.scope.membership(req,orgId,adminOnly?'admin':'finance');
 }
 private async invoice(orgId:string,invoiceId:string){
  const invoice=await this.db.invoice.findFirst({where:{id:invoiceId,account:{organizationId:orgId}},include:{account:true,payments:true,adjustments:true}});
  if(!invoice)throw new BadRequestException('Invoice unavailable in this workspace.');return invoice;
 }
 @Get(':orgId/invoices/:invoiceId')async list(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('invoiceId')invoiceId:string){
  await this.finance(req,orgId);await this.invoice(orgId,invoiceId);
  return this.db.invoiceAdjustment.findMany({where:{invoiceId},include:{creditNoteDocument:{select:{id:true,number:true,issuedAt:true,sha256:true}}},orderBy:{createdAt:'desc'}});
 }
 @Post(':orgId/invoices/:invoiceId')async create(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('invoiceId')invoiceId:string,@Body()body:any){
  await this.finance(req,orgId);const invoice=await this.invoice(orgId,invoiceId);
  if(['DRAFT','VOID'].includes(invoice.status))throw new BadRequestException('Only an issued invoice can receive a customer credit.');
  const amount=money(body?.amount),reason=String(body?.reason||'').trim();
  if(reason.length<3||reason.length>2000)throw new BadRequestException('Document the reason for the customer credit.');
  if(Number(amount)>(receivableMinor(invoice).due/100)+0.001)throw new BadRequestException('Credit cannot exceed the remaining customer receivable.');
  return this.db.invoiceAdjustment.create({data:{invoiceId,kind:'CREDIT_NOTE',amount,reason,createdById:req.user.id}});
 }
 @Post(':orgId/invoices/:invoiceId/:adjustmentId/approve')async approve(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('invoiceId')invoiceId:string,@Param('adjustmentId')adjustmentId:string){
  await this.finance(req,orgId,true);const invoice=await this.invoice(orgId,invoiceId);
  const adjustment=await this.db.invoiceAdjustment.findFirst({where:{id:adjustmentId,invoiceId,status:'DRAFT',kind:'CREDIT_NOTE'}});
  if(!adjustment)throw new BadRequestException('Credit-note draft unavailable.');
  if(!canApproveCustomerCredit(invoice,adjustment.amount))throw new BadRequestException('Credit exceeds the current unpaid customer receivable.');
  const changed=await this.db.invoiceAdjustment.updateMany({where:{id:adjustmentId,status:'DRAFT'},data:{status:'APPROVED',approvedById:req.user.id,approvedAt:new Date()}});
  if(changed.count!==1)throw new BadRequestException('Credit note changed during approval.');
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_INVOICE_CREDIT_APPROVED',entityType:'INVOICE',entityId:invoiceId,detail:{organizationId:orgId,adjustmentId,amount:String(adjustment.amount)}}});
  return {approved:true};
 }
 @Post(':orgId/adjustments/:adjustmentId/issue')async issue(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('adjustmentId')adjustmentId:string){
  await this.finance(req,orgId);
  const adjustment=await this.db.invoiceAdjustment.findFirst({where:{id:adjustmentId,invoice:{account:{organizationId:orgId}}},include:{invoice:{include:{account:true}},creditNoteDocument:true}});
  if(!adjustment||adjustment.kind!=='CREDIT_NOTE'||adjustment.status!=='APPROVED')throw new BadRequestException('Approved customer credit note required.');
  if(adjustment.invoice.isDemo)throw new BadRequestException('A legal credit note cannot be issued for fictional preview data.');
  if(adjustment.creditNoteDocument)return {number:adjustment.creditNoteDocument.number,reused:true,documentId:adjustment.creditNoteDocument.id};
  if(Number(adjustment.invoice.tax)!==0)throw new BadRequestException('Tax-bearing credits require accountant-reviewed tax allocation before issue.');
  const org=await this.db.organization.findUnique({where:{id:orgId}});
  if(!org?.legalName||!org.billingAddress||!adjustment.invoice.account.billingAddress)throw new BadRequestException('Issuer and client billing identities are required before credit-note issue.');
  const year=new Date().getUTCFullYear();
  const number=await this.db.$transaction(async tx=>{await tx.creditNoteSequence.upsert({where:{organizationId_year:{organizationId:orgId,year}},create:{organizationId:orgId,year},update:{}});const seq=await tx.creditNoteSequence.update({where:{organizationId_year:{organizationId:orgId,year}},data:{nextNumber:{increment:1}}});return 'CN-ORG-'+org.slug.toUpperCase()+'-'+year+'-'+String(seq.nextNumber-1).padStart(6,'0');},{isolationLevel:'Serializable'});
  const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines=[['CREDIT NOTE',20],['Issuer: '+org.legalName,12],['Issuer address: '+org.billingAddress,10],['Credit note: '+number,12],['Original invoice: '+adjustment.invoice.number,11],['Client: '+adjustment.invoice.account.name,12],['Client address: '+adjustment.invoice.account.billingAddress,10],['Issued: '+new Date().toISOString().slice(0,10),10],['Reason: '+adjustment.reason,10],['Credit amount: '+adjustment.invoice.currency+' '+Number(adjustment.amount).toFixed(2),15]] as const;
  let y=785;for(const [label,size] of lines){page.drawText(clean(label),{x:42,y,size,font:size>=12?bold:font,color:rgb(0.1,0.13,0.18)});y-=size+19;}
  const bytes=Buffer.from(await pdf.save()),storageKey=randomUUID()+'.pdf';await mkdir(folder,{recursive:true,mode:0o700});await writeFile(path.join(folder,storageKey),bytes,{flag:'wx',mode:0o600});
  try{
   const document=await this.db.$transaction(async tx=>{
    const prior=await tx.creditNoteDocument.findUnique({where:{adjustmentId}});if(prior)return prior;
    const doc=await tx.creditNoteDocument.create({data:{adjustmentId,number,storageKey,sha256:hash(bytes),size:bytes.length,issuedById:req.user.id}});
    await writeJournal(tx,{organizationId:orgId,externalKey:'credit:'+adjustmentId+':issued',sourceType:'CREDIT_NOTE',sourceId:adjustmentId,currency:adjustment.invoice.currency,memo:'Credit note '+number,postedById:req.user.id,lines:creditJournal(adjustment.amount,'CREDIT_NOTE')});
    await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CREDIT_NOTE_ISSUED',entityType:'INVOICE',entityId:adjustment.invoiceId,detail:{organizationId:orgId,adjustmentId,number,sha256:doc.sha256}}});
    return doc;
   },{isolationLevel:'Serializable'});
   return {number:document.number,documentId:document.id,reused:false};
  }catch(error){await unlink(path.join(folder,storageKey)).catch(()=>{});throw error;}
 }
 @Get(':orgId/adjustments/:adjustmentId/pdf')async pdf(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('adjustmentId')adjustmentId:string,@Res({passthrough:true})res:Response){
  await this.finance(req,orgId);
  const adjustment=await this.db.invoiceAdjustment.findFirst({where:{id:adjustmentId,invoice:{account:{organizationId:orgId}}},include:{creditNoteDocument:true}});
  if(!adjustment?.creditNoteDocument)throw new BadRequestException('Credit-note PDF has not been issued.');
  const bytes=await readFile(path.join(folder,adjustment.creditNoteDocument.storageKey));if(hash(bytes)!==adjustment.creditNoteDocument.sha256)throw new ForbiddenException('Credit-note document integrity mismatch.');
  res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition','attachment; filename="'+adjustment.creditNoteDocument.number+'.pdf"');
  return new StreamableFile(bytes);
 }
}
