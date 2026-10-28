require('./register-ts.cjs');
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../src/workspace/tenant-scope.service.ts');
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(js,filename);
const Scope=mod.exports.TenantScopeService;
test('production tenant access is disabled even if preview flag is mistakenly set',()=>{
 const keys=['NODE_ENV','TENANT_SCOPED_CRM_PREVIEW','TENANT_SCOPED_CRM_PRODUCTION_ENABLED'];const prior=keys.map(k=>process.env[k]);
 try{
  const scope=new Scope({});
  process.env.NODE_ENV='production';process.env.TENANT_SCOPED_CRM_PREVIEW='true';process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED='false';
  assert.equal(scope.enabled(),false);
  process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED='true';
  assert.equal(scope.enabled(),true);
  assert.doesNotThrow(()=>scope.assertFictional('legitimate-client.com'));
  process.env.NODE_ENV='test';
  assert.equal(scope.enabled(),true);
  assert.throws(()=>scope.assertFictional('legitimate-client.com'));
  assert.doesNotThrow(()=>scope.assertFictional('fictional.example'));
 }finally{keys.forEach((k,i)=>prior[i]===undefined?delete process.env[k]:process.env[k]=prior[i]);}
});
