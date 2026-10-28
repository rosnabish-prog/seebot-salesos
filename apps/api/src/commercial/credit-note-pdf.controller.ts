import {writeJournal} from '../accounting/journal.service';
import {creditJournal} from '../accounting/journal-policy';
import {BadRequestException,Controller,ForbiddenException,Get,Param,Post,Req,Res,StreamableFile,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {randomUUID,createHash} from 'node:crypto';
import * as path from 'node:path';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,ensureOwner,requireManager} from '../common/auth.guard';
const folder=process.env.CREDIT_NOTE_STORAGE_DIR||path.resolve(process.cwd(),'private-credit-documents');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const clean=(s:any)=>String(s??'').replace(/[^\x20-\x7e]/g,'?').slice(0,120);
@UseGuards(AuthGuard)@Controller('commercial/credit-notes')
export class CreditNotePdfController {
 constructor(private db:PrismaService){}
 private async authorized(id:string,req:AuthRequest){const adjustment=await this.db.invoiceAdjustment.findUnique({where:{id},include:{invoice:{include:{account:true}},creditNoteDocument:true}});if(!adjustment||adjustment.invoice.account.organizationId!==req.user.organizationId)throw new BadRequestException('Credit adjustment unavailable.');ensureOwner(req.user,adjustment.invoice.account.ownerId);return adjustment;}
 @Post(':id/issue')async issue(@Req()req:AuthRequest,@Param('id')id:string){requireManager(req.user);const a=await this.authorized(id,req);if(a.kind!=='CREDIT_NOTE'||a.status!=='APPROVED')throw new BadRequestException('Manager-approved credit note required.');if(a.invoice.isDemo)throw new BadRequestException('Cannot issue a legal credit note for fictional data.');if(a.creditNoteDocument)return {number:a.creditNoteDocument.number,reused:true};
  if(Number(a.invoice.tax)!==0)throw new BadRequestException('Tax-bearing credits require an accountant-reviewed allocation before issuing; automatic posting is disabled.');
  const org=await this.db.organization.findUnique({where:{id:a.invoice.account.organizationId||''}});if(!org?.legalName||!org.billingAddress||!a.invoice.account.billingAddress)throw new BadRequestException('Issuer and client billing identities required.');
  const year=new Date().getUTCFullYear();const number=await this.db.$transaction(async tx=>{await tx.creditNoteSequence.upsert({where:{organizationId_year:{organizationId:org.id,year}},create:{organizationId:org.id,year},update:{}});const seq=await tx.creditNoteSequence.update({where:{organizationId_year:{organizationId:org.id,year}},data:{nextNumber:{increment:1}}});return `CN-${org.slug==='seebot'?'SBS':`ORG-${org.slug.toUpperCase()}`}-${year}-${String(seq.nextNumber-1).padStart(6,'0')}`;},{isolationLevel:'Serializable'});
  const pdf=await PDFDocument.create(),page=pdf.addPage([595,842]),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines=[['CREDIT NOTE',20],['Issuer: '+org.legalName,12],['Issuer address: '+org.billingAddress,10],['Credit note: '+number,12],['Original invoice: '+a.invoice.number,11],['Client: '+a.invoice.account.name,12],['Client address: '+a.invoice.account.billingAddress,10],['Issued: '+new Date().toISOString().slice(0,10),10],['Reason: '+a.reason,10],['Credit amount: '+a.invoice.currency+' '+Number(a.amount).toFixed(2),15]] as const;
  let y=785;for(const [t,size] of lines){page.drawText(clean(t),{x:42,y,size,font:size>=12?bold:font,color:rgb(0.1,0.13,0.18)});y-=size+19;}
  const bytes=Buffer.from(await pdf.save()),storageKey=randomUUID()+'.pdf';await mkdir(folder,{recursive:true,mode:0o700});await writeFile(path.join(folder,storageKey),bytes,{flag:'wx',mode:0o600});
  try{const document=await this.db.$transaction(async tx=>{const existing=await tx.creditNoteDocument.findUnique({where:{adjustmentId:id}});if(existing)return existing;const doc=await tx.creditNoteDocument.create({data:{adjustmentId:id,number,storageKey,sha256:hash(bytes),size:bytes.length,issuedById:req.user.id}});await writeJournal(tx,{organizationId:org.id,externalKey:`credit:${a.id}:issued`,sourceType:'CREDIT_NOTE',sourceId:a.id,currency:a.invoice.currency,memo:`Credit note ${number}`,postedById:req.user.id,lines:creditJournal(a.amount,'CREDIT_NOTE')});await tx.auditEvent.create({data:{actorId:req.user.id,action:'CREDIT_NOTE_ISSUED',entityType:'INVOICE',entityId:a.invoiceId,detail:{adjustmentId:id,number,sha256:doc.sha256}}});return doc;},{isolationLevel:'Serializable'});return {number:document.number,documentId:document.id,reused:false};}
  catch(e){await unlink(path.join(folder,storageKey)).catch(()=>{});throw e;}
 }
 @Get(':id/pdf')async download(@Req()req:AuthRequest,@Param('id')id:string,@Res({passthrough:true})res:Response){const a=await this.authorized(id,req);if(!a.creditNoteDocument)throw new BadRequestException('Credit PDF not issued.');const bytes=await readFile(path.join(folder,a.creditNoteDocument.storageKey));if(hash(bytes)!==a.creditNoteDocument.sha256)throw new ForbiddenException('Credit-note integrity mismatch.');res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition',`attachment; filename="${a.creditNoteDocument.number}.pdf"`);return new StreamableFile(bytes);}
}
