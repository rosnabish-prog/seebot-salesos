import {Body,Controller,Delete,Get,Param,Post,Req,Res,UseGuards} from '@nestjs/common';
import type {Response} from 'express';
import {IdentityGuard} from '../workspace/identity.guard';
import {AuthSessionService,type SessionRequest} from './auth-session.service';
import {AuthenticatorService} from './authenticator.service';
import {clearAuthCookies,setSessionCookie} from './session';

@UseGuards(IdentityGuard) @Controller('auth')
export class AccountSecurityController{
 constructor(private sessions:AuthSessionService,private authenticator:AuthenticatorService){}
 @Get('sessions')async list(@Req()req:SessionRequest,@Res({passthrough:true})res:Response){res.setHeader('Cache-Control','no-store');return this.sessions.list(req);}
 @Delete('sessions/:sessionId')async revoke(@Req()req:SessionRequest,@Param('sessionId')id:string,@Res({passthrough:true})res:Response){const result=await this.sessions.revoke(req,id);if(result.current)clearAuthCookies(res);return result;}
 @Post('sessions/revoke-others')async revokeOthers(@Req()req:SessionRequest,@Res({passthrough:true})res:Response){setSessionCookie(res,await this.sessions.revokeOthers(req));return {revoked:true};}
 @Get('mfa/authenticator')async status(@Req()req:SessionRequest,@Res({passthrough:true})res:Response){res.setHeader('Cache-Control','no-store');return {...await this.authenticator.status(req.user.id),recoverySession:req.mfaMethod==='RECOVERY'};}
 @Post('mfa/authenticator/start')start(@Req()req:SessionRequest){return this.authenticator.start(req,'TOTP_ENROLL');}
 @Post('mfa/authenticator/enroll')async enroll(@Req()req:SessionRequest,@Body()body:{challengeId?:string;code?:string},@Res({passthrough:true})res:Response){res.setHeader('Cache-Control','no-store');return this.authenticator.enroll(req,String(body?.challengeId||''),String(body?.code||''));}
 @Post('mfa/authenticator/confirm')async confirm(@Req()req:SessionRequest,@Body()body:{enrollmentId?:string;code?:string},@Res({passthrough:true})res:Response){
  res.setHeader('Cache-Control','no-store');const user=await this.authenticator.confirm(req,String(body?.enrollmentId||''),String(body?.code||''));
  setSessionCookie(res,await this.sessions.create(user,req,'TOTP',req.authAt));return {enabled:true,otherSessionsRevoked:true};
 }
 @Post('mfa/authenticator/disable/start')startDisable(@Req()req:SessionRequest){return this.authenticator.start(req,'TOTP_DISABLE');}
 @Post('mfa/authenticator/disable')async disable(@Req()req:SessionRequest,@Body()body:{challengeId?:string;emailCode?:string;totpCode?:string},@Res({passthrough:true})res:Response){
  const user=await this.authenticator.disable(req,String(body?.challengeId||''),String(body?.emailCode||''),String(body?.totpCode||''));
  setSessionCookie(res,await this.sessions.create(user,req,'EMAIL',req.authAt));return {enabled:false,otherSessionsRevoked:true};
 }
}
