import {Injectable,ServiceUnavailableException,ForbiddenException,BadRequestException} from '@nestjs/common';
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import * as path from 'node:path';
import {PrismaService} from '../prisma/prisma.service';
import {auditDigest} from './security';
import {ImmutableEvidenceStore} from './immutable-evidence.store';

/** An independently verifiable Ed25519 evidence seal, written on a separately provisioned mount. */
@Injectable()
export class EvidenceArchiveService {
 constructor(private db:PrismaService){}
 private readonly immutable=new ImmutableEvidenceStore();
 private config(){
  const dir=process.env.SIGNING_EVIDENCE_DIR,privateKeyPath=process.env.SIGNING_EVIDENCE_PRIVATE_KEY_FILE,publicKeyPath=process.env.SIGNING_EVIDENCE_PUBLIC_KEY_FILE;
  if(!dir||!path.isAbsolute(dir)||!privateKeyPath||!path.isAbsolute(privateKeyPath)||!publicKeyPath||!path.isAbsolute(publicKeyPath))throw new ServiceUnavailableException('Independent evidence archive storage and signing key path required.');
  return {dir,privateKeyPath,publicKeyPath};
 }
 private name(id:string){if(!/^[a-z0-9_-]{10,100}$/i.test(id))throw new BadRequestException('Invalid envelope ID');return id+'.json';}
 async archive(envelopeId:string){
  const env=await this.db.signingEnvelope.findUnique({where:{id:envelopeId},include:{audit:{orderBy:{sequence:'asc'}},document:true}});
  if(!env||!env.audit.length)throw new BadRequestException('Signing audit not found.');
  const hmac=process.env.SIGNING_AUDIT_KEY;
  if(!hmac||hmac.length<32)throw new ServiceUnavailableException('Signing audit key required.');
  let previous='GENESIS';for(let i=0;i<env.audit.length;i++){
   const a=env.audit[i];const digest=auditDigest(hmac,{envelopeId,sequence:a.sequence,type:a.type,actorEmail:a.actorEmail,googleSub:a.googleSub,ipAddress:a.ipAddress,userAgent:a.userAgent,metadata:a.metadata,occurredAt:a.occurredAt.toISOString(),previousDigest:a.previousDigest});
   if(a.sequence!==i+1||a.previousDigest!==previous||a.digest!==digest)throw new ForbiddenException('Audit chain integrity failure.');previous=a.digest;
  }
  const config=this.config();const privateKey=createPrivateKey(await readFile(config.privateKeyPath,'utf8'));
  if(privateKey.asymmetricKeyType!=='ed25519')throw new ServiceUnavailableException('Ed25519 evidence private key required.');
  const pinned=createPublicKey(await readFile(config.publicKeyPath,'utf8'));
  if(pinned.asymmetricKeyType!=='ed25519'||!pinned.export({format:'der',type:'spki'}).equals(createPublicKey(privateKey).export({format:'der',type:'spki'})))throw new ServiceUnavailableException('Private signing key does not match the independently provisioned public key.');
  const payload={format:'seebot-signing-evidence-v1',envelopeId,contractId:env.contractId,recipientEmail:env.recipientEmail,recipientGoogleSub:env.recipientGoogleSub,sourceDocumentSha256:env.documentSha256,executedDocumentId:env.signedDocumentId,completedAt:env.signedAt?.toISOString()||null,eventCount:env.audit.length,finalHmacDigest:previous,events:env.audit.map(a=>({sequence:a.sequence,type:a.type,actorEmail:a.actorEmail,googleSub:a.googleSub,ipAddress:a.ipAddress,userAgent:a.userAgent,metadata:a.metadata,occurredAt:a.occurredAt.toISOString(),previousDigest:a.previousDigest,digest:a.digest}))};
  const body=JSON.stringify(payload);const receipt={payload,sha256:createHash('sha256').update(body).digest('hex'),signatureAlgorithm:'Ed25519',signature:sign(null,Buffer.from(body),privateKey).toString('base64')};
  await mkdir(config.dir,{recursive:true,mode:0o700});const filename=path.join(config.dir,this.name(envelopeId));
  // A first archive is immutable in the application. Later events (e.g. downloads) must
  // be exported as a new dated checkpoint instead of overwriting this receipt.
  try{await writeFile(filename,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});}
  catch(error:any){if(error?.code!=='EEXIST')throw error;
   const original=JSON.parse(await readFile(filename,'utf8'));
   const publicKey=createPublicKey(privateKey);const existingBytes=Buffer.from(JSON.stringify(original.payload));
   const valid=original.sha256===createHash('sha256').update(existingBytes).digest('hex')&&verify(null,existingBytes,publicKey,Buffer.from(original.signature,'base64'));
   if(original.payload?.finalHmacDigest!==receipt.payload.finalHmacDigest||original.payload?.eventCount!==receipt.payload.eventCount||original.payload?.sourceDocumentSha256!==receipt.payload.sourceDocumentSha256)throw new ForbiddenException('Existing evidence anchor differs from current signing events.');
   if(!valid||original.payload?.envelopeId!==envelopeId)throw new ForbiddenException('Existing external evidence checkpoint mismatch.');
   await this.immutable.persist(envelopeId,await readFile(filename,'utf8'));
   return {archived:true,reused:true,sha256:original.sha256,eventsAtAnchor:original.payload.eventCount};
  }
  await this.immutable.persist(envelopeId,await readFile(filename,'utf8'));
  return {archived:true,reused:false,sha256:receipt.sha256,eventsAtAnchor:env.audit.length};
 }
 /** Finalize only if every required signer has signed AND each envelope has a valid sealed receipt. */
 async finalizeAfterEvidence(contractId:string){
  const parties=await this.db.contractSignatory.findMany({where:{contractId,role:{in:['SIGNER','APPROVER']}}});
  if(!parties.length||parties.some(p=>p.status!=='SIGNED'))return {finalized:false,reason:'Required signers still pending.'};
  const envelopes=await this.db.signingEnvelope.findMany({where:{contractId,status:'SIGNED',signatoryId:{not:null}},orderBy:{signedAt:'asc'}});
  if(envelopes.length!==parties.length||parties.some(p=>!envelopes.some(e=>e.signatoryId===p.id&&e.signedDocumentId)))return {finalized:false,reason:'Missing signed envelope.'};
  for(const env of envelopes){const evidence=await this.verify(env.id);if(!evidence.valid)return {finalized:false,reason:'Evidence receipt unverified.'};}
  const latest=envelopes[envelopes.length-1];
  if(!latest.signedDocumentId)return {finalized:false,reason:'Final signed PDF unavailable.'};
  const doc=await this.db.contractDocument.findFirst({where:{id:latest.signedDocumentId,contractId,kind:'EXECUTED'}});
  if(!doc)return {finalized:false,reason:'Final signed document missing.'};
  const changed=await this.db.contract.updateMany({where:{id:contractId,status:'PENDING_SIGNATURE'},data:{status:'SIGNED',signedAt:latest.signedAt,evidenceReference:doc.sha256}});
  return {finalized:changed.count===1||Boolean((await this.db.contract.findUnique({where:{id:contractId}}))?.status==='SIGNED'),sha256:doc.sha256};
 }
 async verify(envelopeId:string){
  const {dir,publicKeyPath}=this.config();
  const receiptText=await readFile(path.join(dir,this.name(envelopeId)),'utf8');
  await this.immutable.verify(envelopeId,receiptText);
  const receipt=JSON.parse(receiptText);
  const bytes=Buffer.from(JSON.stringify(receipt.payload));const key=createPublicKey(await readFile(publicKeyPath,'utf8'));
  if(key.asymmetricKeyType!=='ed25519')throw new ServiceUnavailableException('Ed25519 public verification key required.');
  const valid=receipt.payload?.envelopeId===envelopeId&&receipt.sha256===createHash('sha256').update(bytes).digest('hex')&&verify(null,bytes,key,Buffer.from(receipt.signature,'base64'));
  const events=Array.isArray(receipt.payload?.events)?receipt.payload.events:[];
  const auditEvents=await this.db.signingAuditEvent.findMany({where:{envelopeId},orderBy:{sequence:'asc'},take:events.length});
  const matchingAudit=events.length>0&&auditEvents.length===events.length&&events.every((event:any,i:number)=>{
   const stored=auditEvents[i];return stored.sequence===event.sequence&&stored.digest===event.digest&&stored.previousDigest===event.previousDigest&&stored.type===event.type&&stored.occurredAt.toISOString()===event.occurredAt;
  });
  const validReceipt=Boolean(valid&&matchingAudit&&receipt.payload.eventCount===events.length&&receipt.payload.finalHmacDigest===events[events.length-1]?.digest);
  return {envelopeId,valid:validReceipt,sha256:receipt.sha256,eventsAtAnchor:receipt.payload?.eventCount,warning:'Retain the pinned public key independently and copy receipts to offsite immutable storage.'};
 }
 /** Authorized administrators can export the complete sealed receipt for independent offline verification. */
 async exportReceipt(envelopeId:string){
  const check=await this.verify(envelopeId);
  if(!check.valid)throw new ForbiddenException('Signing evidence failed signature/hash verification.');
  const {dir}=this.config();
  return JSON.parse(await readFile(path.join(dir,this.name(envelopeId)),'utf8'));
 }
}
