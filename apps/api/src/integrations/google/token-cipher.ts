import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Versioned AES-256-GCM envelope. Server-side only. Use a managed secret in production. */
export function readEncryptionKey():Buffer {
  const input=process.env.APP_ENCRYPTION_KEY||'';
  const key=Buffer.from(input,'base64');
  if(key.length!==32||!input)throw Error('APP_ENCRYPTION_KEY must be base64-encoded 32 bytes.');
  return key;
}
export function encryptSecret(value:string,key=readEncryptionKey()):string {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function decryptSecret(value:string,key=readEncryptionKey()):string {
  const [version,iv,tag,data,...rest]=value.split('.');
  if(version!=='v1'||!iv||!tag||!data||rest.length)throw Error('Unsupported encrypted token.');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
