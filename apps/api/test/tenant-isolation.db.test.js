require('./register-ts.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const {PrismaClient}=require('@prisma/client');

function loadScope(){
  const filename=path.join(__dirname,'../src/workspace/tenant-scope.service.ts');
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    fileName:filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}
  }).outputText;
  const mod=new Module(filename,module);
  mod.filename=filename;
  mod.paths=Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code,filename);
  return mod.exports.TenantScopeService;
}
test('real PostgreSQL rejects cross-organization account, opportunity, contract and invoice access',async()=>{
  assert.ok(process.env.DATABASE_URL,'Requires a disposable PostgreSQL test database');
  assert.equal(process.env.NODE_ENV,'test','Must never run against production');
  const prisma=new PrismaClient();
  const previous=process.env.TENANT_SCOPED_CRM_PREVIEW;
  process.env.TENANT_SCOPED_CRM_PREVIEW='true';
  const rollback=new Error('EXPECTED_TEST_ROLLBACK');
  try{
    await assert.rejects(prisma.$transaction(async tx=>{
      const unique=Date.now().toString(36)+'-'+process.pid;
      const user=await tx.user.create({data:{
        email:'tenant-check-'+unique+'@example.invalid',
        name:'Tenant Test User',passwordHash:'NOT_A_LOGIN_HASH'
      }});
      const orgA=await tx.organization.create({data:{slug:'tenant-a-'+unique,name:'Tenant A'}});
      const orgB=await tx.organization.create({data:{slug:'tenant-b-'+unique,name:'Tenant B'}});
      await tx.organizationMembership.create({data:{organizationId:orgA.id,userId:user.id,role:'OWNER'}});
      const accountData=(organizationId,name)=>({
        organizationId,name,domain:name.toLowerCase()+unique+'.example',
        website:'https://'+name.toLowerCase()+unique+'.example',
        industry:'Testing',hypothesis:'Fictional security test',ownerId:user.id,isDemo:true
      });
      const accountA=await tx.account.create({data:accountData(orgA.id,'A')});
      const accountB=await tx.account.create({data:accountData(orgB.id,'B')});
      const oppB=await tx.opportunity.create({data:{
        accountId:accountB.id,ownerId:user.id,title:'Fictional B opportunity',serviceLine:'Security test'
      }});
      const contractB=await tx.contract.create({data:{
        opportunityId:oppB.id,title:'Fictional B contract',type:'SOW',isDemo:true
      }});
      const invoiceB=await tx.invoice.create({data:{
        accountId:accountB.id,contractId:contractB.id,number:'TEST-'+unique,
        billingEmail:'billing@example.invalid',createdById:user.id,
        subtotal:'100.00',tax:'0.00',total:'100.00',dueAt:new Date(Date.now()+86400000),isDemo:true
      }});
      const Scope=loadScope(),scope=new Scope(tx);
      const request={selectedWorkspace:orgA.id,user:{id:user.id,role:'SALES_REP'}};
      assert.equal((await scope.membership(request,orgA.id)).role,'OWNER');
      await assert.rejects(scope.membership(request,orgB.id));
      assert.equal((await scope.account(orgA.id,accountA.id)).id,accountA.id);
      for(const operation of [
        ()=>scope.account(orgA.id,accountB.id),
        ()=>scope.opportunity(orgA.id,oppB.id),
        ()=>scope.contract(orgA.id,contractB.id),
        ()=>scope.invoice(orgA.id,invoiceB.id)
      ])await assert.rejects(operation());
      throw rollback;
    },{timeout:15000}),error=>error===rollback);
  }finally{
    if(previous===undefined)delete process.env.TENANT_SCOPED_CRM_PREVIEW;
    else process.env.TENANT_SCOPED_CRM_PREVIEW=previous;
    await prisma.$disconnect();
  }
});
