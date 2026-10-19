import { Body, Controller, Get, Post, Patch, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthRequest } from '../common/auth.guard';
import { IdentityGuard } from '../workspace/identity.guard';
import { AuthService } from './auth.service';
import { AccountRecoveryService } from './account-recovery.service';
import { JwtService } from '@nestjs/jwt';
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService,private recovery:AccountRecoveryService,private jwt:JwtService) {}
  private session(res:Response,token:string){res.cookie('salesos_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:8*60*60*1000,path:'/'});}
  @Get('capabilities') capabilities(){return this.recovery.capabilities();}
  @Post('register') async register(@Body()body:{name?:string;email?:string;password?:string},@Res({passthrough:true})res:Response){
    const result=await this.recovery.register(body);
    if('user' in result && result.user){const token=await this.jwt.signAsync({sub:result.user.id,role:result.user.role,pv:1});this.session(res,token);}
    return result;
  }
  @Post('verify-signup') async verify(@Body()body:{token:string},@Res({passthrough:true})res:Response){
    const result=await this.recovery.verifySignup(body?.token);
    this.session(res,await this.jwt.signAsync({sub:result.user.id,role:result.user.role,pv:1}));
    return result;
  }
  @Post('forgot-password') forgotPassword(@Body()body:{email?:string}){return this.recovery.requestReset(body?.email||'');}
  @Post('reset-password') resetPassword(@Body()body:{token?:string;password?:string}){return this.recovery.resetPassword(body?.token||'',body?.password||'');}
  @Post('login')
  async login(@Body() body:{email:string,password:string}, @Res({passthrough:true}) res:Response) {
    if (typeof body?.email!=='string' || typeof body?.password!=='string') throw new BadRequestException('Email and password required.');
    const out=await this.service.login(body.email,body.password);
    this.session(res,out.token);
    return {user:out.user};
  }
  @UseGuards(IdentityGuard) @Get('me') me(@Req() req:AuthRequest) {return req.user;}
  @UseGuards(IdentityGuard) @Patch('password') async changePassword(@Req()req:AuthRequest,@Body()body:{currentPassword:string;newPassword:string},@Res({passthrough:true})res:Response){
    const result=await this.service.changePassword(req.user.id,body.currentPassword,body.newPassword);
    res.clearCookie('salesos_session',{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
    return result;
  }
  @Post('logout') logout(@Res({passthrough:true}) res:Response) {
    res.clearCookie('salesos_session',{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
    return {success:true};
  }
}
