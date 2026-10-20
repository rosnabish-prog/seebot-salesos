const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript');
const filename=path.join(__dirname,'../src/auth/mfa-security.ts');
const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(compiled,filename);
const s=m.exports;
process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,23).toString('base64');
test('base32 and TOTP produce a valid time-based code',()=>{
 const raw=Buffer.from('foobar');
 assert.equal(s.encodeBase32(raw),'MZXW6YTBOI');
 assert.deepEqual(s.decodeBase32('MZXW6YTBOI'),raw);
 const secret=s.newAuthenticatorSecret();
 const counter=54321000;
 const code=s.otpAt(secret,counter);
 assert.match(code,/^[0-9]{6}$/);
 assert.equal(s.matchingCounter(secret,code,counter*30000),counter);
 assert.equal(s.matchingCounter(secret,code,(counter+3)*30000),null);
 assert.equal(s.matchingCounter(secret,'ABCDEF',counter*30000),null);
});
test('AES-GCM protects authenticator secrets and rejects tampering',()=>{
 const secret=s.newAuthenticatorSecret();
 const first=s.encryptAuthenticatorSecret(secret),second=s.encryptAuthenticatorSecret(secret);
 assert.notEqual(first,second);assert.equal(s.decryptAuthenticatorSecret(first),secret);
 const sections=first.split('.');sections[3]='A'+sections[3].slice(1);
 assert.throws(()=>s.decryptAuthenticatorSecret(sections.join('.')));
});
test('recovery codes are high-entropy, keyed digests, and never match invalid shapes',()=>{
 const codes=Array.from({length:8},()=>s.newRecoveryCode());
 const hashes=codes.map(s.recoveryDigest);
 assert.equal(new Set(codes).size,8);
 assert.equal(s.matchingRecoveryCode(codes[3],hashes),3);
 assert.equal(s.matchingRecoveryCode('000000',hashes),-1);
 assert.equal(s.matchingRecoveryCode(s.newRecoveryCode(),hashes),-1);
});
test('production cannot disable MFA, development demo can be explicitly configured',()=>{
 const a=process.env.NODE_ENV,b=process.env.MFA_REQUIRED;
 try{
  process.env.NODE_ENV='production';process.env.MFA_REQUIRED='false';assert.equal(s.mfaRequired(),true);
  process.env.NODE_ENV='development';process.env.MFA_REQUIRED='false';assert.equal(s.mfaRequired(),false);
  delete process.env.MFA_REQUIRED;assert.equal(s.mfaRequired(),true);
 }finally{if(a===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=a;if(b===undefined)delete process.env.MFA_REQUIRED;else process.env.MFA_REQUIRED=b}
});
test('both authenticated route guards require completed MFA',()=>{
 for(const target of ['../src/common/auth.guard.ts','../src/workspace/identity.guard.ts']){
  const src=fs.readFileSync(path.join(__dirname,target),'utf8');
  assert.match(src,/payload\.purpose\s*!==\s*'session'/);
  assert.match(src,/payload\.mfa\s*!==\s*true/);
 }
});
