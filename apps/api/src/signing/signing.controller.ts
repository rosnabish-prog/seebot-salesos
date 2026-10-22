import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Req, Res, ServiceUnavailableException, StreamableFile, UseGuards, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { OutgoingMessageService } from '../communications/outgoing-message.service';
import { AuthGuard, AuthRequest, ensureCanEdit, ensureOwner, requireManager } from '../common/auth.guard';
import {EvidenceArchiveService} from './evidence-archive.service';
import {nextRequiredSigner} from './signing-order';
import { auditDigest, equalNormalizedEmail, googleEmailAuthoritative, hashInvitationToken, newInvitationToken, SIGNING_CONSENT, SIGNING_CONSENT_VERSION } from './security';

const storageDir=process.env.DOCUMENT_STORAGE_DIR||path.resolve(process.cwd(),'private-contract-documents');
const text=(v:unknown,max=180)=>typeof v==='string'?v.trim().slice(0,max):'';
const validEmail=(v:unknown)=>typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const sha256=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
function assertConfigured(){
  if(process.env.SIGNING_ENABLED!=='true') throw new ServiceUnavailableException('External signing is disabled until the integration is verified.');
  if(!process.env.GOOGLE_SIGNING_CLIENT_ID||!process.env.SIGNING_AUDIT_KEY||process.env.SIGNING_AUDIT_KEY.length<32||!process.env.SIGNING_EVIDENCE_DIR||!process.env.SIGNING_EVIDENCE_PRIVATE_KEY_FILE||!process.env.SIGNING_EVIDENCE_PUBLIC_KEY_FILE||!/^https:\/\//.test(process.env.SIGNING_PUBLIC_BASE_URL||''))
    throw new ServiceUnavailableException('Secure signing configuration is incomplete.');
}
function auditKey(){const k=process.env.SIGNING_AUDIT_KEY;if(!k||k.length<32)throw new ServiceUnavailableException('Signing audit key not configured.');return k;}

// Append-only application events. DB permissions must deny UPDATE/DELETE on this table
// in production; offsite digest anchoring and immutable backups are additional requirements.
async function recordEvent(tx:any,envelopeId:string,type:string,meta:{actorEmail?:string|null;googleSub?:string|null;ipAddress?:string|null;userAgent?:string|null;metadata?:any}={}){
  const previous=await tx.signingAuditEvent.findFirst({where:{envelopeId},orderBy:{sequence:'desc'}});
  const event={envelopeId,sequence:(previous?.sequence||0)+1,type,actorEmail:meta.actorEmail||null,googleSub:meta.googleSub||null,ipAddress:meta.ipAddress||null,userAgent:meta.userAgent||null,metadata:meta.metadata||{},occurredAt:new Date(),previousDigest:previous?.digest||'GENESIS'};
  return tx.signingAuditEvent.create({data:{...event,digest:auditDigest(auditKey(),{...event,occurredAt:event.occurredAt.toISOString()})}});
}

@Controller('signing')
export class ExternalSigningController {
  private readonly google=new OAuth2Client();
  constructor(private db:PrismaService,private messages:OutgoingMessageService,private evidence:EvidenceArchiveService){}
  private async authorize(data:{token?:string;googleIdToken?:string},allowCompleted=false){
    assertConfigured();
    if(typeof data?.token!=='string'||!(/^[\w-]{40,90}$/.test(data.token))||typeof data.googleIdToken!=='string'||data.googleIdToken.length>12000)
      throw new UnauthorizedException('Valid invitation and Google authentication are required.');
    const env=await this.db.signingEnvelope.findUnique({where:{tokenHash:hashInvitationToken(data.token)},include:{document:true}});
    if(!env || env.revokedAt || !(env.status==='INVITED' && env.expiresAt>new Date() || allowCompleted && env.status==='SIGNED' && env.signedAt && Date.now()-env.signedAt.getTime()<30*86400000)) throw new UnauthorizedException('Invitation is unavailable, revoked or expired.');
    let payload;
    try { const ticket=await this.google.verifyIdToken({idToken:data.googleIdToken,audience:process.env.GOOGLE_SIGNING_CLIENT_ID!});payload=ticket.getPayload(); }
    catch { throw new UnauthorizedException('Google sign-in is invalid or has expired. Please sign in again.'); }
    if(!payload?.sub||!payload.email||!googleEmailAuthoritative(payload.email,Boolean(payload.email_verified),payload.hd)||!equalNormalizedEmail(payload.email,env.recipientEmail))
      throw new ForbiddenException('This invitation requires the verified Google account of the named recipient. Contact the sender if you use a non-Google-hosted business email.');
    if(env.recipientGoogleSub && env.recipientGoogleSub!==payload.sub)throw new ForbiddenException('Invitation is bound to a different Google account.');
    return {env,googleSub:payload.sub,email:payload.email};
  }
  @Post('access') async access(@Req()req:Request,@Body()body:{token:string;googleIdToken:string}){
    const {env,email,googleSub}=await this.authorize(body,true);
    const doc=await fs.readFile(path.join(storageDir,env.document.storageKey));
    if(sha256(doc)!==env.documentSha256)throw new ForbiddenException('Document integrity check failed.');
    // Read-only event logging is separate from signing. A view does NOT prove every page was read.
    await this.db.$transaction(async tx=>{await recordEvent(tx,env.id,'AUTHENTICATED_AND_OPENED',{actorEmail:email,googleSub,ipAddress:req.ip||null,userAgent:text(req.headers['user-agent'],400),metadata:{documentHash:env.documentSha256}});});
    return {envelopeId:env.id,contractId:env.contractId,documentName:env.document.fileName,documentSha256:env.documentSha256,recipientName:env.recipientName,recipientEmail:env.recipientEmail,expiresAt:env.expiresAt,status:env.status,signedDocumentAvailable:Boolean(env.signedDocumentId),consentVersion:SIGNING_CONSENT_VERSION,consentText:SIGNING_CONSENT};
  }
  @Post('document') async document(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:{token:string;googleIdToken:string}){
    const {env,email,googleSub}=await this.authorize(body,true);
    const filename=path.join(storageDir,env.document.storageKey);
    if(!existsSync(filename))throw new BadRequestException('Contract document unavailable.');
    const bytes=await fs.readFile(filename);
    if(sha256(bytes)!==env.documentSha256)throw new ForbiddenException('Document integrity check failed.');
    await this.db.$transaction(async tx=>{await recordEvent(tx,env.id,'DOCUMENT_VIEWED',{actorEmail:email,googleSub,ipAddress:req.ip||null,userAgent:text(req.headers['user-agent'],400),metadata:{documentHash:env.documentSha256}});});
    res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Disposition','inline; filename="agreement.pdf"');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    return new StreamableFile(createReadStream(filename));
  }
  @Post('executed-document') async executedDocument(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:{token:string;googleIdToken:string}){
    const {env,email,googleSub}=await this.authorize(body,true);
    if(env.status!=='SIGNED'||!env.signedDocumentId)throw new BadRequestException('No executed document is available.');
    const contract=await this.db.contract.findUnique({where:{id:env.contractId},select:{status:true}});
    const lastSigned=contract?.status==='SIGNED'?await this.db.signingEnvelope.findFirst({where:{contractId:env.contractId,status:'SIGNED',signedDocumentId:{not:null}},orderBy:{signedAt:'desc'}}):null;
    const finalDocumentId=lastSigned?.signedDocumentId||env.signedDocumentId;
    const doc=await this.db.contractDocument.findFirst({where:{id:finalDocumentId!,contractId:env.contractId,kind:'EXECUTED'}});
    if(!doc)throw new BadRequestException('Executed document missing.');
    const filename=path.join(storageDir,doc.storageKey);const bytes=await fs.readFile(filename);
    if(sha256(bytes)!==doc.sha256)throw new ForbiddenException('Executed document integrity failed.');
    await this.db.$transaction(async tx=>{await recordEvent(tx,env.id,'EXECUTED_DOCUMENT_DOWNLOADED',{actorEmail:email,googleSub,ipAddress:req.ip||null,userAgent:text(req.headers['user-agent'],400),metadata:{sha256:doc.sha256}});});
    res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store, private');res.setHeader('Content-Disposition','attachment; filename="signed-agreement.pdf"');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    return new StreamableFile(createReadStream(filename));
  }
  @Post('complete') async sign(@Req()req:Request,@Body()body:{token:string;googleIdToken:string;typedName:string;documentSha256:string;consentVersion:string;consent:boolean;authority:boolean;signatureImage?:string;signatureMethod?:string}){
    const {env,email,googleSub}=await this.authorize(body);
    const typedName=text(body.typedName,160);
    if(typedName.length<3||!equalNormalizedEmail(typedName,env.recipientName))throw new BadRequestException('Type your invited full name exactly as shown.');
    if(body.consent!==true||body.authority!==true||body.consentVersion!==SIGNING_CONSENT_VERSION)throw new BadRequestException('Explicit electronic-signature consent and signing authority confirmation are required.');
    if(body.documentSha256!==env.documentSha256)throw new BadRequestException('Document has changed. Review it again before signing.');
    const method=['TYPE','DRAW','UPLOAD'].includes(String(body.signatureMethod))?String(body.signatureMethod):'TYPE';
    let signatureImage:Buffer|null=null;
    if(method!=='TYPE'){
      if(typeof body.signatureImage!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.signatureImage)||body.signatureImage.length>360000)throw new BadRequestException('A small PNG signature image is required.');
      signatureImage=Buffer.from(body.signatureImage.split(',')[1],'base64');
      if(signatureImage.length<40||signatureImage.length>250000||signatureImage.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new BadRequestException('Invalid PNG signature image.');
    }
    // Multi-signer sequence: the exact next required signer alone can execute.
    const required=await this.db.contractSignatory.findMany({where:{contractId:env.contractId,role:{in:['SIGNER','APPROVER']}},orderBy:[{signingOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
    if(required.length){
      const next=nextRequiredSigner(required);
      if(!next||env.signatoryId!==next.id||next.email.toLowerCase()!==email.toLowerCase())
        throw new ForbiddenException('Signing is restricted to the next designated participant.');
    }
    const original=await fs.readFile(path.join(storageDir,env.document.storageKey));
    if(sha256(original)!==env.documentSha256)throw new ForbiddenException('Document integrity check failed.');
    // An appended visible signature certificate is not a qualified digital/PAdES signature.
    const pdf=await PDFDocument.load(original,{updateMetadata:false});
    const page=pdf.addPage([595,842]);const font=await pdf.embedFont(StandardFonts.Helvetica);
    const date=new Date();const line=(value:string,y:number,size=11)=>page.drawText(value.replace(/[^\x20-\x7e]/g,'?').slice(0,95),{x:48,y,size,font,color:rgb(0.08,0.11,0.17)});
    line('ELECTRONIC SIGNATURE ATTESTATION',780,17);line('Agreement document SHA-256:',738);line(env.documentSha256,716,9);
    line('Signer: '+typedName,678);line('Google-verified email: '+email,654);line('UTC signing time: '+date.toISOString(),630);
    line('Consent version: '+SIGNING_CONSENT_VERSION,606);line('The signer explicitly consented to electronic execution.',579);
    line('The signer confirmed authority to sign for the named party.',555);
    line('Signed using Google identity verification and a private invitation.',529);
    line('Technical audit events are retained separately in SalesOS.',498);
    line('Signature method: '+method,474);
    if(signatureImage){
      try{const png=await pdf.embedPng(signatureImage);const scale=Math.min(245/png.width,110/png.height,1);page.drawImage(png,{x:52,y:320,width:png.width*scale,height:png.height*scale});}
      catch{throw new BadRequestException('Signature PNG cannot be embedded.');}
    }
    const output=Buffer.from(await pdf.save());const executedDigest=sha256(output),storageKey=randomUUID()+'.pdf';
    mkdirSync(storageDir,{recursive:true,mode:0o700});const finalPath=path.join(storageDir,storageKey);
    await fs.writeFile(finalPath,output,{flag:'wx',mode:0o600});
    try{
      const result=await this.db.$transaction(async tx=>{
        const claimed=await tx.signingEnvelope.updateMany({where:{id:env.id,status:'INVITED',revokedAt:null,expiresAt:{gt:new Date()}},data:{status:'SIGNED',recipientGoogleSub:googleSub,signedAt:date}});
        if(claimed.count!==1)throw new BadRequestException('This invitation has already been used or expired.');
        const doc=await tx.contractDocument.create({data:{contractId:env.contractId,fileName:`signed-${env.document.fileName}`.slice(0,200),storageKey,mimeType:'application/pdf',size:output.length,sha256:executedDigest,kind:'EXECUTED',uploadedById:env.createdById}});
        await tx.signingEnvelope.update({where:{id:env.id},data:{signedDocumentId:doc.id}});
        let fullyExecuted=false;
        if(env.signatoryId){
          const designated=await tx.contractSignatory.updateMany({where:{id:env.signatoryId,contractId:env.contractId,status:'PENDING'},data:{status:'SIGNED',signedAt:date}});
          if(designated.count!==1)throw new BadRequestException('Signing party already completed or was changed.');
          const pending=await tx.contractSignatory.count({where:{contractId:env.contractId,role:{in:['SIGNER','APPROVER']},status:{not:'SIGNED'}}});
          fullyExecuted=pending===0;
          // The signer has executed, but agreement finalization waits until every
          // signer's evidence checkpoint has been independently verified.
          await tx.contract.updateMany({where:{id:env.contractId,status:'DRAFT'},data:{status:'PENDING_SIGNATURE'}});
        }
        await recordEvent(tx,env.id,'ELECTRONIC_SIGNATURE_COMPLETED',{actorEmail:email,googleSub,ipAddress:req.ip||null,userAgent:text(req.headers['user-agent'],400),metadata:{signedDocumentId:doc.id,originalDigest:env.documentSha256,executedDigest,consentVersion:SIGNING_CONSENT_VERSION,consentText:SIGNING_CONSENT,authorityConfirmed:true,method:method+'_GOOGLE_AUTH',signatureImageSha256:signatureImage?sha256(signatureImage):null}});
        return {envelopeId:env.id,executedDocumentId:doc.id,signedAt:date.toISOString(),signedSha256:executedDigest,status:'SIGNED',contractFullyExecuted:fullyExecuted,needsInternalFinalization:!fullyExecuted};
      },{isolationLevel:'Serializable'});
      let evidenceArchive:any={archived:false,reason:'Evidence archive unavailable; administrator must retry before treating this as verified.'};
      try{evidenceArchive=await this.evidence.archive(env.id);}catch{/* Signature cannot be undone; archive status is explicitly unverified. */}
      // Receipt delivery does not determine whether the contract is legally signed.
      // Never fail or roll back a completed signature solely because Gmail is unavailable.
      try{
        const receipt=await this.messages.draft(env.createdById,{recipientEmail:env.recipientEmail,subject:`Signed agreement confirmation`,bodyText:`Hello ${env.recipientName},\n\nYour electronic signature was recorded on ${date.toISOString()}.\n\nThe executed agreement is attached. Document SHA-256: ${executedDigest}\n\nIf this was unexpected, please contact Seebot immediately.`,category:'SIGNED_CONTRACT_RECEIPT',entityType:'SIGNING_ENVELOPE',entityId:env.id,attachmentContractDocumentId:result.executedDocumentId,idempotencyKey:`signing-receipt:${env.id}`});
        await this.messages.send(receipt.id,env.createdById);
      }catch { /* Stored as DRAFT/FAILED; visible to authorized sender for manual retry. */ }
      let finalized=false;
      if(result.contractFullyExecuted&&evidenceArchive.archived){
        try{finalized=(await this.evidence.finalizeAfterEvidence(env.contractId)).finalized;}catch{/* Pending evidence review is visible to admins. */}
      }
      if(finalized){
        // Every signer gets a copy of the final cumulative PDF; never claim a send if Gmail is missing.
        const recipients=await this.db.contractSignatory.findMany({where:{contractId:env.contractId,status:'SIGNED',role:{in:['SIGNER','APPROVER']}}});
        for(const participant of recipients){
          try{
            const message=await this.messages.draft(env.createdById,{recipientEmail:participant.email,subject:'Final fully signed agreement',bodyText:`The agreement has completed all designated signatures. Final document SHA-256: ${executedDigest}. Please retain the attached executed copy.`,category:'SIGNED_CONTRACT_FINAL_COPY',entityType:'CONTRACT',entityId:env.contractId,attachmentContractDocumentId:result.executedDocumentId,idempotencyKey:`signing-final:${env.contractId}:${participant.id}`});
            await this.messages.send(message.id,env.createdById);
          }catch{/* Retain the signature even if one or more emails fail. Retry from outbox. */}
        }
      }
      return {...result,contractFullyExecuted:finalized,needsInternalFinalization:!finalized,evidenceArchive};
    }catch(err){await fs.unlink(finalPath).catch(()=>{});throw err;}
  }
}

@UseGuards(AuthGuard) @Controller('contracts')
export class SigningAdministrationController {
  constructor(private db:PrismaService,private messages:OutgoingMessageService,private evidence:EvidenceArchiveService){}
  private async contract(id:string,req:AuthRequest,modify:boolean){
    const c=await this.db.contract.findUnique({where:{id},include:{opportunity:true}});
    if(!c)throw new BadRequestException('Contract not found.');
    if(modify)ensureCanEdit(req.user,c.opportunity.ownerId);else ensureOwner(req.user,c.opportunity.ownerId);
    return c;
  }
  @Post(':id/signing/drafts') async createDraft(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{documentId:string;recipientEmail:string;recipientName:string;daysValid?:number}){
    assertConfigured();const c=await this.contract(id,req,true);
    if(c.status==='SIGNED'||c.isDemo)throw new BadRequestException('A signed or demo contract cannot be sent for live signing.');
    if(!validEmail(body?.recipientEmail)||text(body?.recipientName,160).length<3)throw new BadRequestException('An identified signer and valid email are required.');
    const doc=await this.db.contractDocument.findFirst({where:{id:body.documentId,contractId:id,kind:'DRAFT'}});
    if(!doc)throw new BadRequestException('Upload and approve a draft PDF first.');
    const days=Number(body.daysValid??7);if(!Number.isInteger(days)||days<1||days>14)throw new BadRequestException('Invitation lifetime must be 1–14 days.');
    const signatories=await this.db.contractSignatory.findMany({where:{contractId:id,role:{in:['SIGNER','APPROVER']}}});
    const target=signatories.find(x=>x.email.toLowerCase()===body.recipientEmail.trim().toLowerCase());
    if(signatories.length&&(!target||target.status!=='PENDING'||target.name.trim().toLowerCase()!==body.recipientName.trim().toLowerCase()))
      throw new BadRequestException('Signing invitation must match a pending designated participant exactly.');
    if(target&&await this.db.signingEnvelope.count({where:{contractId:id,signatoryId:target.id,status:{in:['DRAFT','INVITED','SIGNED']}}}))
      throw new BadRequestException('This signer already has an active or completed invitation.');
    const rawToken=newInvitationToken(),expiresAt=new Date(Date.now()+days*86400000);
    const env=await this.db.$transaction(async tx=>{
      const e=await tx.signingEnvelope.create({data:{contractId:id,documentId:doc.id,documentSha256:doc.sha256,recipientEmail:body.recipientEmail.trim().toLowerCase(),recipientName:text(body.recipientName,160),signatoryId:target?.id||null,tokenHash:hashInvitationToken(rawToken),status:'DRAFT',createdById:req.user.id,expiresAt}});
      await recordEvent(tx,e.id,'INVITATION_DRAFT_CREATED',{actorEmail:req.user.email,metadata:{recipientEmail:e.recipientEmail,documentSha256:e.documentSha256}});
      return e;
    });
    return {id:env.id,status:'DRAFT',recipientEmail:env.recipientEmail,expiresAt:env.expiresAt};
  }
  // Signed invitation only becomes usable after manager approval. Gmail delivery is audited.
  @Post(':id/signing/:envelopeId/activate') async activate(@Req()req:AuthRequest,@Param('id')id:string,@Param('envelopeId')envelopeId:string){
    assertConfigured();await this.contract(id,req,true);requireManager(req.user);
    const envelope=await this.db.signingEnvelope.findFirst({where:{id:envelopeId,contractId:id,status:'DRAFT'}});
    if(!envelope)throw new BadRequestException('Invitation draft unavailable.');
    const required=await this.db.contractSignatory.findMany({where:{contractId:id,role:{in:['SIGNER','APPROVER']}},orderBy:[{signingOrder:'asc'},{createdAt:'asc'},{id:'asc'}]});
    const current=nextRequiredSigner(required);
    if(required.length&&(!current||current.id!==envelope.signatoryId))throw new BadRequestException('Wait until earlier signers have finished.');
    const signed=await this.db.signingEnvelope.findFirst({where:{contractId:id,status:'SIGNED',signedDocumentId:{not:null}},orderBy:{signedAt:'desc'}});
    const nextDoc=signed?.signedDocumentId?await this.db.contractDocument.findUnique({where:{id:signed.signedDocumentId}}):null;
    if(nextDoc&&(nextDoc.contractId!==id||nextDoc.kind!=='EXECUTED'))throw new BadRequestException('Previous signer document is invalid.');
    if(required.length&&required.some(x=>x.status==='SIGNED')&&!nextDoc)throw new BadRequestException('Earlier signature is missing its sealed document.');
    const token=newInvitationToken();
    await this.db.$transaction(async tx=>{
      const updated=await tx.signingEnvelope.updateMany({where:{id:envelope.id,status:'DRAFT'},data:{tokenHash:hashInvitationToken(token),status:'INVITED',...(nextDoc?{documentId:nextDoc.id,documentSha256:nextDoc.sha256}:{})}});
      if(updated.count!==1)throw new BadRequestException('Invitation already activated.');
      await recordEvent(tx,envelope.id,'INVITATION_ACTIVATED',{actorEmail:req.user.email,metadata:{recipientEmail:envelope.recipientEmail,expiresAt:envelope.expiresAt.toISOString(),inputDocumentHash:nextDoc?.sha256||envelope.documentSha256,signingSequence:current?.signingOrder||1}});
    },{isolationLevel:'Serializable'});
    const url=`${process.env.SIGNING_PUBLIC_BASE_URL!.replace(/\/$/,'')}/sign/${encodeURIComponent(token)}`;
    const mail=await this.messages.draft(req.user.id,{recipientEmail:envelope.recipientEmail,subject:`Signature requested: ${envelope.recipientName}`,bodyText:`Hello ${envelope.recipientName},\n\nYou are invited to review and electronically sign a Seebot agreement. This restricted invitation is for ${envelope.recipientEmail} only.\n\nOpen the agreement: ${url}\n\nYou must authenticate with the invited Google account. This invitation expires ${envelope.expiresAt.toISOString()}.\n\nIf this was unexpected, please contact the sender directly.`,category:'CONTRACT_SIGNING_INVITATION',entityType:'SIGNING_ENVELOPE',entityId:envelope.id,idempotencyKey:`signing-invitation:${envelope.id}`});
    let delivery:{status:string;messageId:string;providerMessageId?:string|null}={status:'DRAFT',messageId:mail.id};
    try{delivery=await this.messages.send(mail.id,req.user.id);}catch{delivery={status:'FAILED',messageId:mail.id};}
    return {envelopeId:envelope.id,recipientEmail:envelope.recipientEmail,delivery,notice:delivery.status==='SENT'?'Signed invitation delivered through connected Gmail.':'Invitation is active, but delivery failed or Gmail is not configured. The sender must retry using the message ID; do not assume the client was notified.'};
  }
  @Post(':id/signing/:envelopeId/revoke') async revoke(@Req()req:AuthRequest,@Param('id')id:string,@Param('envelopeId')envelopeId:string){
    await this.contract(id,req,true);
    await this.db.$transaction(async tx=>{
      const count=await tx.signingEnvelope.updateMany({where:{id:envelopeId,contractId:id,status:{in:['DRAFT','INVITED']}},data:{status:'REVOKED',revokedAt:new Date()}});
      if(!count.count)throw new BadRequestException('Invitation unavailable or already completed.');
      await recordEvent(tx,envelopeId,'INVITATION_REVOKED',{actorEmail:req.user.email});
    },{isolationLevel:'Serializable'});
    return {revoked:true};
  }
  /** Evidence export, independently recomputed on request. Does not replace offsite immutable storage. */
  @Get(':id/signing/:envelopeId/audit') async verifyAudit(@Req()req:AuthRequest,@Param('id')id:string,@Param('envelopeId')eid:string){
    await this.contract(id,req,false);
    const env=await this.db.signingEnvelope.findFirst({where:{id:eid,contractId:id},include:{audit:{orderBy:{sequence:'asc'}},document:{select:{sha256:true}}}});
    if(!env)throw new BadRequestException('Signing envelope not found.');
    const key=auditKey();let previous='GENESIS',valid=true,position=0;
    const events=env.audit.map(a=>{
      const recalculated=auditDigest(key,{envelopeId:eid,sequence:a.sequence,type:a.type,actorEmail:a.actorEmail,googleSub:a.googleSub,ipAddress:a.ipAddress,userAgent:a.userAgent,metadata:a.metadata,occurredAt:a.occurredAt.toISOString(),previousDigest:a.previousDigest});
      const passes=a.sequence===++position&&a.previousDigest===previous&&a.digest===recalculated;
      if(!passes)valid=false;
      previous=a.digest;
      return {sequence:a.sequence,type:a.type,actorEmail:a.actorEmail,occurredAt:a.occurredAt,previousDigest:a.previousDigest,digest:a.digest,verified:passes};
    });
    return {envelopeId:eid,contractId:id,valid:valid&&events.length>0,originalDocumentHash:env.documentSha256,executedDocumentId:env.signedDocumentId,latestDigest:previous,eventCount:events.length,events,disclaimer:'Application-key HMAC verification only. Independent evidentiary protection additionally needs offsite immutable anchors and key governance.'};
  }
  @Post(':id/signing/:envelopeId/archive-evidence')async archiveEvidence(@Req()req:AuthRequest,@Param('id')id:string,@Param('envelopeId')eid:string){
    await this.contract(id,req,false);requireManager(req.user);
    const env=await this.db.signingEnvelope.findFirst({where:{id:eid,contractId:id}});
    if(!env)throw new BadRequestException('Signing envelope unavailable.');const receipt=await this.evidence.archive(eid);const completion=await this.evidence.finalizeAfterEvidence(id).catch(()=>({finalized:false}));return {...receipt,contractFinalization:completion};
  }
  @Get(':id/signing/:envelopeId/evidence-receipt')async exportEvidenceReceipt(@Req()req:AuthRequest,@Param('id')id:string,@Param('envelopeId')eid:string,@Res({passthrough:true})res:Response){
    await this.contract(id,req,false);
    const envelope=await this.db.signingEnvelope.findFirst({where:{id:eid,contractId:id}});
    if(!envelope)throw new BadRequestException('Signing envelope unavailable.');
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    return this.evidence.exportReceipt(eid);
  }
  @Get(':id/signing/:envelopeId/verify-evidence')async verifyEvidence(@Req()req:AuthRequest,@Param('id')id:string,@Param('envelopeId')eid:string){
    await this.contract(id,req,false);
    const env=await this.db.signingEnvelope.findFirst({where:{id:eid,contractId:id}});
    if(!env)throw new BadRequestException('Signing envelope unavailable.');return this.evidence.verify(eid);
  }
  @Get(':id/signing') async list(@Req()req:AuthRequest,@Param('id')id:string){
    await this.contract(id,req,false);
    return this.db.signingEnvelope.findMany({where:{contractId:id},select:{id:true,documentId:true,recipientEmail:true,recipientName:true,status:true,createdAt:true,expiresAt:true,revokedAt:true,signedAt:true,signedDocumentId:true,audit:{orderBy:{sequence:'asc'},select:{sequence:true,type:true,occurredAt:true,actorEmail:true,ipAddress:true,metadata:true,previousDigest:true,digest:true}}},orderBy:{createdAt:'desc'}});
  }
}
