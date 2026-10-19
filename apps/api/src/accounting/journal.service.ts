import {BadRequestException,ForbiddenException,Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {amountMinor,balanced,reverseJournal,type JournalLineInput} from './journal-policy';
/** Append-only postings with a unique source key, performed inside the caller's DB transaction. */
export async function writeJournal(tx:any,data:{organizationId:string;externalKey:string;sourceType:string;sourceId:string;currency:string;memo:string;postedById:string;lines:JournalLineInput[]}){
 if(!/^[A-Z]{3}$/.test(data.currency)||!balanced(data.lines))throw new BadRequestException('Journal must balance within one currency.');
 return tx.accountingJournal.create({data:{organizationId:data.organizationId,externalKey:data.externalKey,sourceType:data.sourceType,sourceId:data.sourceId,currency:data.currency,memo:data.memo,postedById:data.postedById,postings:{create:data.lines.map(l=>({accountCode:l.accountCode,side:l.side,amountMinor:BigInt(l.amountMinor)}))}}});
}
@Injectable()
export class JournalService{
 constructor(private db:PrismaService){}
 async list(organizationId:string){
  const journals=await this.db.accountingJournal.findMany({where:{organizationId},include:{postings:true},orderBy:{postedAt:'desc'},take:200});
  return journals.map(j=>({...j,postings:j.postings.map(p=>({...p,amountMinor:p.amountMinor.toString()}))}));
 }
 async verify(organizationId:string){
  const entries=await this.db.accountingJournal.findMany({where:{organizationId},include:{postings:true},orderBy:{postedAt:'asc'},take:5000});
  const failures=entries.filter(j=>!balanced(j.postings.map(p=>({accountCode:p.accountCode,side:p.side as 'DEBIT'|'CREDIT',amountMinor:Number(p.amountMinor)}))));
  return {checked:entries.length,balanced:failures.length===0,failures:failures.map(j=>j.id),truncated:entries.length===5000};
 }
 async reverse(organizationId:string,journalId:string,actorId:string,reason:string){
  if(typeof reason!=='string'||reason.trim().length<15||reason.trim().length>2000)throw new BadRequestException('Document the reason for this reversing entry.');
  return this.db.$transaction(async tx=>{
   const previous=await tx.accountingJournal.findFirst({where:{id:journalId,organizationId},include:{postings:true}});
   if(!previous||previous.sourceType==='REVERSAL')throw new BadRequestException('Only original journals belonging to this organization can be reversed.');
   const lines=reverseJournal(previous.postings.map(p=>({accountCode:p.accountCode,side:p.side as 'DEBIT'|'CREDIT',amountMinor:Number(p.amountMinor)})));
   const reversal=await writeJournal(tx,{organizationId,externalKey:`reversal:${journalId}`,sourceType:'REVERSAL',sourceId:journalId,currency:previous.currency,memo:reason.trim(),postedById:actorId,lines});
   await tx.auditEvent.create({data:{actorId,entityType:'ACCOUNTING_JOURNAL',entityId:journalId,action:'ACCOUNTING_REVERSAL_POSTED',detail:{organizationId,reversalId:reversal.id,reason:reason.trim()}}});
   return {reversed:true,originalId:journalId,reversalId:reversal.id};
  },{isolationLevel:'Serializable'});
 }
 async coverage(organizationId:string){
  const [docs,payments,credits,journals]=await Promise.all([
   this.db.invoiceDocument.findMany({where:{invoice:{account:{organizationId}}},select:{invoiceId:true},take:3000}),
   this.db.paymentRecord.findMany({where:{invoice:{account:{organizationId}},isDemo:false},select:{id:true},take:3000}),
   this.db.creditNoteDocument.findMany({where:{adjustment:{invoice:{account:{organizationId}}}},select:{adjustmentId:true},take:3000}),
   this.db.accountingJournal.findMany({where:{organizationId},select:{externalKey:true},take:15000})
  ]);
  const keys=new Set(journals.map(j=>j.externalKey));
  const missing={invoices:docs.filter(x=>!keys.has(`invoice:${x.invoiceId}:issued`)).map(x=>x.invoiceId),payments:payments.filter(x=>!keys.has(`payment:${x.id}`)).map(x=>x.id),credits:credits.filter(x=>!keys.has(`credit:${x.adjustmentId}:issued`)).map(x=>x.adjustmentId)};
  return {organizationId,missing,complete:Object.values(missing).every(a=>a.length===0),truncated:docs.length===3000||payments.length===3000||credits.length===3000||journals.length===15000,notice:'Legacy records without journals require finance-approved opening postings; never silently fabricate historical ledger entries.'};
 }
 async reconciliation(organizationId:string){
  const [rows,payments]=await Promise.all([
   this.db.bankStatementRow.findMany({where:{organizationId},include:{paymentRecord:{select:{id:true,reference:true,amount:true,paidAt:true,invoice:{select:{id:true,number:true,currency:true,account:{select:{name:true}}}}}}},orderBy:{valueDate:'desc'},take:300}),
   this.db.paymentRecord.findMany({where:{invoice:{account:{organizationId}}},include:{invoice:{select:{id:true,number:true,currency:true,account:{select:{name:true}}}},statementMatch:{select:{id:true}}},orderBy:{paidAt:'desc'},take:500})
  ]);
  return {
   rows:rows.map(r=>({...r,amountMinor:r.amountMinor.toString()})),
   payments:payments.map(p=>({id:p.id,reference:p.reference,amount:p.amount.toString(),paidAt:p.paidAt,invoice:p.invoice,matched:Boolean(p.statementMatch)}))
  };
 }
 async importBankRow(orgId:string,actorId:string,body:any){
  const bankAccountReference=String(body?.bankAccountReference||'').trim(),statementReference=String(body?.statementReference||'').trim();
  if(!bankAccountReference||bankAccountReference.length>100||!statementReference||statementReference.length>150)throw new BadRequestException('Bank account and statement references required.');
  const minor=amountMinor(body?.amount);
  const valueDate=new Date(body?.valueDate);if(!Number.isFinite(valueDate.getTime()))throw new BadRequestException('Valid value date required.');
  const currency=String(body?.currency||'').trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Currency required.');
  return this.db.$transaction(async tx=>{
   const row=await tx.bankStatementRow.create({data:{organizationId:orgId,bankAccountReference,statementReference,amountMinor:BigInt(minor),currency,valueDate}});
   await tx.auditEvent.create({data:{actorId,entityType:'BANK_STATEMENT_ROW',entityId:row.id,action:'BANK_ROW_MANUALLY_ENTERED',detail:{organizationId:orgId,statementReference}}});
   return {...row,amountMinor:row.amountMinor.toString()};
  },{isolationLevel:'Serializable'});
 }
 async match(orgId:string,rowId:string,paymentId:string,actorId:string){
  return this.db.$transaction(async tx=>{
   const row=await tx.bankStatementRow.findFirst({where:{id:rowId,organizationId:orgId}});
   const payment=await tx.paymentRecord.findFirst({where:{id:paymentId,invoice:{account:{organizationId:orgId}}},include:{invoice:true}});
   if(!row||!payment)throw new ForbiddenException('Statement or payment does not belong to this organization.');
   if(row.paymentRecordId)throw new BadRequestException('Statement row already matched.');
   if(row.currency!==payment.invoice.currency||row.amountMinor!==BigInt(Math.round(Number(payment.amount)*100)))throw new BadRequestException('Bank amount and currency must match payment exactly.');
   const updated=await tx.bankStatementRow.updateMany({where:{id:row.id,organizationId:orgId,paymentRecordId:null},data:{paymentRecordId:payment.id,matchedById:actorId,matchedAt:new Date()}});
   if(updated.count!==1)throw new BadRequestException('Statement was matched concurrently.');
   await tx.auditEvent.create({data:{actorId,entityType:'BANK_STATEMENT_ROW',entityId:row.id,action:'BANK_ROW_MATCHED',detail:{organizationId:orgId,paymentId:payment.id}}});
   return {matched:true,bankRowId:row.id,paymentId:payment.id};
  },{isolationLevel:'Serializable'});
 }
}
