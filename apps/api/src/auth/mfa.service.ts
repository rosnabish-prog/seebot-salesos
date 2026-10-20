import {BadRequestException,ForbiddenException,Injectable,UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {PrismaService} from '../prisma/prisma.service';
import type {Request,Response} from 'express';
import {User} from '@prisma/client';
import {SESSION_MAX_SECONDS,MFA_PENDING_MINUTES,mfaRequired,newAuthenticatorSecret,authenticatorUri,encryptAuthenticatorSecret,decryptAuthenticatorSecret,matchingCounter,newRecoveryCode,recoveryDigest,matchingRecoveryCode} from './mfa-security';

const cookieOpts=()=>({httpOnly:true as const,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/'});
export const clearAuthCookies=(res:Response)=>{res.clearCookie('salesos_session',cookieOpts());res.clearCookie('salesos_mfa_pending',cookieOpts());};
const publicUser=(u:Pick<User,'id'|'name'|'email'|'role'>)=>({id:u.id,email:u.email,name:u.name,role:u.role});

@Injectable()
export class MfaService{
 constructor(private db:PrismaService,private jwt:JwtService){}
 async begin(user:User,res:Response){
   clearAuthCookies(res);
   if(!mfaRequired())return this.finish(user,res);
   const token=await this.jwt.signAsync({sub:user.id,pv:user.passwordVersion,purpose:'mfa-pending'},{expiresIn:MFA_PENDING_MINUTES*60});
   res.cookie('salesos_mfa_pending',token,{...cookieOpts(),maxAge:MFA_PENDING_MINUTES*60_000});
   return {mfaRequired:true,setupRequired:!user.mfaEnabledAt};
 }
 async finish(user:User,res:Response){
   clearAuthCookies(res);
   const token=await this.jwt.signAsync({sub:user.id,pv:user.passwordVersion,purpose:'session',mfa:true},{expiresIn:SESSION_MAX_SECONDS});
   res.cookie('salesos_session',token,{...cookieOpts(),maxAge:SESSION_MAX_SECONDS*1000});
   return {user:publicUser(user)};
 }
 async pending(req:Request){
   const token=req.cookies?.salesos_mfa_pending;
   if(!token)throw new UnauthorizedException('Restart sign-in.');
   let payload:any;try{payload=await this.jwt.verifyAsync(token);}catch{throw new UnauthorizedException('Sign-in challenge expired.');}
   if(payload.purpose!=='mfa-pending'||typeof payload.sub!=='string')throw new UnauthorizedException('Invalid sign-in challenge.');
   const user=await this.db.user.findUnique({where:{id:payload.sub}});
   if(!user?.active||payload.pv!==user.passwordVersion)throw new UnauthorizedException('Restart sign-in.');
   return user;
 }
 async status(req:Request){const user=await this.pending(req);return {mfaRequired:true,setupRequired:!user.mfaEnabledAt};}
 async setup(req:Request){
   const user=await this.pending(req);
   if(user.mfaEnabledAt)throw new ForbiddenException('Authenticator already enrolled.');
   let secret:string;
   if(user.mfaSecretEncrypted){secret=decryptAuthenticatorSecret(user.mfaSecretEncrypted);}
   else{
     secret=newAuthenticatorSecret();
     const encrypted=encryptAuthenticatorSecret(secret);
     const updated=await this.db.user.updateMany({where:{id:user.id,mfaEnabledAt:null,mfaSecretEncrypted:null},data:{mfaSecretEncrypted:encrypted}});
     if(updated.count===0){const current=await this.db.user.findUniqueOrThrow({where:{id:user.id}});if(!current.mfaSecretEncrypted||current.mfaEnabledAt)throw new ForbiddenException('Enrollment state changed. Restart sign-in.');secret=decryptAuthenticatorSecret(current.mfaSecretEncrypted);}
   }
   return {secret,uri:authenticatorUri(secret,user.email),issuer:'Seebot SalesOS',account:user.email};
 }
 private async fail(user:User){
   const n=user.mfaFailedAttempts+1;
   await this.db.user.update({where:{id:user.id},data:{mfaFailedAttempts:n>=5?0:n,mfaLockedUntil:n>=5?new Date(Date.now()+15*60_000):null}});
   throw new UnauthorizedException('Invalid or already used authenticator code.');
 }
 private locked(user:User){if(user.mfaLockedUntil&&user.mfaLockedUntil.getTime()>Date.now())throw new ForbiddenException('Too many attempts. Try again after 15 minutes.');}
 async confirm(req:Request,res:Response,code:string){
   const user=await this.pending(req);this.locked(user);
   if(user.mfaEnabledAt||!user.mfaSecretEncrypted)throw new BadRequestException('Authenticator enrollment not pending.');
   const counter=matchingCounter(decryptAuthenticatorSecret(user.mfaSecretEncrypted),code);
   if(counter===null)return this.fail(user);
   const codes=Array.from({length:8},()=>newRecoveryCode());
   const hashes=codes.map(recoveryDigest);
   const result=await this.db.user.updateMany({where:{id:user.id,mfaEnabledAt:null,mfaSecretEncrypted:user.mfaSecretEncrypted},data:{mfaEnabledAt:new Date(),mfaLastCounter:BigInt(counter),mfaFailedAttempts:0,mfaLockedUntil:null,mfaRecoveryCodes:hashes}});
   if(result.count!==1)throw new ForbiddenException('Enrollment changed. Restart sign-in.');
   const active=await this.db.user.findUniqueOrThrow({where:{id:user.id}});
   return {...await this.finish(active,res),recoveryCodes:codes};
 }
 async verify(req:Request,res:Response,code:string){
   const user=await this.pending(req);this.locked(user);
   if(!user.mfaEnabledAt||!user.mfaSecretEncrypted)throw new BadRequestException('Set up your authenticator first.');
   const last=user.mfaLastCounter;
   const counter=matchingCounter(decryptAuthenticatorSecret(user.mfaSecretEncrypted),code);
   if(counter!==null && (last===null||BigInt(counter)>last)){
     const update=await this.db.user.updateMany({where:{id:user.id,OR:[{mfaLastCounter:null},{mfaLastCounter:{lt:BigInt(counter)}}]},data:{mfaLastCounter:BigInt(counter),mfaFailedAttempts:0,mfaLockedUntil:null}});
     if(update.count!==1)throw new UnauthorizedException('Code already used. Enter the next code.');
     return this.finish(user,res);
   }
   const hashes=Array.isArray(user.mfaRecoveryCodes)?user.mfaRecoveryCodes.filter((x):x is string=>typeof x==='string'):[];
   const index=matchingRecoveryCode(code,hashes);
   if(index>=0){
     const remaining=hashes.filter((_,i)=>i!==index);
     const updated=await this.db.user.updateMany({where:{id:user.id,mfaRecoveryCodes:{equals:hashes}},data:{mfaRecoveryCodes:remaining,mfaFailedAttempts:0,mfaLockedUntil:null}});
     if(updated.count!==1)throw new UnauthorizedException('Recovery code has already been used.');
     return this.finish(user,res);
   }
   return this.fail(user);
 }
}
