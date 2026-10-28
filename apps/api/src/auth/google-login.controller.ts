import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import {randomBytes} from 'node:crypto';
import {companyDomain} from '../workspace/company-email';
import argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleIdentityService } from '../integrations/google/google-identity.service';
import {MfaService} from './mfa.service';

/** Google login can optionally self-register a user, but never grants Seebot membership or company authority. */
@Controller('auth')
export class GoogleLoginController {
  constructor(private db:PrismaService,private identity:GoogleIdentityService,private mfa:MfaService){}
  @Post('google') async googleLogin(@Body()body:{credential?:string}){
    const verified=await this.identity.verify(body?.credential||'',process.env.GOOGLE_LOGIN_CLIENT_ID||'');
    companyDomain(verified.email);
    let user=await this.db.user.findUnique({where:{email:verified.email}});
    if(!user && process.env.GOOGLE_SELF_SIGNUP_ENABLED==='true'){
      companyDomain(verified.email);
      // A Google verified email proves control of the Google account only; it does not verify a company.
      // No Seebot membership is granted. The user must explicitly create their company workspace.
      user=await this.db.user.create({data:{
       name:verified.name.slice(0,160),email:verified.email,googleSubject:verified.subject,
       role:'SALES_REP',passwordHash:await argon2.hash(randomBytes(48).toString('base64url'))
      }});
      await this.db.auditEvent.create({data:{actorId:user.id,entityType:'USER',entityId:user.id,action:'GOOGLE_VERIFIED_SELF_REGISTRATION',detail:{email:user.email}}});
    }
    if(!user||!user.active)throw new UnauthorizedException('Your Google address is not an active invited SalesOS user.');
    if(user.googleSubject&&user.googleSubject!==verified.subject)throw new UnauthorizedException('This employee is linked to another Google identity. Contact an administrator.');
    if(!user.googleSubject){
      const changed=await this.db.user.updateMany({where:{id:user.id,googleSubject:null},data:{googleSubject:verified.subject}});
      if(changed.count!==1){const existing=await this.db.user.findUnique({where:{id:user.id}});if(existing?.googleSubject!==verified.subject)throw new UnauthorizedException('Google identity binding conflict.');}
    }
    // Google verifies the identity provider account; SalesOS still requires its own second factor on every sign-in.
    return this.mfa.begin({id:user.id,email:user.email});
  }
}
