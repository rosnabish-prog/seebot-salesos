import {BadRequestException,Body,Controller,Delete,Get,Param,Patch,Post,Req,UseGuards,ForbiddenException,UploadedFile,UseInterceptors,Res,StreamableFile} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from '../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../workspace/tenant-scope.service';
import {validatePricingLine} from './pricing-validation';
import {email,validateAmendmentLines} from '../commercial/commercial-policy';
import {FileInterceptor} from '@nestjs/platform-express';
import type {Response} from 'express';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,existsSync,mkdirSync,promises as fs} from 'node:fs';
import * as path from 'node:path';
import {OpportunityWorkflowService} from '../opportunities/workflow.service';

const storageDir=process.env.DOCUMENT_STORAGE_DIR||path.resolve(process.cwd(),'private-contract-documents');

@UseGuards(IdentityGuard)
@Controller('workspace-contracts')
export class TenantContractsController{
 constructor(private db:PrismaService,private scope:TenantScopeService,private workflow:OpportunityWorkflowService){}
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
 @Post(':orgId/:contractId/documents') @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024}}))
 async uploadDocument(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@UploadedFile()file:any,@Body()body:{kind?:string}){
  await this.scope.membership(req,orgId,true);await this.scope.contract(orgId,contractId);
  if(!file?.buffer||file.buffer.length<8||file.buffer.subarray(0,5).toString()!=='%PDF-')throw new BadRequestException('Upload a valid PDF up to 10 MB.');
  const kind=['EXECUTED','DRAFT','AMENDMENT','OTHER'].includes(body.kind||'')?body.kind!:'DRAFT';
  const storageKey=randomUUID()+'.pdf',sha256=createHash('sha256').update(file.buffer).digest('hex');
  mkdirSync(storageDir,{recursive:true,mode:0o700});const finalPath=path.join(storageDir,storageKey);
  await fs.writeFile(finalPath,file.buffer,{flag:'wx',mode:0o600});
  try{
   const document=await this.db.contractDocument.create({data:{contractId,fileName:path.basename(file.originalname||'contract.pdf').slice(0,200),storageKey,mimeType:'application/pdf',size:file.buffer.length,sha256,kind,uploadedById:req.user.id}});
   await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTRACT_PDF_UPLOADED',entityType:'CONTRACT',entityId:contractId,detail:{organizationId:orgId,documentId:document.id,sha256,kind}}});
   return document;
  }catch(error){await fs.unlink(finalPath).catch(()=>{});throw error;}
 }
 @Get(':orgId/documents/:documentId/download')async downloadDocument(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('documentId')documentId:string,@Res({passthrough:true})res:Response){
  await this.scope.membership(req,orgId);
  const document=await this.db.contractDocument.findFirst({where:{id:documentId,contract:{opportunity:{account:{organizationId:orgId}}}}});
  if(!document)throw new BadRequestException('Document unavailable in this workspace.');
  const filename=path.join(storageDir,document.storageKey);if(!existsSync(filename))throw new BadRequestException('Document file is missing from secure storage.');
  const bytes=await fs.readFile(filename);if(createHash('sha256').update(bytes).digest('hex')!==document.sha256)throw new ForbiddenException('Contract document integrity check failed.');
  const safe=document.fileName.replace(/[\r\n"\\]/g,'_');res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','attachment; filename="'+safe+'"');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  return new StreamableFile(createReadStream(filename));
 }
 @Post(':orgId/:contractId/documents/:documentId/verify')async verifyExecuted(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Param('documentId')documentId:string){
  await this.admin(req,orgId);await this.scope.contract(orgId,contractId);
  const document=await this.db.contractDocument.findFirst({where:{id:documentId,contractId,kind:'EXECUTED'}});if(!document)throw new BadRequestException('Executed contract PDF missing.');
  const filename=path.join(storageDir,document.storageKey);if(!existsSync(filename))throw new BadRequestException('Document file missing.');
  const bytes=await fs.readFile(filename);if(createHash('sha256').update(bytes).digest('hex')!==document.sha256)throw new ForbiddenException('Contract document integrity check failed.');
  const updated=await this.db.contractDocument.update({where:{id:documentId},data:{verifiedById:req.user.id,verifiedAt:new Date()}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_SIGNED_DOCUMENT_MANUALLY_VERIFIED',entityType:'CONTRACT',entityId:contractId,detail:{organizationId:orgId,documentId,sha256:document.sha256}}});
  return updated;
 }
 @Post(':orgId/:contractId/confirm-signed')async confirmSigned(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Param('contractId')contractId:string,@Body()body:{documentId:string;signedAt:string;notes?:string}){
  await this.admin(req,orgId);const contract=await this.scope.contract(orgId,contractId);
  if(contract.status==='SIGNED')throw new BadRequestException('Contract already marked signed.');
  const document=await this.db.contractDocument.findFirst({where:{id:String(body?.documentId||''),contractId,kind:'EXECUTED',verifiedAt:{not:null}}});if(!document)throw new BadRequestException('A verified executed PDF is required.');
  const signedAt=new Date(body?.signedAt);if(!Number.isFinite(signedAt.getTime())||signedAt>new Date())throw new BadRequestException('Valid actual signing date required.');
  const notes=String(body?.notes||'').trim().slice(0,1000);
  await this.db.$transaction(async tx=>{
   await tx.contract.update({where:{id:contractId},data:{status:'SIGNED',signedAt,evidenceReference:'document:'+document.id+':'+document.sha256}});
   await tx.contractSignatureEvent.create({data:{contractId,event:'SIGNED_DOCUMENT_MANUALLY_CONFIRMED',source:'MANUAL_DOCUMENT_REVIEW',externalReference:document.id,isDemo:contract.isDemo,notes:notes||null,occurredAt:signedAt,recordedById:req.user.id}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'TENANT_CONTRACT_SIGNED_WITH_VERIFIED_PDF',entityType:'CONTRACT',entityId:contractId,detail:{organizationId:orgId,documentId:document.id,sha256:document.sha256}}});
  },{isolationLevel:'Serializable'});
  await this.workflow.tryAutoAdvance(contract.opportunityId,req.user.id);
  return this.db.contract.findUnique({where:{id:contractId}});
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
