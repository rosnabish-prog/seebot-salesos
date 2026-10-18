import {BadRequestException,Body,Controller,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,ensureCanEdit,ensureOwner,requireManager} from '../common/auth.guard';
import {money,email,nextBillingDate} from './commercial-policy';
import {canApproveCustomerCredit} from '../accounting/receivable-policy';

@UseGuards(AuthGuard) @Controller('commercial')
export class BillingExpansionController {
 constructor(private db:PrismaService){}
 private async invoice(req:AuthRequest,id:string,edit=false){const i=await this.db.invoice.findUnique({where:{id},include:{account:true,payments:true,adjustments:true}});if(!i)throw new BadRequestException('Invoice not found.');if(edit)ensureCanEdit(req.user,i.account.ownerId);else ensureOwner(req.user,i.account.ownerId);return i;}
 private async contract(req:AuthRequest,id:string,edit=false){const c=await this.db.contract.findUnique({where:{id},include:{opportunity:true}});if(!c)throw new BadRequestException('Contract not found.');if(edit)ensureCanEdit(req.user,c.opportunity.ownerId);else ensureOwner(req.user,c.opportunity.ownerId);return c;}
 @Get('invoices/:id/adjustments')async adjustments(@Req()req:AuthRequest,@Param('id')id:string){await this.invoice(req,id);return this.db.invoiceAdjustment.findMany({where:{invoiceId:id},include:{creditNoteDocument:{select:{id:true,number:true,issuedAt:true}}},orderBy:{createdAt:'desc'}});}
 @Post('invoices/:id/adjustments') async createCredit(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:any){
  const inv=await this.invoice(req,id,true);
  if(inv.isDemo&&body?.isDemo!==true)throw new BadRequestException('Demo adjustments must be explicitly labeled.');
  if(['DRAFT','VOID'].includes(inv.status))throw new BadRequestException('Only issued invoices can receive credit adjustments.');
  const kind=String(body?.kind||'CREDIT_NOTE'),amount=money(body?.amount),reason=String(body?.reason||'').trim();
  if(!['CREDIT_NOTE','WRITE_OFF'].includes(kind)||reason.length<3||reason.length>2000)throw new BadRequestException('Credit type and reason required.');
  const paid=inv.payments.reduce((n,p)=>n+Number(p.amount),0),approved=inv.adjustments.filter(x=>x.status==='APPROVED'&&x.kind==='CREDIT_NOTE').reduce((n,x)=>n+Number(x.amount),0);
  if(amount>Number(inv.total)-paid-approved+0.001)throw new BadRequestException('Credit exceeds the unpaid balance.');
  return this.db.invoiceAdjustment.create({data:{invoiceId:id,kind,amount,reason,createdById:req.user.id}});
 }
 @Post('invoices/:id/adjustments/:adjustmentId/approve') async approveCredit(@Req()req:AuthRequest,@Param('id')id:string,@Param('adjustmentId')aid:string){
  await this.invoice(req,id);requireManager(req.user);
  return this.db.$transaction(async tx=>{
   const inv=await tx.invoice.findUnique({where:{id},include:{payments:true,adjustments:true}}),adjust=await tx.invoiceAdjustment.findFirst({where:{id:aid,invoiceId:id,status:'DRAFT'}});
   if(!inv||!adjust)throw new BadRequestException('Adjustment not available.');
   const remaining=Number(inv.total)-inv.payments.reduce((n,p)=>n+Number(p.amount),0)-inv.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0);
   if(!canApproveCustomerCredit(inv,adjust.amount))throw new BadRequestException('Credit exceeds unpaid customer receivable.');
   await tx.invoiceAdjustment.update({where:{id:aid},data:{status:'APPROVED',approvedById:req.user.id,approvedAt:new Date()}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'INVOICE_CREDIT_APPROVED',entityType:'INVOICE',entityId:id,detail:{adjustmentId:aid,amount:String(adjust.amount),kind:adjust.kind}}});
   return {approved:true,note:'Accounting credit note document and external ledger synchronization remain disabled until verified.'};
  },{isolationLevel:'Serializable'});
 }
 @Get('invoices/:id/recipients')async recipients(@Req()req:AuthRequest,@Param('id')id:string){await this.invoice(req,id);return this.db.invoiceRecipient.findMany({where:{invoiceId:id},orderBy:{createdAt:'asc'}});}
 @Post('invoices/:id/recipients')async addRecipient(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:any){await this.invoice(req,id,true);const address=email(body?.email),kind=String(body?.kind||'CC');if(!['TO','CC'].includes(kind))throw new BadRequestException('Recipient must be TO or CC.');return this.db.invoiceRecipient.upsert({where:{invoiceId_email:{invoiceId:id,email:address}},create:{invoiceId:id,email:address,name:String(body?.name||'').slice(0,160),kind},update:{kind,name:String(body?.name||'').slice(0,160)}});}
 @Get('contracts/:id/schedules')async schedules(@Req()req:AuthRequest,@Param('id')id:string){await this.contract(req,id);return this.db.billingSchedule.findMany({where:{contractId:id},orderBy:{createdAt:'asc'}});}
 @Post('contracts/:id/schedules')async addSchedule(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:any){const contract=await this.contract(req,id,true);const cadence=String(body?.cadence||''),title=String(body?.description||'').trim(),currency=String(body?.currency||contract.currency||'USD');if(!['MONTHLY','QUARTERLY','MILESTONE','ONE_TIME'].includes(cadence)||!title||title.length>250||!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Invalid schedule fields.');const amount=body.amount==null?null:money(body.amount);const due=body.nextDueAt?new Date(body.nextDueAt):null;if(due&&!Number.isFinite(due.getTime()))throw new BadRequestException('Invalid billing date.');if(['MONTHLY','QUARTERLY','ONE_TIME'].includes(cadence)&&(!amount||!due))throw new BadRequestException('Recurring or one-time billing requires amount and next date.');return this.db.billingSchedule.create({data:{contractId:id,description:title,cadence,amount,currency,nextDueAt:due,createdById:req.user.id}});}
 @Get('billing/due-preview')async duePreview(@Req()req:AuthRequest){requireManager(req.user);const schedules=await this.db.billingSchedule.findMany({where:{status:'ACTIVE',nextDueAt:{lte:new Date()}},include:{contract:{include:{opportunity:{include:{account:true}}}}},take:100});return {mode:'PREVIEW_ONLY',items:schedules.filter(x=>!x.contract.isDemo).map(x=>({id:x.id,contract:x.contract.title,client:x.contract.opportunity.account.name,amount:x.amount,currency:x.currency,cadence:x.cadence,nextDueAt:x.nextDueAt})),invoicesCreated:0};}
}
