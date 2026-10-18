import {BadRequestException,Body,Controller,Get,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,ensureCanEdit,ensureOwner,requireManager} from '../common/auth.guard';
import {email,validateAmendmentLines} from './commercial-policy';

@UseGuards(AuthGuard) @Controller('commercial/contracts')
export class ContractsExpansionController {
 constructor(private db:PrismaService){}
 private async check(req:AuthRequest,id:string,edit=false){
  const c=await this.db.contract.findUnique({where:{id},include:{opportunity:true}});
  if(!c)throw new BadRequestException('Contract not found.');
  if(edit)ensureCanEdit(req.user,c.opportunity.ownerId);else ensureOwner(req.user,c.opportunity.ownerId);
  return c;
 }
 @Get(':id/amendments') async amendments(@Req()req:AuthRequest,@Param('id')id:string){await this.check(req,id);return this.db.contractAmendment.findMany({where:{contractId:id},orderBy:{version:'desc'}});}
 @Post(':id/amendments') async createAmendment(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:any){
  const c=await this.check(req,id,true);
  if(!['SIGNED','DRAFT'].includes(c.status))throw new BadRequestException('Contract is not eligible for a new amendment.');
  const lines=validateAmendmentLines(body?.pricingLines),effectiveAt=new Date(body?.effectiveAt);
  if(!Number.isFinite(effectiveAt.getTime())||typeof body?.rationale!=='string'||!body.rationale.trim()||typeof body?.title!=='string'||!body.title.trim())throw new BadRequestException('Title, rationale and effective date required.');
  return this.db.$transaction(async tx=>{
   const last=await tx.contractAmendment.findFirst({where:{contractId:id},orderBy:{version:'desc'}});
   return tx.contractAmendment.create({data:{contractId:id,version:(last?.version||0)+1,title:body.title.slice(0,180),rationale:body.rationale.slice(0,5000),effectiveAt,pricingSnapshot:lines,createdById:req.user.id}});
  },{isolationLevel:'Serializable'});
 }
 @Post(':id/amendments/:amendmentId/approve') async approve(@Req()req:AuthRequest,@Param('id')id:string,@Param('amendmentId')aid:string){
  await this.check(req,id);requireManager(req.user);
  const draft=await this.db.contractAmendment.findFirst({where:{id:aid,contractId:id,status:'DRAFT'}});
  if(!draft)throw new BadRequestException('Amendment draft unavailable.');
  const result=await this.db.contractAmendment.updateMany({where:{id:aid,status:'DRAFT'},data:{status:'APPROVED',approvedAt:new Date(),approvedById:req.user.id}});
  if(result.count!==1)throw new BadRequestException('Amendment already processed.');
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'CONTRACT_AMENDMENT_APPROVED',entityType:'CONTRACT',entityId:id,detail:{amendmentId:aid,version:draft.version,effectiveAt:draft.effectiveAt.toISOString()}}});
  return {approved:true,version:draft.version,notice:'Commercial approval only. External signing or client consent must be evidenced separately before these terms are treated as executed.'};
 }
 @Get(':id/signatories') async signatories(@Req()req:AuthRequest,@Param('id')id:string){await this.check(req,id);return this.db.contractSignatory.findMany({where:{contractId:id},orderBy:[{signingOrder:'asc'},{createdAt:'asc'}]});}
 @Post(':id/signatories') async addSignatory(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:any){
  const c=await this.check(req,id,true);
  if(c.status==='SIGNED'||c.status==='TERMINATED')throw new BadRequestException('Signed or terminated documents cannot be changed.');
  if(await this.db.signingEnvelope.count({where:{contractId:id,status:{in:['INVITED','SIGNED']}}}))throw new BadRequestException('Signer roster is locked after signing starts. Create a new agreement version to change signers.');
  const name=String(body?.name||'').trim(),address=email(body?.email),role=String(body?.role||'SIGNER'),signingOrder=Number(body?.signingOrder||1);
  if(name.length<2||name.length>160||!['SIGNER','APPROVER','CC'].includes(role)||!Number.isInteger(signingOrder)||signingOrder<1||signingOrder>30)throw new BadRequestException('Valid signer name, role and order required.');
  return this.db.contractSignatory.create({data:{contractId:id,name,email:address,role,signingOrder}});
 }
}
