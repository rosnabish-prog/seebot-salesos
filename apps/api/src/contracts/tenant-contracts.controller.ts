import {BadRequestException,Body,Controller,Delete,Get,Param,Patch,Post,Req,UseGuards,ForbiddenException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {validatePricingLine} from './pricing-validation';
import {email,validateAmendmentLines} from '../commercial/commercial-policy';

@UseGuards(IdentityGuard)
@Controller('workspace-contracts')
export class TenantContractsController{
 constructor(private db:PrismaService,private scope:TenantScopeService){}
 private async editable(req:ScopedRequest,orgId:string,contractId:string){
  await this.scope.membership(req,orgId,true);const contract=await this.scope.contract(orgId,contractId);
  if(contract.status!=='DRAFT')throw new BadRequestException('Only draft contracts can be edited directly. Create an amendment after commercial terms are agreed.');
  return contract;
 }
 private async admin(req:ScopedRequest,orgId:string){
  const member=await this.scope.membership(req,orgId,true);if(!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('Workspace administrator approval required.');return member;
 }
 @Get(':orgId/:contractId/pricing')async pricing(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string){
  await this.scope.membership(req,orgId);await this.scope.contract(orgId,contractId);
  const effective=await this.db.contractAmendment.findFirst({where:{contractId,status:'APPROVED',effectiveAt:{lte:new Date()}},orderBy:[{effectiveAt:'desc'},{version:'desc'}]});
  if(effective&&Array.isArray(effective.pricingSnapshot))return (effective.pricingSnapshot as any[]).map((line,index)=>({...line,id:'amendment:'+effective.id+':'+index,version:effective.version,effectiveAt:effective.effectiveAt}));
  return this.db.contractPricingLine.findMany({where:{contractId},orderBy:{createdAt:'asc'}});
 }
 @Post(':orgId/:contractId/pricing')async addPricing(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Body()body:unknown){
  const contract=await this.editable(req,orgId,contractId);let data;try{data=validatePricingLine(body,contract.currency)}catch(e){throw new BadRequestException((e as Error).message)}
  const line=await this.db.contractPricingLine.create({data:{contractId,...data}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTRACT_PRICING_ADDED',entityType:'CONTRACT',entityId:contractId,detail:{organizationId:orgId,lineId:line.id,model:line.model}}});return line;
 }
 @Patch(':orgId/:contractId/pricing/:lineId')async editPricing(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Param('lineId')lineId:string,@Body()body:unknown){
  const contract=await this.editable(req,orgId,contractId),existing=await this.db.contractPricingLine.findFirst({where:{id:lineId,contractId}});if(!existing)throw new BadRequestException('Pricing line not found.');
  let data;try{data=validatePricingLine(body,contract.currency)}catch(e){throw new BadRequestException((e as Error).message)}
  return this.db.contractPricingLine.update({where:{id:existing.id},data});
 }
 @Delete(':orgId/:contractId/pricing/:lineId')async removePricing(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Param('lineId')lineId:string){
  await this.editable(req,orgId,contractId);const existing=await this.db.contractPricingLine.findFirst({where:{id:lineId,contractId}});if(!existing)throw new BadRequestException('Pricing line not found.');await this.db.contractPricingLine.delete({where:{id:existing.id}});return {deleted:true};
 }
 @Get(':orgId/:contractId/signatories')async signatories(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string){
  await this.scope.membership(req,orgId);await this.scope.contract(orgId,contractId);return this.db.contractSignatory.findMany({where:{contractId},orderBy:[{signingOrder:'asc'},{createdAt:'asc'}]});
 }
 @Post(':orgId/:contractId/signatories')async addSignatory(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Body()body:any){
  const contract=await this.editable(req,orgId,contractId);
  if(await this.db.signingEnvelope.count({where:{contractId,status:{in:['INVITED','SIGNED']}}}))throw new BadRequestException('Signer roster is locked after signing starts.');
  const name=String(body?.name||'').trim(),address=email(body?.email),role=String(body?.role||'SIGNER'),signingOrder=Number(body?.signingOrder||1);
  if(name.length<2||name.length>160||!['SIGNER','APPROVER','CC'].includes(role)||!Number.isInteger(signingOrder)||signingOrder<1||signingOrder>30)throw new BadRequestException('Valid signer name, role and order required.');
  return this.db.contractSignatory.create({data:{contractId,name,email:address,role,signingOrder}});
 }
 @Get(':orgId/:contractId/amendments')async amendments(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string){
  await this.scope.membership(req,orgId);await this.scope.contract(orgId,contractId);return this.db.contractAmendment.findMany({where:{contractId},orderBy:{version:'desc'}});
 }
 @Post(':orgId/:contractId/amendments')async createAmendment(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Body()body:any){
  await this.scope.membership(req,orgId,true);const contract=await this.scope.contract(orgId,contractId);
  if(!['SIGNED','DRAFT'].includes(contract.status))throw new BadRequestException('Contract is not eligible for amendment.');
  const lines=validateAmendmentLines(body?.pricingLines),effectiveAt=new Date(body?.effectiveAt),title=String(body?.title||'').trim(),rationale=String(body?.rationale||'').trim();
  if(!Number.isFinite(effectiveAt.getTime())||title.length<2||title.length>180||rationale.length<3||rationale.length>5000)throw new BadRequestException('Valid amendment title, rationale and effective date required.');
  return this.db.$transaction(async tx=>{const last=await tx.contractAmendment.findFirst({where:{contractId},orderBy:{version:'desc'}});return tx.contractAmendment.create({data:{contractId,version:(last?.version||0)+1,title,rationale,effectiveAt,pricingSnapshot:lines,createdById:req.user.id}})},{isolationLevel:'Serializable'});
 }
 @Post(':orgId/:contractId/amendments/:amendmentId/approve')async approveAmendment(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Param('amendmentId')amendmentId:string){
  await this.admin(req,orgId);await this.scope.contract(orgId,contractId);
  const draft=await this.db.contractAmendment.findFirst({where:{id:amendmentId,contractId,status:'DRAFT'}});if(!draft)throw new BadRequestException('Amendment draft unavailable.');
  const changed=await this.db.contractAmendment.updateMany({where:{id:amendmentId,status:'DRAFT'},data:{status:'APPROVED',approvedById:req.user.id,approvedAt:new Date()}});if(changed.count!==1)throw new BadRequestException('Amendment already processed.');
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTRACT_AMENDMENT_APPROVED',entityType:'CONTRACT',entityId:contractId,detail:{organizationId:orgId,amendmentId,version:draft.version}}});
  return {approved:true,version:draft.version,notice:'Commercial approval recorded. Client execution or signature evidence remains separate.'};
 }
}
