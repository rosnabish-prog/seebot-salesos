import {ForbiddenException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import type {Request} from 'express';
import {PrismaService} from '../prisma/prisma.service';
import {SESSION_MAX_AGE_MS} from './session';

export type SessionRequest=Request&{user:{id:string};authAt?:number;authSessionId?:string;mfaMethod?:string};
export function requireRecentSignIn(req:SessionRequest){
 if(typeof req.authAt!=='number'||!Number.isFinite(req.authAt)||Date.now()-req.authAt>5*60_000||req.authAt>Date.now()+60_000)throw new ForbiddenException('Sign in again before changing account security.');
}
/** Called only after JWT signature, active user and password-version checks. */
export async function validateRegisteredSession(db:PrismaService,payload:{sid?:string;sub:string;pv?:number;authAt?:number},req:any){
 if(typeof payload.sid!=='string')throw new UnauthorizedException('Sign in again to register this session.');
 const session=await db.authSession.findFirst({where:{id:payload.sid,userId:payload.sub,passwordVersion:payload.pv,revokedAt:null,expiresAt:{gt:new Date()}}});
 if(!session||session.authAt.getTime()!==payload.authAt)throw new UnauthorizedException('This session has ended. Sign in again.');
 req.authSessionId=session.id;req.mfaMethod=session.mfaMethod;req.authAt=payload.authAt;
 if(Date.now()-session.lastSeenAt.getTime()>5*60_000)await db.authSession.updateMany({where:{id:session.id,revokedAt:null,lastSeenAt:{lt:new Date(Date.now()-5*60_000)}},data:{lastSeenAt:new Date()}});
}
@Injectable()
export class AuthSessionService{
 constructor(private db:PrismaService,private jwt:JwtService){}
 private token(user:{id:string;passwordVersion:number},sid:string,authAt:number){return this.jwt.signAsync({sub:user.id,pv:user.passwordVersion,sid,mfa:true,authAt},{expiresIn:Math.max(1,Math.ceil((authAt+SESSION_MAX_AGE_MS-Date.now())/1000))});}
 async create(user:{id:string;passwordVersion:number},req:Request,method:string,authAt=Date.now()){
  const session=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
   const current=await tx.user.findUnique({where:{id:user.id}});
   if(!current?.active||current.passwordVersion!==user.passwordVersion)throw new UnauthorizedException('Sign in again.');
   if(Date.now()-authAt>=SESSION_MAX_AGE_MS)throw new UnauthorizedException('Sign in again.');
   const userAgent=String(req.headers['user-agent']||'Unknown browser').replace(/[\x00-\x1f\x7f-\x9f]/g,'').slice(0,300);
   const created=await tx.authSession.create({data:{userId:user.id,passwordVersion:user.passwordVersion,mfaMethod:method,userAgent,authAt:new Date(authAt),expiresAt:new Date(authAt+SESSION_MAX_AGE_MS)}});
   await tx.auditEvent.create({data:{actorId:user.id,entityType:'USER',entityId:user.id,action:'AUTH_SESSION_CREATED',detail:{sessionId:created.id,method}}});return created;
  });
  return this.token(user,session.id,authAt);
 }
 async list(req:SessionRequest){
  const where={userId:req.user.id,passwordVersion:(await this.db.user.findUniqueOrThrow({where:{id:req.user.id},select:{passwordVersion:true}})).passwordVersion,revokedAt:null,expiresAt:{gt:new Date()}};
  const [sessions,total]=await Promise.all([this.db.authSession.findMany({where,select:{id:true,userAgent:true,mfaMethod:true,authAt:true,expiresAt:true,lastSeenAt:true},orderBy:{authAt:'desc'},take:100}),this.db.authSession.count({where})]);
  return {sessions:sessions.map(s=>({...s,current:s.id===req.authSessionId})),total,notice:'Browser information is reported by the device. Sessions belong to your account across all organizations.'};
 }
 async revoke(req:SessionRequest,id:string){
  requireRecentSignIn(req);
  const changed=await this.db.authSession.updateMany({where:{id,userId:req.user.id,revokedAt:null},data:{revokedAt:new Date()}});
  if(changed.count!==1)throw new NotFoundException('Active session unavailable.');
  await this.db.auditEvent.create({data:{actorId:req.user.id,entityType:'USER',entityId:req.user.id,action:'AUTH_SESSION_REVOKED',detail:{sessionId:id}}});
  return {revoked:true,current:id===req.authSessionId};
 }
 async revokeOthers(req:SessionRequest){
  requireRecentSignIn(req);
  const user=await this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "User" WHERE id=${req.user.id} FOR UPDATE`;
   const current=await tx.authSession.findFirst({where:{id:req.authSessionId||'',userId:req.user.id,revokedAt:null,expiresAt:{gt:new Date()}}});
   const person=await tx.user.findUniqueOrThrow({where:{id:req.user.id}});
   if(!current||current.passwordVersion!==person.passwordVersion||!person.active)throw new UnauthorizedException('Sign in again.');
   const updated=await tx.user.update({where:{id:person.id},data:{passwordVersion:{increment:1}}});
   await tx.authSession.updateMany({where:{userId:person.id,id:{not:current.id},revokedAt:null},data:{revokedAt:new Date()}});
   await tx.authSession.update({where:{id:current.id},data:{passwordVersion:updated.passwordVersion}});
   await tx.loginChallenge.updateMany({where:{userId:person.id,consumedAt:null},data:{consumedAt:new Date(),expiresAt:new Date()}});
   await tx.auditEvent.create({data:{actorId:person.id,entityType:'USER',entityId:person.id,action:'AUTH_OTHER_SESSIONS_REVOKED',detail:{currentSessionId:current.id}}});return updated;
  });
  return this.token(user,req.authSessionId!,req.authAt!);
 }
 async logout(raw:unknown){
  if(typeof raw!=='string')return;
  let payload:any;try{payload=await this.jwt.verifyAsync(raw);}catch{return;}
  if(typeof payload.sid==='string'&&typeof payload.sub==='string')await this.db.authSession.updateMany({where:{id:payload.sid,userId:payload.sub,revokedAt:null},data:{revokedAt:new Date()}});
 }
}
