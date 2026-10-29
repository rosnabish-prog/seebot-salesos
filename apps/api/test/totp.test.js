require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {base32,decodeBase32,totpCode,matchTotpStep,sealTotp,openTotp}=require('../src/auth/totp.ts');
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('authenticator SHA-1 matches every RFC 6238 published test vector',()=>{
 assert.equal(base32(Buffer.from('12345678901234567890')),secret);
 assert.equal(decodeBase32(secret).toString(),'12345678901234567890');
 for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totpCode(secret,Math.floor(seconds/30),8),expected);
});
test('authenticator accepts a bounded clock window and rejects used steps and malformed codes',()=>{
 const now=1234567890000,step=Math.floor(now/30000),code=totpCode(secret,step);
 assert.equal(matchTotpStep(secret,code,step-1,now),step);
 assert.equal(matchTotpStep(secret,code,step,now),null);
 assert.equal(matchTotpStep(secret,totpCode(secret,step-1),-1,now),step-1);
 assert.equal(matchTotpStep(secret,totpCode(secret,step+1),-1,now),step+1);
 assert.equal(matchTotpStep(secret,totpCode(secret,step-2),-1,now),null);
 assert.equal(matchTotpStep(secret,'12345',-1,now),null);
 assert.equal(matchTotpStep(secret,'1234567',-1,now),null);
 assert.equal(matchTotpStep(secret,'abcdef',-1,now),null);
});
test('authenticator secrets are encrypted and bound to their account with fail-closed key handling',()=>{
 const prior=process.env.MFA_ENCRYPTION_KEY;
 try{
  process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,0x41).toString('base64');
  const encrypted=sealTotp('user-a',secret);assert.ok(!encrypted.includes(secret));assert.equal(openTotp('user-a',encrypted),secret);
  assert.throws(()=>openTotp('user-b',encrypted));
  const parts=encrypted.split('.'),tampered=Buffer.from(parts[3],'base64url');tampered[0]^=1;parts[3]=tampered.toString('base64url');
  assert.throws(()=>openTotp('user-a',parts.join('.')));
  process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,0x42).toString('base64');assert.throws(()=>openTotp('user-a',encrypted));
  delete process.env.MFA_ENCRYPTION_KEY;assert.throws(()=>sealTotp('user-a',secret));
 }finally{if(prior===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=prior;}
});

test('versioned keyring reads previous keys and prevents removing a required key silently',()=>{
 const names=['MFA_ENCRYPTION_KEY','MFA_ENCRYPTION_KEYS','MFA_ENCRYPTION_ACTIVE_KEY_ID'],before=names.map(n=>process.env[n]);
 try{
  process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,0x41).toString('base64');
  delete process.env.MFA_ENCRYPTION_KEYS;delete process.env.MFA_ENCRYPTION_ACTIVE_KEY_ID;
  const legacy=sealTotp('ring-user',secret);
  const keys={old:Buffer.alloc(32,0x42).toString('base64'),new:Buffer.alloc(32,0x43).toString('base64')};
  process.env.MFA_ENCRYPTION_KEYS=JSON.stringify(keys);process.env.MFA_ENCRYPTION_ACTIVE_KEY_ID='old';
  const older=sealTotp('ring-user',secret);assert.ok(older.startsWith('totp2.old.'));
  process.env.MFA_ENCRYPTION_ACTIVE_KEY_ID='new';
  const newer=sealTotp('ring-user',openTotp('ring-user',older));assert.ok(newer.startsWith('totp2.new.'));
  assert.equal(openTotp('ring-user',legacy),secret);assert.equal(openTotp('ring-user',newer),secret);
  process.env.MFA_ENCRYPTION_KEYS=JSON.stringify({new:keys.new});delete process.env.MFA_ENCRYPTION_KEY;
  assert.equal(openTotp('ring-user',newer),secret);assert.throws(()=>openTotp('ring-user',older));assert.throws(()=>openTotp('ring-user',legacy));
  process.env.MFA_ENCRYPTION_ACTIVE_KEY_ID='missing';assert.throws(()=>sealTotp('ring-user',secret));
 }finally{names.forEach((n,i)=>before[i]===undefined?delete process.env[n]:process.env[n]=before[i]);}
});
