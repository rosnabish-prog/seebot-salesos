import {BadRequestException,Injectable,ServiceUnavailableException,UnauthorizedException} from '@nestjs/common';
import {createHash,randomInt} from 'node:crypto';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {PrismaService} from '../prisma/prisma.service';

const minute=60_000;
const codeHash=(id:string,code:string)=>createHash('sha256').update(id+':'+code+':'+(process.env.MFA_CODE_SECRET||process.env.JWT_SECRET||'')).digest('hex');
@Injectable()
export class MfaService{
 constructor(private db:PrismaService){}
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
 async begin(user:{id:string;email:string}){
  const recent=await this.db.loginChallenge.findFirst({where:{userId:user.id,createdAt:{gt:new Date(Date.now()-30_000)},consumedAt:null},orderBy:{createdAt:'desc'}});
  if(recent)throw new BadRequestException('A verification code was just sent. Wait a few seconds before trying again.');
  await this.db.loginChallenge.updateMany({where:{userId:user.id,consumedAt:null,expiresAt:{gt:new Date()}},data:{expiresAt:new Date()}});
  const code=String(randomInt(100000,1000000));
  const created=await this.db.loginChallenge.create({data:{userId:user.id,codeHash:'pending',expiresAt:new Date(Date.now()+10*minute)}});
  await this.db.loginChallenge.update({where:{id:created.id},data:{codeHash:codeHash(created.id,code)}});
  try{await this.send(user.email,code);}
  catch(err){await this.db.loginChallenge.deleteMany({where:{id:created.id}});throw err;}
  return {mfaRequired:true,challengeId:created.id,method:'EMAIL',maskedEmail:this.mask(user.email),
   ...(process.env.NODE_ENV==='test'&&process.env.MFA_TEST_MODE==='true'?{testCode:code}:{})};
 }
 private mask(email:string){const [local,domain]=email.split('@');return (local.length<=2?local[0]+'*':local[0]+'***'+local.at(-1))+'@'+domain;}
 async resend(challengeId:string){
  if(typeof challengeId!=='string'||challengeId.length<10)throw new UnauthorizedException('Sign in again to request another verification code.');
  const existing=await this.db.loginChallenge.findUnique({where:{id:challengeId},include:{user:true}});
  if(!existing||existing.consumedAt||!existing.user.active)throw new UnauthorizedException('Sign in again to request another verification code.');
  if(Date.now()-existing.createdAt.getTime()<30_000)throw new BadRequestException('Wait 30 seconds before requesting another code.');
  await this.db.loginChallenge.updateMany({where:{userId:existing.userId,consumedAt:null},data:{expiresAt:new Date()}});
  return this.begin({id:existing.user.id,email:existing.user.email});
 }
 async verify(challengeId:string,code:string){
  if(typeof challengeId!=='string'||challengeId.length<10||!/^[0-9]{6}$/.test(code||''))throw new UnauthorizedException('Invalid verification code.');
  const challenge=await this.db.loginChallenge.findUnique({where:{id:challengeId},include:{user:true}});
  if(!challenge||challenge.consumedAt||challenge.expiresAt<=new Date()||!challenge.user.active)throw new UnauthorizedException('Verification code expired. Sign in again.');
  if(challenge.attempts>=5)throw new UnauthorizedException('Too many incorrect codes. Sign in again.');
  if(challenge.codeHash!==codeHash(challenge.id,code)){
   await this.db.loginChallenge.update({where:{id:challenge.id},data:{attempts:{increment:1}}});
   throw new UnauthorizedException('Incorrect verification code.');
  }
  const consumed=await this.db.loginChallenge.updateMany({where:{id:challenge.id,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
  if(consumed.count!==1)throw new UnauthorizedException('Verification code was already used.');
  await this.db.auditEvent.create({data:{actorId:challenge.userId,action:'LOGIN_MFA_VERIFIED',entityType:'USER',entityId:challenge.userId,detail:{method:'EMAIL'}}});
  return {id:challenge.user.id,email:challenge.user.email,name:challenge.user.name,role:challenge.user.role,passwordVersion:challenge.user.passwordVersion};
 }
}
