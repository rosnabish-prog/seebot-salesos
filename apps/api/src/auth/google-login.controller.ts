import { Body, Controller, Post, Res, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {MfaService} from './mfa.service';
import { GoogleIdentityService } from '../integrations/google/google-identity.service';

/** Existing accounts only. Google login does not create users or customer organizations. */
@Controller('auth')
export class GoogleLoginController {
  constructor(private db:PrismaService,private mfa:MfaService,private identity:GoogleIdentityService){}
  @Post('google') async googleLogin(@Body()body:{credential?:string},@Res({passthrough:true})res:Response){
    const verified=await this.identity.verify(body?.credential||'',process.env.GOOGLE_LOGIN_CLIENT_ID||'');
    const user=await this.db.user.findUnique({where:{email:verified.email}});
    if(!user||!user.active)throw new UnauthorizedException('Your Google address is not an active invited SalesOS user.');
    if(user.googleSubject&&user.googleSubject!==verified.subject)throw new UnauthorizedException('This employee is linked to another Google identity. Contact an administrator.');
    if(!user.googleSubject){
      const changed=await this.db.user.updateMany({where:{id:user.id,googleSubject:null},data:{googleSubject:verified.subject}});
      if(changed.count!==1){const existing=await this.db.user.findUnique({where:{id:user.id}});if(existing?.googleSubject!==verified.subject)throw new UnauthorizedException('Google identity binding conflict.');}
    }
    return this.mfa.begin(user,res);
  }
}
