import {createHmac,timingSafeEqual} from 'node:crypto';
import {ServiceUnavailableException} from '@nestjs/common';
import {decryptSecret,encryptSecret} from '../integrations/google/token-cipher';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes:Buffer){
 let bits=0,value=0,out='';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
 if(bits)out+=alphabet[(value<<(5-bits))&31];return out;
}
export function decodeBase32(secret:string){
 if(!/^[A-Z2-7]{16,128}$/.test(secret))throw Error('Invalid authenticator secret.');
 let bits=0,value=0;const bytes:number[]=[];
 for(const char of secret){value=(value<<5)|alphabet.indexOf(char);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 return Buffer.from(bytes);
}
/** RFC 6238, SHA-1 and 30-second steps; digits parameter supports published test vectors. */
export function totpCode(secret:string,step:number,digits=6){
 if(!Number.isSafeInteger(step)||step<0||![6,8].includes(digits))throw Error('Invalid authenticator step.');
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const hash=createHmac('sha1',decodeBase32(secret)).update(counter).digest(),offset=hash[hash.length-1]&15;
 return String((hash.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
export function matchTotpStep(secret:string,code:string,lastStep:number,now=Date.now()){
 if(!/^[0-9]{6}$/.test(code)||!Number.isFinite(now)||now<0)return null;
 const current=Math.floor(now/30_000);let matched:number|null=null;
 for(const offset of [-1,0,1]){const step=current+offset;if(step<0)continue;
  const expected=Buffer.from(totpCode(secret,step)),provided=Buffer.from(code);
  if(timingSafeEqual(expected,provided)&&step>lastStep)matched=step;
 }return matched;
}
export function authenticatorKey(){
 const input=process.env.MFA_ENCRYPTION_KEY||'',key=Buffer.from(input,'base64');
 if(key.length!==32||key.toString('base64')!==input)throw new ServiceUnavailableException('Authenticator encryption is not configured.');
 return key;
}
export function sealTotp(userId:string,secret:string){return encryptSecret(JSON.stringify({purpose:'AUTHENTICATOR_V1',userId,secret}),authenticatorKey());}
export function openTotp(userId:string,value:string){
 try{const decoded=JSON.parse(decryptSecret(value,authenticatorKey()));
  if(decoded.purpose!=='AUTHENTICATOR_V1'||decoded.userId!==userId||!/^[A-Z2-7]{32}$/.test(decoded.secret))throw Error('Invalid binding');
  return String(decoded.secret);
 }catch{throw new ServiceUnavailableException('Authenticator verification is unavailable. Use a saved recovery code or contact support.');}
}
