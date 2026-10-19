import { Body, Controller, Get, Post, Patch, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthRequest } from '../common/auth.guard';
import { IdentityGuard } from '../workspace/identity.guard';
import { AuthService } from './auth.service';
import { AccountRecoveryService } from './account-recovery.service';
import { MfaService } from './mfa.service';
import {clearAuthCookies,setSessionCookie} from './session';
import { JwtService } from '@nestjs/jwt';
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService,private recovery:AccountRecoveryService,private mfa:MfaService,private jwt:JwtService) {}
  private async issueSession(res:Response,user:{id:string;role:string;passwordVersion:number}){const token=await this.jwt.signAsync({sub:user.id,role:user.role,pv:user.passwordVersion,mfa:true,authAt:Date.now()});setSessionCookie(res,token);return token;}
  @Get('capabilities') capabilities(){return this.recovery.capabilities();}
  @Post('register') async register(@Body()body:{name?:string;email?:string;password?:string},@Res({passthrough:true})res:Response){
    const result=await this.recovery.register(body);
    if('user' in result && result.user){await this.issueSession(res,{id:result.user.id,role:result.user.role,passwordVersion:1});}
    return result;
  }
  @Post('verify-signup') async verify(@Body()body:{token:string},@Res({passthrough:true})res:Response){
    const result=await this.recovery.verifySignup(body?.token);
    await this.issueSession(res,{id:result.user.id,role:result.user.role,passwordVersion:1});
    return result;
  }
  @Post('forgot-password') forgotPassword(@Body()body:{email?:string}){return this.recovery.requestReset(body?.email||'');}
  @Post('reset-password') resetPassword(@Body()body:{token?:string;password?:string}){return this.recovery.resetPassword(body?.token||'',body?.password||'');}
  @Post('login')
  async login(@Body() body:{email:string,password:string}, @Res({passthrough:true}) res:Response) {
    if (typeof body?.email!=='string' || typeof body?.password!=='string') throw new BadRequestException('Email and password required.');
    const out=await this.service.login(body.email,body.password);
    clearAuthCookies(res);
    return this.mfa.begin({id:out.user.id,email:out.user.email});
  }
  @Post('mfa/verify') async verifyMfa(@Body()body:{challengeId?:string;code?:string},@Res({passthrough:true})res:Response){
    const user=await this.mfa.verify(String(body?.challengeId||''),String(body?.code||''));
    await this.issueSession(res,{id:user.id,role:user.role,passwordVersion:user.passwordVersion});
    return {user:{id:user.id,email:user.email,name:user.name,role:user.role},sessionExpiresInDays:7};
  }
    @UseGuards(IdentityGuard) @Get('me') me(@Req() req:AuthRequest) {return req.user;}
  @UseGuards(IdentityGuard) @Patch('password') async changePassword(@Req()req:AuthRequest,@Body()body:{currentPassword:string;newPassword:string},@Res({passthrough:true})res:Response){
    const result=await this.service.changePassword(req.user.id,body.currentPassword,body.newPassword);
    clearAuthCookies(res);
    return result;
  }
  @Post('logout') logout(@Res({passthrough:true}) res:Response) {
    clearAuthCookies(res);
    return {success:true};
  }
}
