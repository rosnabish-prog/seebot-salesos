import { Body, Controller, Get, Post, Patch, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthRequest } from '../common/auth.guard';
import { IdentityGuard } from '../workspace/identity.guard';
import { AuthService } from './auth.service';
import { AccountRecoveryService } from './account-recovery.service';
import { MfaService } from './mfa.service';
import {clearAuthCookies,setSessionCookie} from './session';
import {AuthSessionService} from './auth-session.service';
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService,private recovery:AccountRecoveryService,private mfa:MfaService,private sessions:AuthSessionService) {}
  private async issueSession(res:Response,user:{id:string;passwordVersion:number;mfaMethod?:string},req:Request){setSessionCookie(res,await this.sessions.create(user,req,user.mfaMethod||'EMAIL'));}
  @Get('capabilities') capabilities(){return this.recovery.capabilities();}
  @Post('register') async register(@Body()body:{name?:string;email?:string;password?:string},@Res({passthrough:true})res:Response){
    // Registration never creates an authenticated session. Email verification is first-factor only.
    clearAuthCookies(res);
    return this.recovery.register(body);
  }
  @Post('verify-signup') async verify(@Body()body:{token:string},@Res({passthrough:true})res:Response){
    const result=await this.recovery.verifySignup(body?.token);
    // Proving control of a signup email link is not a replacement for the mandatory
    // one-time login verification. No workspace/API session is minted here.
    clearAuthCookies(res);
    return this.mfa.begin({id:result.user.id,email:result.user.email});
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
  @Post('mfa/resend') resendMfa(@Body()body:{challengeId?:string}){return this.mfa.resend(String(body?.challengeId||''));}
  @Post('mfa/verify') async verifyMfa(@Req()req:Request,@Body()body:{challengeId?:string;code?:string},@Res({passthrough:true})res:Response){
    const user=await this.mfa.verify(String(body?.challengeId||''),String(body?.code||''));
    await this.issueSession(res,user,req);
    return {user:{id:user.id,email:user.email,name:user.name,role:user.role},sessionExpiresInDays:7};
  }
  @Post('mfa/recovery/verify')async recoverMfa(@Req()req:Request,@Body()body:{challengeId?:string;code?:string},@Res({passthrough:true})res:Response){
    const user=await this.mfa.verifyRecovery(String(body?.challengeId||''),String(body?.code||''));
    await this.issueSession(res,user,req);return {user:{id:user.id,email:user.email,name:user.name,role:user.role},sessionExpiresInDays:7};
  }
  @UseGuards(IdentityGuard) @Get('mfa/recovery/status')recoveryStatus(@Req()req:AuthRequest){return this.mfa.recoveryStatus(req.user.id);}
  @UseGuards(IdentityGuard) @Post('mfa/recovery/start')async startRecovery(@Req()req:AuthRequest,@Body()body:{currentPassword?:string}){
    const recent=typeof (req as any).authAt==='number'&&Date.now()-(req as any).authAt<=5*60_000;
    if(!body?.currentPassword&&!recent)throw new BadRequestException('Sign in again or enter your current password to set up recovery.');
    const user=body?.currentPassword?await this.service.confirmPassword(req.user.id,body.currentPassword):{id:req.user.id,email:req.user.email};
    return this.mfa.begin(user,'RECOVERY_SETUP');
  }
  @UseGuards(IdentityGuard) @Post('mfa/recovery-codes')async recoveryCodes(@Req()req:AuthRequest,@Body()body:{challengeId?:string;code?:string},@Res({passthrough:true})res:Response){
    res.setHeader('Cache-Control','no-store');return this.mfa.generateRecoveryCodes(req.user.id,String(body?.challengeId||''),String(body?.code||''));
  }
    @UseGuards(IdentityGuard) @Get('me') me(@Req() req:AuthRequest) {return req.user;}
  @UseGuards(IdentityGuard) @Patch('password') async changePassword(@Req()req:AuthRequest,@Body()body:{currentPassword:string;newPassword:string},@Res({passthrough:true})res:Response){
    const result=await this.service.changePassword(req.user.id,body.currentPassword,body.newPassword);
    clearAuthCookies(res);
    return result;
  }
  @Post('logout') async logout(@Req()req:Request,@Res({passthrough:true}) res:Response) {
    clearAuthCookies(res);
    await this.sessions.logout(req.cookies?.salesos_session);
    return {success:true};
  }
}
