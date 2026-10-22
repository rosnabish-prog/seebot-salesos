const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/signing/immutable-evidence.store.ts');
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(js,filename);
const Store=m.exports.ImmutableEvidenceStore;
test('real signing evidence must fail closed without independently configured object-lock custody',async()=>{
 const keys=['NODE_ENV','SIGNING_EVIDENCE_OBJECT_LOCK_BUCKET','SIGNING_EVIDENCE_KMS_KEY_ARN','SIGNING_EVIDENCE_RETENTION_DAYS'];
 const prior=keys.map(k=>process.env[k]);
 try{
  const store=new Store();
  process.env.NODE_ENV='test';
  assert.deepEqual(await store.persist('fictional_env_000001','{}'),{enforced:false});
  process.env.NODE_ENV='production';
  delete process.env.SIGNING_EVIDENCE_OBJECT_LOCK_BUCKET;
  delete process.env.SIGNING_EVIDENCE_KMS_KEY_ARN;
  delete process.env.SIGNING_EVIDENCE_RETENTION_DAYS;
  await assert.rejects(store.persist('fictional_env_000001','{}'));
  process.env.SIGNING_EVIDENCE_OBJECT_LOCK_BUCKET='non-real-ci-example';
  process.env.SIGNING_EVIDENCE_KMS_KEY_ARN='arn:aws:kms:example';
  process.env.SIGNING_EVIDENCE_RETENTION_DAYS='90';
  await assert.rejects(store.persist('fictional_env_000001','{}'));
 }finally{keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i]);}
});
