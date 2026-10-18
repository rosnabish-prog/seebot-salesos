const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {runInNewContext}=require('node:vm');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const source=readFileSync(path.join(__dirname,'../src/integrations/google/token-cipher.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},require,Buffer,process};
runInNewContext(js,context);
const {encryptSecret,decryptSecret,readEncryptionKey}=context.exports;
const key=Buffer.alloc(32,7);
test('token encryption uses authenticated ciphertext and a different random IV',()=>{
 const a=encryptSecret('refresh-token-sample',key),b=encryptSecret('refresh-token-sample',key);
 assert.notEqual(a,b);assert.equal(decryptSecret(a,key),'refresh-token-sample');
});
test('modified encrypted tokens fail authentication',()=>{
 const original=encryptSecret('private-refresh-token',key),parts=original.split('.');
 parts[3]=Buffer.from('malicious').toString('base64url');
 assert.throws(()=>decryptSecret(parts.join('.'),key));
});
test('reject missing encryption key in production configuration',()=>{
 const before=process.env.APP_ENCRYPTION_KEY;
 try{delete process.env.APP_ENCRYPTION_KEY;assert.throws(()=>readEncryptionKey());}
 finally{if(before!==undefined)process.env.APP_ENCRYPTION_KEY=before;}
});
