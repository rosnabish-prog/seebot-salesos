import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleIdentityService } from './google-identity.service';
import { decryptSecret, encryptSecret, readEncryptionKey } from './token-cipher';

const sendScope='https://www.googleapis.com/auth/gmail.send';
function oauthConfig(){
  const id=process.env.GOOGLE_GMAIL_CLIENT_ID,secret=process.env.GOOGLE_GMAIL_CLIENT_SECRET,redirect=process.env.GOOGLE_GMAIL_REDIRECT_URI;
  if(!id||!secret||!redirect)throw new ServiceUnavailableException('Google Gmail OAuth credentials are not configured.');
  if(process.env.NODE_ENV==='production'&&!redirect.startsWith('https://'))throw new ServiceUnavailableException('Gmail OAuth requires HTTPS in production.');
  readEncryptionKey();
  return {id,secret,redirect};
}
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');

@Injectable()
export class GmailConnectionService {
  constructor(private db:PrismaService,private google:GoogleIdentityService){}
  configured(){try{oauthConfig();return true;}catch{return false;}}
  private oauth(){const c=oauthConfig();return new OAuth2Client(c.id,c.secret,c.redirect);}
  async status(userId:string){
    const c=await this.db.gmailConnection.findUnique({where:{userId},select:{googleEmail:true,status:true,connectedAt:true,updatedAt:true}});
    return {configured:this.configured(),sendingEnabled:process.env.GMAIL_SENDING_ENABLED==='true',connection:c};
  }
  async connectUrl(userId:string){
    const client=this.oauth(),state=randomBytes(32).toString('base64url');
    await this.db.googleOAuthState.create({data:{userId,stateHash:sha(state),expiresAt:new Date(Date.now()+10*60_000)}});
    const url=client.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['openid','email','profile',sendScope],state,include_granted_scopes:false});
    return {url};
  }
  async complete(code:string,state:string){
    if(!/^[\w-]{20,150}$/.test(state||'')||!code||code.length>8000)throw new BadRequestException('Invalid Google OAuth callback.');
    // The state is a one-time bearer authorization linking the callback to the initiating logged-in employee.
    const matching=await this.db.googleOAuthState.findUnique({where:{stateHash:sha(state)}});
    if(!matching||matching.expiresAt<=new Date()||matching.usedAt)throw new ForbiddenException('OAuth state expired or already used.');
    const claimed=await this.db.googleOAuthState.updateMany({where:{id:matching.id,usedAt:null,expiresAt:{gt:new Date()}},data:{usedAt:new Date()}});
    if(claimed.count!==1)throw new ForbiddenException('OAuth state already used.');
    const client=this.oauth();
    const {tokens}=await client.getToken(code);client.setCredentials(tokens);
    if(!tokens.id_token||!tokens.refresh_token)throw new BadRequestException('Google did not return refresh credentials. Reconnect with consent.');
    const identity=await this.google.verify(tokens.id_token,process.env.GOOGLE_GMAIL_CLIENT_ID||'');
    const employee=await this.db.user.findUnique({where:{id:matching.userId}});
    if(!employee||!employee.active)throw new ForbiddenException('Employee no longer active.');
    if(identity.email!==employee.email.trim().toLowerCase())throw new ForbiddenException('Connect the same verified Google address as your SalesOS account.');
    if(!tokens.scope?.split(' ').includes(sendScope))throw new ForbiddenException('The gmail.send permission was not granted.');
    await this.db.gmailConnection.upsert({where:{userId:matching.userId},create:{userId:matching.userId,googleEmail:identity.email,googleSubject:identity.subject,refreshTokenEncrypted:encryptSecret(tokens.refresh_token),scopes:tokens.scope||'',status:'CONNECTED'},update:{googleEmail:identity.email,googleSubject:identity.subject,refreshTokenEncrypted:encryptSecret(tokens.refresh_token),scopes:tokens.scope||'',status:'CONNECTED'}});
    return {connected:true,userId:matching.userId};
  }
  async disconnect(userId:string){await this.db.gmailConnection.deleteMany({where:{userId}});return {connected:false};}
  async send(userId:string,recipientEmail:string,subject:string,body:string,attachment?:{fileName:string;bytes:Buffer}):Promise<string> {
    if(process.env.GMAIL_SENDING_ENABLED!=='true')throw new ServiceUnavailableException('Gmail sending is disabled until verified.');
    const connection=await this.db.gmailConnection.findUnique({where:{userId}});
    if(!connection||connection.status!=='CONNECTED')throw new ServiceUnavailableException('Connect your Gmail account first.');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)||/[\r\n]/.test(subject))throw new BadRequestException('Invalid recipient or email subject.');
    const client=this.oauth();client.setCredentials({refresh_token:decryptSecret(connection.refreshTokenEncrypted)});
    const encodeHeader=(v:string)=>/[^\x20-\x7E]/.test(v)?`=?UTF-8?B?${Buffer.from(v).toString('base64')}?=`:v;
    // MIME lines use CRLF. Body is encoded so untrusted text cannot inject mail headers.
    const boundary='salesos_'+randomBytes(12).toString('hex');
    const mailHeaders=[`To: ${recipientEmail}`,`Subject: ${encodeHeader(subject)}`,'MIME-Version: 1.0'];
    const safeAttachment=attachment?.fileName.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,80)||'document.pdf';
    const mime=attachment
      ? [...mailHeaders,`Content-Type: multipart/mixed; boundary=\"${boundary}\"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body,'utf8').toString('base64'),`--${boundary}`,`Content-Type: application/pdf; name=\"${safeAttachment}\"`,`Content-Disposition: attachment; filename=\"${safeAttachment}\"`,'Content-Transfer-Encoding: base64','',attachment.bytes.toString('base64'),`--${boundary}--`].join('\r\n')
      : [...mailHeaders,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body,'utf8').toString('base64')].join('\r\n');
    const token=await client.getAccessToken();if(!token.token)throw new ServiceUnavailableException('Unable to refresh Gmail authorization.');
    const response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${token.token}`,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(mime).toString('base64url')})});
    if(!response.ok){throw new ServiceUnavailableException(`Gmail delivery failed (${response.status}).`);}
    const sent=await response.json() as {id?:string};
    if(!sent.id)throw new ServiceUnavailableException('Gmail did not return a message identifier.');
    return sent.id;
  }
}
