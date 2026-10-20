import {Body,Controller,Get,Post,Patch,Req,Res,UseGuards,BadRequestException} from '@nestjs/common';
import type {Request,Response} from 'express';
import {AuthGuard,AuthRequest} from '../common/auth.guard';
import {AuthService} from './auth.service';
import {MfaService,clearAuthCookies} from './mfa.service';

@Controller('auth')
export class AuthController {
 constructor(private service:AuthService,private mfa:MfaService){}
 @Post('login')
 async login(@Body()body:{email:string;password:string},@Res({passthrough:true})res:Response){
   if(typeof body?.email!=='string'||typeof body?.password!=='string')throw new BadRequestException('Email and password required.');
   const user=await this.service.login(body.email,body.password);
   return this.mfa.begin(user,res);
 }
 @Get('mfa/status')status(@Req()req:Request){return this.mfa.status(req);}
 @Post('mfa/setup')setup(@Req()req:Request){return this.mfa.setup(req);}
 @Post('mfa/confirm')confirm(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:{code:string}){
   return this.mfa.confirm(req,res,body?.code);
 }
 @Post('mfa/verify')verify(@Req()req:Request,@Res({passthrough:true})res:Response,@Body()body:{code:string}){
   return this.mfa.verify(req,res,body?.code);
 }
 @UseGuards(AuthGuard) @Get('me')me(@Req()req:AuthRequest){return req.user;}
 @UseGuards(AuthGuard) @Patch('password')
 async changePassword(@Req()req:AuthRequest,@Body()body:{currentPassword:string;newPassword:string},@Res({passthrough:true})res:Response){
   const result=await this.service.changePassword(req.user.id,body.currentPassword,body.newPassword);
   clearAuthCookies(res);return result;
 }
 @Post('logout')logout(@Res({passthrough:true})res:Response){clearAuthCookies(res);return {success:true};}
}
