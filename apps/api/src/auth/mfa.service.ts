import {matchTotpStep,openTotp} from './totp';
import {AuthRateLimitService} from './auth-rate-limit.service';
import {BadRequestException,Injectable,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createHash,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {PrismaService} from '../prisma/prisma.service';

const minute=60_000;
const codeHash=(id:string,code:string)=>createHash('sha256').update(id+':'+code+':'+(process.env.MFA_CODE_SECRET||process.env.JWT_SECRET||'')).digest('hex');
@Injectable()
export class MfaService{
 constructor(private db:PrismaService,private limits:AuthRateLimitService){}
 private previewMailbox(){
  return process.env.NODE_ENV!=='production'&&process.env.DEV_MAIL_CAPTURE_ENABLED==='true'&&
   Boolean(process.env.CODESPACE_NAME||process.env.CI==='true')&&process.env.SMTP_HOST==='127.0.0.1'&&Number(process.env.SMTP_PORT)===1025;
 }
 private mailReady(){
  if(this.previewMailbox())return true;
  return Boolean(process.env.SMTP_HOST&&process.env.SMTP_FROM&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&Number(process.env.SMTP_PORT||587)>0);
 }
 private async send(to:string,code:string){
  if(process.env.NODE_ENV==='test'&&process.env.MFA_TEST_MODE==='true')return;
  if(!this.mailReady())throw new ServiceUnavailableException('Two-factor email delivery is not configured. Contact your administrator.');
  const port=Number(process.env.SMTP_PORT||587);
  const options:SMTPTransport.Options={host:process.env.SMTP_HOST,port,secure:port===465,
   ...(this.previewMailbox()?{}:{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}),
   requireTLS:!this.previewMailbox()&&port!==465,connectionTimeout:10_000,socketTimeout:12_000};
  const transport=nodemailer.createTransport(options);
  try{await transport.sendMail({from:process.env.SMTP_FROM||'SalesOS Security <no-reply@seebot.example>',to,subject:'Your SalesOS sign-in code',
   text:'Your SalesOS verification code is '+code+'.\n\nIt expires in 10 minutes and can be used once. If you did not try to sign in, reset your password and contact your administrator.'});}
  finally{transport.close();}
 }
 async begin(user:{id:string;email:string},purpose='LOGIN'){
  await this.limits.consume('mfa-user-window',user.id,20,15*minute);
  await this.limits.consume('mfa-purpose-window:'+purpose,user.id,5,15*minute);
  await this.limits.consume('mfa-user-cooldown:'+purpose,user.id,1,30_000);
  const current=await this.db.user.findUnique({where:{id:user.id}});
  if(!current?.active)throw new UnauthorizedException('Sign in again.');
  const recent=await this.db.loginChallenge.findFirst({where:{userId:user.id,createdAt:{gt:new Date(Date.now()-30_000)},consumedAt:null},orderBy:{createdAt:'desc'}});
  if(recent)throw new BadRequestException('A verification code was just sent. Wait a few seconds before trying again.');
  await this.db.loginChallenge.updateMany({where:{userId:user.id,consumedAt:null,expiresAt:{gt:new Date()}},data:{expiresAt:new Date()}});
  const authenticator=await this.db.userAuthenticator.findUnique({where:{userId:user.id}});
  const method=authenticator&&['LOGIN','RECOVERY_SETUP'].includes(purpose)?'TOTP':'EMAIL';
  const code=String(randomInt(100000,1000000));
  const created=await this.db.loginChallenge.create({data:{userId:user.id,purpose,method,passwordVersion:current.passwordVersion,codeHash:'pending',expiresAt:new Date(Date.now()+10*minute)}});
  await this.db.loginChallenge.update({where:{id:created.id},data:{codeHash:codeHash(created.id,code)}});
  if(method==='TOTP')return {mfaRequired:true,challengeId:created.id,method:'TOTP',maskedEmail:this.mask(user.email)};
  try{await this.send(user.email,code);}
  catch(err){
   if(purpose!=='LOGIN'||!await this.db.mfaRecoveryCode.count({where:{userId:user.id,usedAt:null}})){await this.db.loginChallenge.deleteMany({where:{id:created.id}});throw err;}
   return {mfaRequired:true,challengeId:created.id,method:'EMAIL_OR_RECOVERY',maskedEmail:this.mask(user.email),emailDelivery:'UNAVAILABLE'};
  }
  return {mfaRequired:true,challengeId:created.id,method:'EMAIL',maskedEmail:this.mask(user.email),
   ...(process.env.NODE_ENV==='test'&&process.env.MFA_TEST_MODE==='true'?{testCode:code}:{})};
 }
 private mask(email:string){const [local,domain]=email.split('@');return (local.length<=2?local[0]+'*':local[0]+'***'+local.at(-1))+'@'+domain;}
 async resend(challengeId:string){
  if(typeof challengeId!=='string'||challengeId.length<10)throw new UnauthorizedException('Sign in again to request another verification code.');
  const existing=await this.db.loginChallenge.findUnique({where:{id:challengeId},include:{user:true}});
  if(!existing||existing.purpose!=='LOGIN'||existing.expiresAt<=new Date()||existing.consumedAt||!existing.user.active||existing.passwordVersion!==existing.user.passwordVersion)throw new UnauthorizedException('Sign in again to request another verification code.');
  if(existing.method==='TOTP')throw new BadRequestException('Use your authenticator or a saved recovery code. Email fallback is unavailable while your authenticator is enabled.');
  if(Date.now()-existing.createdAt.getTime()<30_000)throw new BadRequestException('Wait 30 seconds before requesting another code.');
  const stoppedAt=new Date();
  await this.db.loginChallenge.updateMany({where:{userId:existing.userId,consumedAt:null},data:{expiresAt:stoppedAt,consumedAt:stoppedAt}});
  return this.begin({id:existing.user.id,email:existing.user.email});
 }
 private async reserve(challengeId:string,purpose:string,expectedUserId?:string){
  if(typeof challengeId!=='string'||challengeId.length<10)throw new UnauthorizedException('Invalid verification code.');
  const challenge=await this.db.loginChallenge.findUnique({where:{id:challengeId},include:{user:true}});
  if(!challenge||challenge.purpose!==purpose||expectedUserId&&challenge.userId!==expectedUserId||challenge.consumedAt||challenge.expiresAt<=new Date()||!challenge.user.active||challenge.passwordVersion!==challenge.user.passwordVersion)throw new UnauthorizedException('Verification expired. Sign in again.');
  // Reserve the attempt before comparison; rejected guesses must not be rolled back.
  const claim=await this.db.loginChallenge.updateMany({where:{id:challenge.id,purpose,consumedAt:null,expiresAt:{gt:new Date()},attempts:{lt:5}},data:{attempts:{increment:1}}});
  if(claim.count!==1)throw new UnauthorizedException('Too many attempts or expired code. Sign in again.');
  return challenge;
 }
 async verify(challengeId:string,code:string,purpose='LOGIN',expectedUserId?:string){
  const challenge=await this.reserve(challengeId,purpose,expectedUserId);
  const expected=Buffer.from(challenge.codeHash,'hex'),provided=Buffer.from(codeHash(challenge.id,code),'hex');
  if(challenge.method!=='TOTP'&&(!/^[0-9]{6}$/.test(code||'')||expected.length!==provided.length||!timingSafeEqual(expected,provided)))throw new UnauthorizedException('Incorrect verification code.');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${challenge.userId} FOR UPDATE`;
   const user=await tx.user.findUniqueOrThrow({where:{id:challenge.userId}});
   if(!user.active||user.passwordVersion!==challenge.passwordVersion)throw new UnauthorizedException('Sign in again.');
   if(challenge.method==='TOTP'){
    const factor=await tx.userAuthenticator.findUnique({where:{userId:user.id}});
    const step=factor?matchTotpStep(openTotp(user.id,factor.secretEncrypted),String(code||''),factor.lastStep):null;
    if(step===null)throw new UnauthorizedException('Incorrect or already used authenticator code. Wait for a new code.');
    await tx.userAuthenticator.update({where:{userId:user.id},data:{lastStep:step}});
   }
   const consumed=await tx.loginChallenge.updateMany({where:{id:challenge.id,consumedAt:null,expiresAt:{gt:new Date()},attempts:{lte:5}},data:{consumedAt:new Date()}});
   if(consumed.count!==1)throw new UnauthorizedException('Verification code was already used.');
   await tx.auditEvent.create({data:{actorId:user.id,action:purpose==='LOGIN'?'LOGIN_MFA_VERIFIED':'MFA_STEP_UP_VERIFIED',entityType:'USER',entityId:user.id,detail:{method:challenge.method,purpose}}});
   return {id:user.id,email:user.email,name:user.name,role:user.role,passwordVersion:user.passwordVersion,mfaMethod:challenge.method};
  });
 }
 private recoveryHash(userId:string,code:string){return createHash('sha256').update(userId+':'+code.replace(/-/g,'').trim().toLowerCase()).digest('hex');}
 async recoveryStatus(userId:string){return {remaining:await this.db.mfaRecoveryCode.count({where:{userId,usedAt:null}})};}
 async generateRecoveryCodes(userId:string,challengeId:string,code:string){
  const verified=await this.verify(challengeId,code,'RECOVERY_SETUP',userId);
  const codes=Array.from({length:8},()=>randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'));
  await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
   const current=await tx.user.findUniqueOrThrow({where:{id:userId}});
   if(current.passwordVersion!==verified.passwordVersion||!current.active)throw new UnauthorizedException('Reauthenticate before generating recovery codes.');
   await tx.mfaRecoveryCode.deleteMany({where:{userId}});
   await tx.mfaRecoveryCode.createMany({data:codes.map(c=>({userId,codeHash:this.recoveryHash(userId,c)}))});
   await tx.auditEvent.create({data:{actorId:userId,action:'MFA_RECOVERY_CODES_ROTATED',entityType:'USER',entityId:userId,detail:{count:codes.length}}});
  });
  return {codes,notice:'Save these codes offline. Each works once after password or Google sign-in. Previous recovery codes have been revoked.'};
 }
 async verifyRecovery(challengeId:string,code:string){
  const challenge=await this.reserve(challengeId,'LOGIN');
  const normalized=String(code||'').replace(/-/g,'').trim().toLowerCase();
  if(!/^[a-f0-9]{32}$/.test(normalized))throw new UnauthorizedException('Invalid recovery code.');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${challenge.userId} FOR UPDATE`;
   const user=await tx.user.findUniqueOrThrow({where:{id:challenge.userId}});
   if(!user.active||user.passwordVersion!==challenge.passwordVersion)throw new UnauthorizedException('Sign in again.');
   const now=new Date();
   const claimed=await tx.mfaRecoveryCode.updateMany({where:{userId:user.id,codeHash:this.recoveryHash(user.id,normalized),usedAt:null},data:{usedAt:now}});
   if(claimed.count!==1)throw new UnauthorizedException('Invalid or already used recovery code.');
   const consumed=await tx.loginChallenge.updateMany({where:{id:challenge.id,consumedAt:null,expiresAt:{gt:now},attempts:{lte:5}},data:{consumedAt:now}});
   if(consumed.count!==1)throw new UnauthorizedException('Sign in challenge was already used.');
   const updated=await tx.user.update({where:{id:user.id},data:{passwordVersion:{increment:1}}});
   await tx.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:now}});
   await tx.loginChallenge.updateMany({where:{userId:user.id,consumedAt:null},data:{consumedAt:now,expiresAt:now}});
   await tx.auditEvent.create({data:{actorId:user.id,action:'LOGIN_MFA_RECOVERY_USED',entityType:'USER',entityId:user.id,detail:{sessionsRevoked:true}}});
   return {id:updated.id,email:updated.email,name:updated.name,role:updated.role,passwordVersion:updated.passwordVersion,mfaMethod:'RECOVERY'};
  });
 }
}
