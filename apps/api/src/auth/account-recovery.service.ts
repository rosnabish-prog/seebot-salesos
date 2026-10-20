import {BadRequestException,ConflictException,Injectable,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {createHash,randomBytes} from 'node:crypto';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {companyDomain} from '../workspace/company-email';

const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const validEmail=(s:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=254;
const passwordOK=(s:string)=>typeof s==='string'&&s.length>=12&&s.length<=256;
const now=()=>new Date();
const minute=60_000;
type RequestData={email?:string;name?:string;password?:string};
@Injectable()
export class AccountRecoveryService{
 constructor(private db:PrismaService){}
 private previewMailboxReady(){
  return process.env.NODE_ENV!=='production'&&process.env.DEV_MAIL_CAPTURE_ENABLED==='true'&&
    Boolean(process.env.CODESPACE_NAME||process.env.CI==='true')&&
    process.env.SMTP_HOST==='127.0.0.1'&&Number(process.env.SMTP_PORT)===1025&&Boolean(process.env.SMTP_FROM);
 }
 private smtpReady(){
  if(this.previewMailboxReady())return true;
  return Boolean(process.env.SMTP_HOST&&process.env.SMTP_FROM&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD
    &&Number.isInteger(Number(process.env.SMTP_PORT||587))&&Number(process.env.SMTP_PORT||587)>0);
 }
 private emailSignupReady(){return process.env.EMAIL_SIGNUP_ENABLED==='true'&&this.smtpReady();}
 private ciDisposableSignupReady(){
  // Explicit exception only for isolated, disposable GitHub Actions test data.
  // This path never issues an authenticated session and cannot be enabled in production.
  return process.env.NODE_ENV==='test'&&process.env.CI==='true'&&
    process.env.MFA_TEST_MODE==='true'&&process.env.DEV_EMAIL_SIGNUP_ENABLED==='true'&&
    (process.env.DATABASE_URL||'').includes('ci_only_password');
 }
 private developerSignupReady(){
  return process.env.NODE_ENV!=='production'&&process.env.DEV_EMAIL_SIGNUP_ENABLED==='true'&&
    (this.previewMailboxReady()||this.ciDisposableSignupReady());
 }
 capabilities(){
  return {emailSignupEnabled:this.emailSignupReady()||this.developerSignupReady(),
    developerSignup:this.developerSignupReady(),emailVerificationRequired:!this.ciDisposableSignupReady(),passwordResetEnabled:this.smtpReady(),
    googleConfigured:Boolean(process.env.GOOGLE_LOGIN_CLIENT_ID),previewMailbox:this.previewMailboxReady()};
 }
 private async send(to:string,subject:string,body:string){
  if(!this.smtpReady())throw new ServiceUnavailableException('Email delivery is not configured.');
  const options:SMTPTransport.Options={
   host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),
   secure:Number(process.env.SMTP_PORT||587)===465,
   ...(this.previewMailboxReady()?{}:{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}),
   requireTLS:!this.previewMailboxReady()&&Number(process.env.SMTP_PORT||587)!==465,
   connectionTimeout:10000,socketTimeout:12000
  };
  const transport=nodemailer.createTransport(options);
  try{await transport.sendMail({from:process.env.SMTP_FROM,to,subject,text:body});}
  finally{transport.close();}
 }
 private publicUrl(){
  const origin=process.env.CORS_ORIGIN||'';
  if(!/^https:\/\/[^/\s]+$/.test(origin)&&!(process.env.NODE_ENV!=='production'&&/^http:\/\/localhost:\d+$/.test(origin)))
   throw new ServiceUnavailableException('Valid secure public app address required for email links.');
  return origin;
 }
 async register(body:RequestData){
  const name=String(body?.name||'').trim(),email=String(body?.email||'').trim().toLowerCase(),password=body?.password;
  if(!validEmail(email)||name.length<2||name.length>160||!passwordOK(password as string))
   throw new BadRequestException('Name, valid email and a password of 12–256 characters are required.');
  companyDomain(email);
  if(!this.capabilities().emailSignupEnabled)
   throw new ServiceUnavailableException('Email registration is not enabled. Use a team invitation or an approved sign-in provider.');
  if(await this.db.user.findUnique({where:{email},select:{id:true}}))
   throw new ConflictException('This email already has an account. Sign in or use password recovery.');
  const passwordHash=await argon2.hash(password as string);
  if(this.ciDisposableSignupReady()&&!this.previewMailboxReady()){
    const user=await this.db.user.create({data:{name,email,passwordHash,role:'SALES_REP'}});
    await this.db.auditEvent.create({data:{actorId:user.id,action:'DISPOSABLE_CI_PREVIEW_SIGNUP',entityType:'USER',entityId:user.id,detail:{fictional:true,verified:false}}});
    return {verificationRequired:false,preview:true,notice:'CI-only preview account created. Sign in and complete mandatory two-factor verification.'};
  }
  const existing=await this.db.signupChallenge.findUnique({where:{email},select:{createdAt:true}});
  if(existing && Date.now()-existing.createdAt.getTime()<minute)
   throw new BadRequestException('Please wait a minute before requesting another verification email.');
  const token=randomBytes(32).toString('base64url');
  await this.db.signupChallenge.upsert({where:{email},create:{email,name,passwordHash,tokenHash:sha(token),expiresAt:new Date(Date.now()+30*minute)},update:{name,passwordHash,tokenHash:sha(token),expiresAt:new Date(Date.now()+30*minute),createdAt:now()}});
  await this.send(email,'Verify your SalesOS account',
   'To complete your SalesOS account registration, open this link within 30 minutes:\n\n'+this.publicUrl()+'/verify-email?token='+encodeURIComponent(token)+'\n\nIgnore this if you did not register.');
  return {verificationRequired:true,notice:'Check your email to verify your account before signing in.'};
 }
 async verifySignup(raw:string){
  if(!/^[A-Za-z0-9_-]{32,100}$/.test(raw||''))throw new UnauthorizedException('Invalid or expired verification link.');
  const pending=await this.db.signupChallenge.findUnique({where:{tokenHash:sha(raw)}});
  if(!pending||pending.expiresAt<=now())throw new UnauthorizedException('Invalid or expired verification link.');
  return this.db.$transaction(async tx=>{
    const removed=await tx.signupChallenge.deleteMany({where:{id:pending.id,tokenHash:sha(raw),expiresAt:{gt:now()}}});
    if(removed.count!==1)throw new UnauthorizedException('Verification link was already used.');
    const user=await tx.user.create({data:{email:pending.email,name:pending.name,passwordHash:pending.passwordHash,role:'SALES_REP'}});
    await tx.auditEvent.create({data:{actorId:user.id,action:'EMAIL_VERIFIED_SELF_REGISTRATION',entityType:'USER',entityId:user.id,detail:{method:'SMTP_VERIFIED'}}});
    return {user:{id:user.id,email:user.email,name:user.name,role:user.role}};
  },{isolationLevel:'Serializable'});
 }
 async requestReset(emailInput:string){
  if(!this.smtpReady())throw new ServiceUnavailableException('Password recovery emails are not configured. Contact your administrator.');
  const email=String(emailInput||'').trim().toLowerCase();
  if(!validEmail(email))throw new BadRequestException('Enter a valid email address.');
  const response={notice:'If an account exists, a password reset email will arrive shortly.'};
  const user=await this.db.user.findUnique({where:{email},select:{id:true,active:true}});
  if(!user?.active)return response;
  const recent=await this.db.passwordResetRequest.findFirst({where:{userId:user.id,createdAt:{gt:new Date(Date.now()-minute)}},select:{id:true}});
  if(recent)return response;
  const token=randomBytes(32).toString('base64url');
  const created=await this.db.passwordResetRequest.create({data:{userId:user.id,tokenHash:sha(token),expiresAt:new Date(Date.now()+30*minute)}});
  try{
   await this.send(email,'Reset your SalesOS password',
    'A SalesOS password reset was requested. This link expires in 30 minutes and can only be used once:\n\n'+this.publicUrl()+'/reset-password?token='+encodeURIComponent(token)+'\n\nIf you did not request a reset, ignore this message.');
  }catch(err){await this.db.passwordResetRequest.deleteMany({where:{id:created.id}});throw err;}
  return response;
 }
 async resetPassword(raw:string,password:string){
  if(!/^[A-Za-z0-9_-]{32,100}$/.test(raw||'')||!passwordOK(password))
   throw new BadRequestException('Valid reset link and new password of 12–256 characters are required.');
  const request=await this.db.passwordResetRequest.findUnique({where:{tokenHash:sha(raw)}});
  if(!request||request.usedAt||request.expiresAt<=now())throw new UnauthorizedException('Reset link has expired or was already used.');
  const passwordHash=await argon2.hash(password);
  await this.db.$transaction(async tx=>{
   const consumed=await tx.passwordResetRequest.updateMany({where:{id:request.id,usedAt:null,expiresAt:{gt:now()}},data:{usedAt:now()}});
   if(consumed.count!==1)throw new UnauthorizedException('Reset link was already used.');
   await tx.user.update({where:{id:request.userId},data:{passwordHash,passwordVersion:{increment:1}}});
   // A pre-reset MFA code must not complete sign-in using the new password version.
   await tx.loginChallenge.updateMany({where:{userId:request.userId,consumedAt:null},data:{expiresAt:now(),consumedAt:now()}});
   await tx.auditEvent.create({data:{actorId:request.userId,action:'PASSWORD_RESET_COMPLETED',entityType:'USER',entityId:request.userId,detail:{method:'EMAIL_RESET'}}});
  },{isolationLevel:'Serializable'});
  return {success:true};
 }
}
