import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export type VerifiedGoogleIdentity={ subject:string; email:string; name:string };

@Injectable()
export class GoogleIdentityService {
  private readonly client=new OAuth2Client();
  async verify(idToken:string, clientId:string):Promise<VerifiedGoogleIdentity> {
    if(!clientId)throw new ServiceUnavailableException('Google sign-in is not configured.');
    if(typeof idToken!=='string'||idToken.length<100||idToken.length>12000)throw new UnauthorizedException('Invalid Google identity token.');
    let payload;
    try { payload=(await this.client.verifyIdToken({idToken,audience:clientId})).getPayload(); }
    catch { throw new UnauthorizedException('Google authentication failed.'); }
    if(!payload?.sub||!payload.email||payload.email_verified!==true)throw new UnauthorizedException('Google email verification is required.');
    // A verified email on an external Google account does not establish company authority.
    return {subject:payload.sub,email:payload.email.trim().toLowerCase(),name:payload.name||payload.email};
  }
}
