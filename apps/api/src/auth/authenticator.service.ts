import {BadRequestException,Injectable,UnauthorizedException} from '@nestjs/common';
import {randomBytes} from 'node:crypto';
import QRCode from 'qrcode';
import {PrismaService} from '../prisma/prisma.service';
import {MfaService} from './mfa.service';
import {AuthRateLimitService} from './auth-rate-limit.service';
import {authenticatorKey,base32,matchTotpStep,openTotp,sealTotp} from './totp';
import {requireRecentSignIn,type SessionRequest} from './auth-session.service';
import type {Prisma} from '@prisma/client';

@Injectable()
export class AuthenticatorService{
 constructor(private db:PrismaService,private mfa:MfaService,private limits:AuthRateLimitService){}
 async status(userId:string){
  const factor=await this.db.userAuthenticator.findUnique({where:{userId},select:{enabledAt:true}});
  let configured=true;try{authenticatorKey();}catch{configured=false;}
  return {enabled:Boolean(factor),enabledAt:factor?.enabledAt||null,configured};
 }
 async start(req:SessionRequest,purpose:'TOTP_ENROLL'|'TOTP_DISABLE'){
  requireRecentSignIn(req);authenticatorKey();
  const user=await this.db.user.findUniqueOrThrow({where:{id:req.user.id}}),factor=await this.db.userAuthenticator.findUnique({where:{userId:user.id}});
  if(purpose==='TOTP_ENROLL'&&factor||purpose==='TOTP_DISABLE'&&!factor)throw new BadRequestException('Authenticator state changed. Refresh account security.');
  return this.mfa.begin(user,purpose);
 }
 async enroll(req:SessionRequest,challengeId:string,code:string){
  requireRecentSignIn(req);authenticatorKey();
  const verified=await this.mfa.verify(challengeId,code,'TOTP_ENROLL',req.user.id);
  const secret=base32(randomBytes(20)),secretEncrypted=sealTotp(req.user.id,secret);
  const uri='otpauth://totp/'+encodeURIComponent('Seebot SalesOS:'+verified.email)+'?'+new URLSearchParams({secret,issuer:'Seebot SalesOS',algorithm:'SHA1',digits:'6',period:'30'}).toString();
  const qrCode=await QRCode.toDataURL(uri,{errorCorrectionLevel:'M',width:280,margin:2});
  const enrollment=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.user.id} FOR UPDATE`;
   const user=await tx.user.findUniqueOrThrow({where:{id:req.user.id}});
   if(!user.active||user.passwordVersion!==verified.passwordVersion)throw new UnauthorizedException('Sign in again.');
   if(await tx.userAuthenticator.findUnique({where:{userId:user.id}}))throw new BadRequestException('Disable the existing authenticator before replacing it.');
   return tx.authenticatorEnrollment.upsert({where:{userId:user.id},create:{userId:user.id,passwordVersion:user.passwordVersion,secretEncrypted,expiresAt:new Date(Date.now()+10*60_000)},update:{passwordVersion:user.passwordVersion,secretEncrypted,attempts:0,expiresAt:new Date(Date.now()+10*60_000)}});
  });
  return {enrollmentId:enrollment.id,secret,uri,qrCode,expiresAt:enrollment.expiresAt};
 }
 private async change(tx:Prisma.TransactionClient,userId:string,action:string){
  const user=await tx.user.update({where:{id:userId},data:{passwordVersion:{increment:1}}});
  const now=new Date();
  await tx.authSession.updateMany({where:{userId,revokedAt:null},data:{revokedAt:now}});
  await tx.loginChallenge.updateMany({where:{userId,consumedAt:null},data:{consumedAt:now,expiresAt:now}});
  await tx.authenticatorEnrollment.deleteMany({where:{userId}});
  await tx.auditEvent.create({data:{actorId:userId,entityType:'USER',entityId:userId,action,detail:{otherSessionsRevoked:true}}});
  return {id:user.id,email:user.email,name:user.name,role:user.role,passwordVersion:user.passwordVersion};
 }
 async confirm(req:SessionRequest,enrollmentId:string,code:string){
  requireRecentSignIn(req);
  await this.limits.consume('totp-enrollment',req.user.id,10,15*60_000);
  const claimed=await this.db.authenticatorEnrollment.updateMany({where:{id:enrollmentId,userId:req.user.id,expiresAt:{gt:new Date()},attempts:{lt:5}},data:{attempts:{increment:1}}});
  if(claimed.count!==1)throw new UnauthorizedException('Authenticator setup expired or exhausted. Start again.');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.user.id} FOR UPDATE`;
   const user=await tx.user.findUniqueOrThrow({where:{id:req.user.id}}),pending=await tx.authenticatorEnrollment.findFirst({where:{id:enrollmentId,userId:user.id,expiresAt:{gt:new Date()},attempts:{lte:5}}});
   if(!user.active||!pending||pending.passwordVersion!==user.passwordVersion)throw new UnauthorizedException('Start authenticator setup again.');
   const step=matchTotpStep(openTotp(user.id,pending.secretEncrypted),String(code||''),-1);
   if(step===null)throw new UnauthorizedException('Incorrect authenticator code.');
   await tx.userAuthenticator.create({data:{userId:user.id,secretEncrypted:pending.secretEncrypted,lastStep:step}});
   return this.change(tx,user.id,'AUTHENTICATOR_ENABLED');
  });
 }
 async disable(req:SessionRequest,challengeId:string,emailCode:string,totpCode:string){
  requireRecentSignIn(req);
  await this.limits.consume('totp-disable',req.user.id,5,15*60_000);
  const verified=await this.mfa.verify(challengeId,emailCode,'TOTP_DISABLE',req.user.id);
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.user.id} FOR UPDATE`;
   const user=await tx.user.findUniqueOrThrow({where:{id:req.user.id}}),factor=await tx.userAuthenticator.findUnique({where:{userId:req.user.id}});
   if(!user.active||user.passwordVersion!==verified.passwordVersion||!factor)throw new UnauthorizedException('Start authenticator verification again.');
   // A fresh recovery-authenticated session plus fresh mailbox proof permits lost-device removal.
   if(req.mfaMethod!=='RECOVERY'&&matchTotpStep(openTotp(user.id,factor.secretEncrypted),String(totpCode||''),factor.lastStep)===null)throw new UnauthorizedException('A fresh authenticator code is required. Start verification again.');
   await tx.userAuthenticator.delete({where:{userId:user.id}});
   return this.change(tx,user.id,'AUTHENTICATOR_DISABLED');
  });
 }
}
