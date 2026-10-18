import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash,randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import {validateInvoiceTotals} from '../accounting/receivable-policy';
import {writeJournal} from '../accounting/journal.service';
import {invoiceJournal} from '../accounting/journal-policy';

export const invoicesPath=process.env.INVOICE_STORAGE_DIR||path.resolve(process.cwd(),'private-invoice-documents');
const digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const print=(value:unknown,max=110)=>String(value??'').replace(/[^\x20-\x7e]/g,'?').slice(0,max);
const money=(value:unknown)=>Number(value||0).toFixed(2);

@Injectable()
export class InvoicePdfService {
  constructor(private db:PrismaService){}
  /** PDF creation is deterministic for an issued invoice; concurrent callers cannot issue two documents. */
  async issue(invoiceId:string,actorId:string){
    const invoice=await this.db.invoice.findUnique({where:{id:invoiceId},include:{account:true,document:true,taxReview:true}});
    if(!invoice)throw new BadRequestException('Invoice not found.');
    if(invoice.isDemo)throw new BadRequestException('Demo invoices cannot be issued as real documents.');
    if(!invoice.account.organizationId)throw new BadRequestException('Invoice account requires organization ownership.');
    if(invoice.document)return {invoiceNumber:invoice.document.invoiceNumber,documentId:invoice.document.id,reused:true};
    if(invoice.status!=='APPROVED')throw new BadRequestException('Finance approval is required before issuing an invoice PDF.');
    if(!invoice.taxReview||Number(invoice.taxReview.reviewedSubtotal)!==Number(invoice.subtotal)||Number(invoice.taxReview.reviewedTax)!==Number(invoice.tax)||Number(invoice.taxReview.reviewedTotal)!==Number(invoice.total))throw new BadRequestException('An accountant-reviewed tax snapshot matching current totals is required.');
    try{if(!validateInvoiceTotals(Array.isArray(invoice.lineItems)?invoice.lineItems as any[]:[],invoice.subtotal,invoice.tax,invoice.total))throw new Error();}
    catch{throw new BadRequestException('Invoice lines and stored totals do not reconcile. Review before issuing.');}
    const issuer=await this.db.organization.findUnique({where:{id:invoice.account.organizationId}});
    if(!issuer||!issuer.legalName||!issuer.billingAddress||!invoice.account.billingAddress)
      throw new BadRequestException('Set issuer legal name and billing address, and client billing address, before issuing an invoice.');
    if(invoice.account.isDemo)throw new BadRequestException('Cannot issue invoices to demo clients.');
    const year=new Date().getUTCFullYear();
    // Reserve the number atomically. Gaps are possible if PDF rendering fails: gaps must be audited.
    const number=await this.db.$transaction(async tx=>{
      await tx.invoiceSequence.upsert({where:{organizationId_year:{organizationId:issuer.id,year}},create:{organizationId:issuer.id,year,nextNumber:1},update:{}});
      const counter=await tx.invoiceSequence.update({where:{organizationId_year:{organizationId:issuer.id,year}},data:{nextNumber:{increment:1}}});
      const prefix=issuer.slug==='seebot'?'SBS':`ORG-${issuer.slug.toUpperCase()}`;
      const number=`${prefix}-${year}-${String(counter.nextNumber-1).padStart(6,'0')}`;
      await tx.invoice.update({where:{id:invoiceId},data:{number}});
      await tx.auditEvent.create({data:{actorId,action:'INVOICE_NUMBER_RESERVED',entityType:'INVOICE',entityId:invoiceId,detail:{number}}});
      return number;
    },{isolationLevel:'Serializable'});
    const issued={...invoice,number};
    const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    let page=pdf.addPage([595,842]),y=790;
    const text=(value:unknown,size=10,strong=false)=>{if(y<70){page=pdf.addPage([595,842]);y=792;}page.drawText(print(value,100),{x:45,y,size,font:strong?bold:font,color:rgb(0.09,0.13,0.19)});y-=size+10;};
    text('INVOICE',22,true);text(issuer.legalName,13,true);
    text(issuer.billingAddress,10);if(issuer.taxRegistrationNumber)text(`Tax registration: ${issuer.taxRegistrationNumber}`);
    text(`Tax treatment: ${invoice.taxReview.treatment} (${invoice.taxReview.jurisdiction})`);
    if(invoice.taxReview.ruleCodeSnapshot)text(`Tax rule: ${invoice.taxReview.ruleCodeSnapshot} · ${invoice.taxReview.ratePercentSnapshot||0}%`);
    if(invoice.taxReview.ruleInvoiceNoteSnapshot)text(`Tax note: ${invoice.taxReview.ruleInvoiceNoteSnapshot}`);
    y-=12;text(`Invoice: ${number}`,12,true);text(`Issued (UTC): ${new Date().toISOString().slice(0,10)}`);text(`Due: ${new Date(invoice.dueAt).toISOString().slice(0,10)}`);
    text(`Billed to: ${invoice.account.name}`,11,true);text(invoice.account.billingAddress);
    if(invoice.account.taxRegistrationNumber)text(`Customer tax ID: ${invoice.account.taxRegistrationNumber}`);
    y-=14;text(`Description / Quantity / Unit rate / Total (${invoice.currency})`,10,true);
    const rows=Array.isArray(invoice.lineItems)?invoice.lineItems as any[]:[];
    for(const row of rows.slice(0,300)){
      const quantity=Number(row?.quantity||0),rate=Number(row?.unitPrice||0);
      text(`${print(row?.description,50)} | ${quantity} x ${rate.toFixed(6)} | ${money(quantity*rate)}`);
    }
    y-=10;text(`Subtotal: ${invoice.currency} ${money(invoice.subtotal)}`,11,true);
    text(`Tax: ${invoice.currency} ${money(invoice.tax)}`);
    text(`TOTAL DUE: ${invoice.currency} ${money(invoice.total)}`,14,true);
    if(invoice.notes){y-=10;text('Notes:',10,true);for(const note of String(invoice.notes).match(/.{1,95}/g)||[])text(note);}
    const bytes=Buffer.from(await pdf.save());const fileName=`${randomUUID()}.pdf`;
    await mkdir(invoicesPath,{recursive:true,mode:0o700});await writeFile(path.join(invoicesPath,fileName),bytes,{flag:'wx',mode:0o600});
    try{
      const record=await this.db.$transaction(async tx=>{
        const reserved=await tx.invoice.findUnique({where:{id:invoiceId},include:{document:true}});
        if(reserved?.document)return reserved.document;
        if(reserved?.number!==number||reserved.status!=='APPROVED')throw new BadRequestException('Invoice changed during issuance.');
        const doc=await tx.invoiceDocument.create({data:{invoiceId,storageKey:fileName,sha256:digest(bytes),size:bytes.length,invoiceNumber:number,generatedById:actorId}});
        await tx.invoice.update({where:{id:invoiceId},data:{issuedAt:new Date()}});
        await writeJournal(tx,{organizationId:issuer.id,externalKey:`invoice:${invoiceId}:issued`,sourceType:'INVOICE',sourceId:invoiceId,currency:invoice.currency,memo:`Issued invoice ${number}`,postedById:actorId,lines:invoiceJournal(invoice.subtotal,invoice.tax)});
        await tx.auditEvent.create({data:{actorId,action:'INVOICE_PDF_ISSUED',entityType:'INVOICE',entityId:invoiceId,detail:{invoiceNumber:number,sha256:doc.sha256,documentId:doc.id}}});
        return doc;
      },{isolationLevel:'Serializable'});
      return {invoiceNumber:record.invoiceNumber,documentId:record.id,sha256:record.sha256,reused:false};
    }catch(err){await unlink(path.join(invoicesPath,fileName)).catch(()=>{});throw err;}
  }
  async getVerifiedDocument(invoiceId:string){
    const record=await this.db.invoiceDocument.findUnique({where:{invoiceId}});
    if(!record)throw new BadRequestException('Invoice PDF has not been issued.');
    const bytes=await readFile(path.join(invoicesPath,record.storageKey));
    if(digest(bytes)!==record.sha256)throw new ForbiddenException('Invoice document integrity check failed.');
    return {bytes,record};
  }
}
