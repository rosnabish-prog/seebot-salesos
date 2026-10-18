import {BadRequestException,Body,Controller,Param,Post,Req,UseGuards,ForbiddenException} from '@nestjs/common';
import {IdentityGuard} from '../workspace/identity.guard';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthRequest} from '../common/auth.guard';
/** Tax selection is a documented accountant decision, not an inferred rule. */
@UseGuards(IdentityGuard) @Controller('workspace-tax')
export class TaxReviewController{
 constructor(private db:PrismaService){}
 @Post(':orgId/invoices/:invoiceId/review')async review(@Req()req:AuthRequest,@Param('orgId')orgId:string,@Param('invoiceId')invoiceId:string,@Body()body:any){
  if((req as any).selectedWorkspace!==orgId)throw new ForbiddenException('Select the company workspace.');
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}}});
  if(!member||member.status!=='ACTIVE'||!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('Financial manager membership required.');
  const invoice=await this.db.invoice.findFirst({where:{id:invoiceId,account:{organizationId:orgId}},include:{taxReview:true,document:true}});
  if(!invoice||invoice.issuedAt||invoice.document||invoice.taxReview||!['DRAFT','APPROVED'].includes(invoice.status))throw new BadRequestException('Only unissued invoices can receive a tax review.');
  const jurisdiction=String(body?.jurisdiction||'').trim(),treatment=String(body?.treatment||'').trim(),rationale=String(body?.rationale||'').trim();
  if(!/^[A-Z]{2}$/.test(jurisdiction)||!['STANDARD','REDUCED','ZERO','EXEMPT','OUT_OF_SCOPE','REVERSE_CHARGE','OTHER_MANUAL'].includes(treatment)||rationale.length<15||rationale.length>4000)throw new BadRequestException('Jurisdiction, treatment and 15-character rationale required.');
  if(['ZERO','EXEMPT','OUT_OF_SCOPE','REVERSE_CHARGE'].includes(treatment)&&Number(invoice.tax)!==0)throw new BadRequestException('This treatment requires zero recorded tax.');
  return this.db.$transaction(async tx=>{
    const snapshot=await tx.invoiceTaxReview.create({data:{invoiceId,jurisdiction,treatment,rationale,reviewedSubtotal:invoice.subtotal,reviewedTax:invoice.tax,reviewedTotal:invoice.total,reviewedById:req.user.id}});
    await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'INVOICE',entityId:invoiceId,action:'INVOICE_TAX_REVIEWED',detail:{jurisdiction,treatment,reviewId:snapshot.id,organizationId:orgId}}});return snapshot;
  },{isolationLevel:'Serializable'});
 }
}
