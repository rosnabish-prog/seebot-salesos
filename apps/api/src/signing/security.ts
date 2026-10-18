import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const newInvitationToken=()=>randomBytes(32).toString('base64url');
export const hashInvitationToken=(token:string)=>createHash('sha256').update(token,'utf8').digest('hex');
export function equalNormalizedEmail(a:string,b:string){
  const x=a.trim().toLowerCase(),y=b.trim().toLowerCase();
  const xb=Buffer.from(x),yb=Buffer.from(y);
  return xb.length===yb.length && timingSafeEqual(xb,yb);
}
export function googleEmailAuthoritative(email:string,emailVerified:boolean,hostedDomain?:string){
  if(!emailVerified)return false;
  if(email.toLowerCase().endsWith('@gmail.com'))return true;
  return Boolean(hostedDomain && email.toLowerCase().endsWith('@'+hostedDomain.toLowerCase()));
}
// HMAC chaining detects changes unless the server's signing key is compromised;
// immutable offsite anchors/backups are still required for strong evidentiary defence.
export function auditDigest(key:string,details:{envelopeId:string;sequence:number;type:string;actorEmail:string|null;googleSub:string|null;ipAddress:string|null;userAgent:string|null;metadata:unknown;occurredAt:string;previousDigest:string}){
  return createHmac('sha256',key).update(JSON.stringify(details)).digest('hex');
}
export const SIGNING_CONSENT_VERSION='2026-10-17/v1';
export const SIGNING_CONSENT='I agree to use an electronic signature, intend to sign the identified document, and confirm I am authorized to sign on behalf of the stated party.';
