import {BadRequestException,Body,Controller,ForbiddenException,Get,Param,Patch,Post,Req,Res,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import type {AuthRequest} from '../common/auth.guard';
import {exportCsv,parseTaxCsv,taxRuleInput,taxTotals} from './tax-policy';

type ScopeRequest=AuthRequest & {selectedWorkspace?:string|null};

/** Organization-owned tax catalogue. Rules are created as drafts and cannot be used until approved. */
@UseGuards(IdentityGuard) @Controller('workspace-tax')
export class TaxRulesController{
 constructor(private db:PrismaService){}
 private async finance(req:ScopeRequest,orgId:string){
  if(req.selectedWorkspace!==orgId)throw new ForbiddenException('Select the invoice issuing workspace.');
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}},include:{organization:{select:{status:true}}}});
  if(!member||member.status!=='ACTIVE'||!['SETUP','ACTIVE'].includes(member.organization.status)||!['OWNER','ADMIN','FINANCE'].includes(member.role))throw new ForbiddenException('Active finance membership is required.');
  return member;
 }
 @Get(':orgId/rules')async list(@Req()req:ScopeRequest,@Param('orgId')orgId:string){
  await this.finance(req,orgId);
  return this.db.taxRule.findMany({where:{organizationId:orgId},orderBy:[{jurisdiction:'asc'},{code:'asc'}],take:500});
 }
 @Get(':orgId/rules.csv')async csv(@Req()req:ScopeRequest,@Param('orgId')orgId:string,@Res({passthrough:true})res:Response){
  await this.finance(req,orgId);
  const rows=await this.db.taxRule.findMany({where:{organizationId:orgId},orderBy:[{code:'asc'}],take:500});
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Disposition','attachment; filename="salesos-tax-rules.csv"');
  return exportCsv(rows);
 }
 @Post(':orgId/rules/import-csv')async importCsv(@Req()req:ScopeRequest,@Param('orgId')orgId:string,@Body()body:any){
  await this.finance(req,orgId);
  const rows=parseTaxCsv(body?.csv);
  return this.db.$transaction(async tx=>{
   const existing=await tx.taxRule.findMany({where:{organizationId:orgId,code:{in:rows.map(r=>r.code)}},select:{code:true}});
   if(existing.length)throw new BadRequestException('CSV contains an already-used tax code. Use a new code/version rather than overwrite an approved or historical rule.');
   const inserted=await tx.taxRule.createMany({data:rows.map(row=>({...row,organizationId:orgId,status:'DRAFT',createdById:req.user.id}))});
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'TAX_RULE_CATALOG',entityId:orgId,action:'TAX_RULE_CSV_IMPORTED',detail:{organizationId:orgId,codes:rows.map(r=>r.code),count:inserted.count,allImportedAs:'DRAFT'}}});
   return {imported:inserted.count,status:'DRAFT',notice:'Imported rules are drafts and must be approved by finance before use.'};
  },{isolationLevel:'Serializable'});
 }
 @Post(':orgId/rules')async create(@Req()req:ScopeRequest,@Param('orgId')orgId:string,@Body()body:any){
  await this.finance(req,orgId);
  const input=taxRuleInput(body);
  return this.db.$transaction(async tx=>{
   const rule=await tx.taxRule.create({data:{organizationId:orgId,...input,status:'DRAFT',createdById:req.user.id}});
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'TAX_RULE',entityId:rule.id,action:'TAX_RULE_DRAFTED',detail:{organizationId:orgId,code:rule.code,ratePercent:rule.ratePercent.toString()}}});
   return rule;
  },{isolationLevel:'Serializable'});
 }
 @Patch(':orgId/rules/:ruleId')async edit(@Req()req:ScopeRequest,@Param('orgId')orgId:string,@Param('ruleId')ruleId:string,@Body()body:any){
  await this.finance(req,orgId);const input=taxRuleInput(body);
  return this.db.$transaction(async tx=>{
   const current=await tx.taxRule.findFirst({where:{id:ruleId,organizationId:orgId,status:'DRAFT'}});
   if(!current||input.code!==current.code)throw new BadRequestException('Only draft tax rates may be edited; approved rates require a new code/version.');
   const changed=await tx.taxRule.updateMany({where:{id:ruleId,organizationId:orgId,status:'DRAFT'},data:input});
   if(changed.count!==1)throw new BadRequestException('Tax rate changed concurrently.');
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'TAX_RULE',entityId:ruleId,action:'TAX_RULE_DRAFT_EDITED',detail:{organizationId:orgId,code:input.code,ratePercent:input.ratePercent.toString()}}});
   return tx.taxRule.findUniqueOrThrow({where:{id:ruleId}});
  },{isolationLevel:'Serializable'});
 }
 @Post(':orgId/rules/:ruleId/approve')async approve(@Req()req:ScopeRequest,@Param('orgId')orgId:string,@Param('ruleId')ruleId:string){
  await this.finance(req,orgId);
  return this.db.$transaction(async tx=>{
   const changed=await tx.taxRule.updateMany({where:{id:ruleId,organizationId:orgId,status:'DRAFT'},data:{status:'APPROVED',approvedById:req.user.id,approvedAt:new Date()}});
   if(changed.count!==1)throw new BadRequestException('Only a draft rule can be approved.');
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'TAX_RULE',entityId:ruleId,action:'TAX_RULE_APPROVED',detail:{organizationId:orgId}}});
   return tx.taxRule.findUniqueOrThrow({where:{id:ruleId}});
  },{isolationLevel:'Serializable'});
 }
 @Post(':orgId/rules/:ruleId/archive')async archive(@Req()req:ScopeRequest,@Param('orgId')orgId:string,@Param('ruleId')ruleId:string){
  await this.finance(req,orgId);
  return this.db.$transaction(async tx=>{
   const change=await tx.taxRule.updateMany({where:{id:ruleId,organizationId:orgId,status:'APPROVED'},data:{status:'ARCHIVED'}});
   if(change.count!==1)throw new BadRequestException('Only approved rules can be archived.');
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'TAX_RULE',entityId:ruleId,action:'TAX_RULE_ARCHIVED',detail:{organizationId:orgId}}});
   return {archived:true};
  },{isolationLevel:'Serializable'});
 }
 /** A finance-approved rule is snapshotted with the invoice; future rule edits cannot change an issued invoice. */
 @Post(':orgId/invoices/:invoiceId/apply-rule')async apply(@Req()req:ScopeRequest,@Param('orgId')orgId:string,@Param('invoiceId')invoiceId:string,@Body()body:any){
  await this.finance(req,orgId);
  const ruleId=String(body?.ruleId||'');const rationale=String(body?.rationale||'').trim();
  if(rationale.length<15||rationale.length>4000)throw new BadRequestException('Document the tax basis in at least 15 characters.');
  return this.db.$transaction(async tx=>{
   const invoice=await tx.invoice.findFirst({where:{id:invoiceId,account:{organizationId:orgId}},include:{document:true,taxReview:true}});
   if(!invoice||invoice.issuedAt||invoice.document||invoice.taxReview||invoice.status!=='DRAFT')throw new BadRequestException('Only a draft unissued invoice can receive its first tax review.');
   const rule=await tx.taxRule.findFirst({where:{id:ruleId,organizationId:orgId,status:'APPROVED'}});
   if(!rule)throw new BadRequestException('An approved tax rule belonging to this organization is required.');
   const now=new Date();
   if((rule.effectiveFrom&&rule.effectiveFrom>now)||(rule.effectiveTo&&rule.effectiveTo<now))throw new BadRequestException('Tax rule is outside its validity dates.');
   const {tax,total}=taxTotals(new Prisma.Decimal(invoice.subtotal),new Prisma.Decimal(rule.ratePercent));
   const updated=await tx.invoice.updateMany({where:{id:invoice.id,status:'DRAFT',issuedAt:null,taxReview:{is:null}},data:{tax,total}});
   if(updated.count!==1)throw new BadRequestException('Invoice changed concurrently.');
   const review=await tx.invoiceTaxReview.create({data:{invoiceId:invoice.id,jurisdiction:rule.jurisdiction,treatment:rule.treatment,rationale,reviewedSubtotal:invoice.subtotal,reviewedTax:tax,reviewedTotal:total,reviewedById:req.user.id,taxRuleId:rule.id,ruleCodeSnapshot:rule.code,ruleInvoiceNoteSnapshot:rule.invoiceNote,ratePercentSnapshot:rule.ratePercent}});
   await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'INVOICE',entityId:invoice.id,action:'INVOICE_TAX_RULE_APPLIED',detail:{organizationId:orgId,ruleId:rule.id,code:rule.code,ratePercent:rule.ratePercent.toString(),tax:tax.toString(),total:total.toString(),reviewId:review.id}}});
   return {invoiceId:invoice.id,ruleCode:rule.code,tax:tax.toFixed(2),total:total.toFixed(2),reviewId:review.id};
  },{isolationLevel:'Serializable'});
 }
}
