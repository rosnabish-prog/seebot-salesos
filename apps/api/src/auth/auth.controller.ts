import { Body, Controller, Get, Post, Patch, Req, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard, AuthRequest } from '../common/auth.guard';
import { AuthService } from './auth.service';
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}
  @Post('login')
  async login(@Body() body:{email:string,password:string}, @Res({passthrough:true}) res:Response) {
    if (typeof body?.email!=='string' || typeof body?.password!=='string') throw new BadRequestException('Email and password required.');
    const out=await this.service.login(body.email,body.password);
    res.cookie('salesos_session',out.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:8*60*60*1000,path:'/'});
    return {user:out.user};
  }
  @UseGuards(AuthGuard) @Get('me') me(@Req() req:AuthRequest) {return req.user;}
  @UseGuards(AuthGuard) @Patch('password') async changePassword(@Req()req:AuthRequest,@Body()body:{currentPassword:string;newPassword:string},@Res({passthrough:true})res:Response){
    const result=await this.service.changePassword(req.user.id,body.currentPassword,body.newPassword);
    res.clearCookie('salesos_session',{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
    return result;
  }
  @Post('logout') logout(@Res({passthrough:true}) res:Response) {
    res.clearCookie('salesos_session',{path:'/',sameSite:'strict',secure:process.env.NODE_ENV==='production'});
    return {success:true};
  }
}
