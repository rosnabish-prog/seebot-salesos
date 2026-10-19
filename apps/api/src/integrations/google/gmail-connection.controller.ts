import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard, AuthRequest } from '../../common/auth.guard';
import { GmailConnectionService } from './gmail-connection.service';

@Controller('integrations/gmail')
export class GmailConnectionController {
  constructor(private readonly service:GmailConnectionService){}
  @Get('callback') async callback(@Query('code')code:string,@Query('state')state:string,@Res()res:Response){
    try { await this.service.complete(code,state);res.redirect(`${process.env.CORS_ORIGIN||'http://localhost:3000'}/entry?gmail=connected`); }
    catch {res.redirect(`${process.env.CORS_ORIGIN||'http://localhost:3000'}/entry?gmail=error`);}
  }
  @UseGuards(AuthGuard) @Get('status') status(@Req()req:AuthRequest){return this.service.status(req.user.id);}
  @UseGuards(AuthGuard) @Post('connect') connect(@Req()req:AuthRequest){return this.service.connectUrl(req.user.id);}
  @UseGuards(AuthGuard) @Post('disconnect') disconnect(@Req()req:AuthRequest){return this.service.disconnect(req.user.id);}
}
