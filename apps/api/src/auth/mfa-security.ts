import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const MFA_PERIOD_SECONDS=30;
export const MFA_PENDING_MINUTES=10;
export const SESSION_MAX_SECONDS=7*24*60*60;
export function mfaRequired(){return process.env.NODE_ENV==='production'||process.env.MFA_REQUIRED!=='false';}
export function encodeBase32(data:Buffer){let acc=0,bits=0,out='';for(const byte of data){acc=(acc<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=ALPHABET[(acc>>>bits)&31];}}if(bits>0)out+=ALPHABET[(acc<<(5-bits))&31];return out;}
export function decodeBase32(input:string){let acc=0,bits=0;const out:number[]=[];for(const char of input.toUpperCase().replace(/=+$/,'')){const i=ALPHABET.indexOf(char);if(i<0)throw Error('Invalid authenticator secret');acc=(acc<<5)|i;bits+=5;if(bits>=8){bits-=8;out.push((acc>>>bits)&255);acc&=(1<<bits)-1;}}return Buffer.from(out);}
export function newAuthenticatorSecret(){return encodeBase32(randomBytes(20));}
export function authenticatorUri(secret:string,email:string){const label=encodeURIComponent('Seebot SalesOS:'+email);return 'otpauth://totp/'+label+'?secret='+encodeURIComponent(secret)+'&issuer='+encodeURIComponent('Seebot SalesOS')+'&algorithm=SHA1&digits=6&period=30';}
export function otpAt(secret:string,counter:number){const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(counter));const h=createHmac('sha1',decodeBase32(secret)).update(message).digest();const offset=h[h.length-1]&15;const value=((h[offset]&127)<<24)|((h[offset+1]&255)<<16)|((h[offset+2]&255)<<8)|(h[offset+3]&255);return String(value%1_000_000).padStart(6,'0');}
export function matchingCounter(secret:string,code:string,now=Date.now()):number|null{
  if(typeof code!=='string'||!/^[0-9]{6}$/.test(code))return null;
  const current=Math.floor(now/(MFA_PERIOD_SECONDS*1000));
  for(let delta=-1;delta<=1;delta++){const counter=current+delta;if(counter<0)continue;const value=otpAt(secret,counter);if(timingSafeEqual(Buffer.from(value),Buffer.from(code)))return counter;}
  return null;
}
function key():Buffer{
  const raw=process.env.MFA_ENCRYPTION_KEY;
  if(!raw||!/^[A-Za-z0-9+/]{43}=$/.test(raw))throw Error('Set MFA_ENCRYPTION_KEY to a random 32-byte base64 secret.');
  const parsed=Buffer.from(raw,'base64');if(parsed.length!==32)throw Error('Invalid MFA_ENCRYPTION_KEY length.');
  return parsed;
}
export function assertMfaConfigured(){if(mfaRequired())key();}
export function encryptAuthenticatorSecret(secret:string){
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);const bytes=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');
}
export function decryptAuthenticatorSecret(encrypted:string){
  const [version,iv,tag,data,...extra]=encrypted.split('.');if(version!=='v1'||!iv||!tag||!data||extra.length)throw Error('Invalid encrypted authenticator');
  const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
export function newRecoveryCode(){const bytes=randomBytes(16).toString('hex').toUpperCase();return bytes.match(/.{1,4}/g)!.join('-');}
export function recoveryDigest(code:string){return createHmac('sha256',key()).update(code.toUpperCase().replace(/-/g,'')).digest('hex');}
export function matchingRecoveryCode(code:string,hashes:string[]){
  if(typeof code!=='string'||!/^(?:[0-9a-fA-F]{4}-){7}[0-9a-fA-F]{4}$/.test(code))return -1;
  const incoming=Buffer.from(recoveryDigest(code),'hex');
  return hashes.findIndex(hash=>/^[0-9a-f]{64}$/.test(hash)&&timingSafeEqual(Buffer.from(hash,'hex'),incoming));
}
