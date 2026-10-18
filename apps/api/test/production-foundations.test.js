const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const ts=require('typescript');
function load(file){const filename=path.join(__dirname,'../src',file);const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(js,filename);return m.exports;}
const money=load('accounting/receivable-policy.ts'),signing=load('signing/signing-order.ts');
test('customer credit reduces receivable; internal write-off does not erase debt',()=>{const i={total:'100.00',payments:[{amount:'20.00'}],adjustments:[{status:'APPROVED',kind:'CREDIT_NOTE',amount:'10.00'},{status:'APPROVED',kind:'WRITE_OFF',amount:'15.00'}]};assert.equal(money.receivableMinor(i).due,7000);assert.equal(money.canApproveCustomerCredit(i,'70.00'),true);assert.equal(money.canApproveCustomerCredit(i,'70.01'),false);});
test('invoices reconcile exact cents, fractional unit rates and taxes',()=>{assert.equal(money.validateInvoiceTotals([{quantity:1000,unitPrice:'0.005'}],'5.00','1.00','6.00'),true);assert.equal(money.validateInvoiceTotals([{quantity:1000,unitPrice:'0.005'}],'5.00','1.00','7.00'),false);assert.throws(()=>money.toRateMicros('0.0000001'));});
test('currency journals require balanced positive debits and credits',()=>{assert.equal(money.validateJournalLines([{side:'DEBIT',amountMinor:1200,currency:'USD'},{side:'CREDIT',amountMinor:1200,currency:'USD'}]),true);assert.equal(money.validateJournalLines([{side:'DEBIT',amountMinor:1200,currency:'USD'},{side:'CREDIT',amountMinor:1000,currency:'USD'}]),false);});
test('signing only selects next required person regardless of input order, CC excluded',()=>{const createdAt=new Date('2026-01-01');const parties=[{id:'b',role:'SIGNER',status:'PENDING',signingOrder:2,createdAt},{id:'c',role:'CC',status:'PENDING',signingOrder:1,createdAt},{id:'a',role:'SIGNER',status:'SIGNED',signingOrder:1,createdAt}];assert.equal(signing.nextRequiredSigner(parties).id,'b');assert.equal(signing.fullyExecuted(parties),false);parties[0].status='SIGNED';assert.equal(signing.fullyExecuted(parties),true);});
test('account tenant ownership and protected CRM separation stay in source',()=>{const schema=fs.readFileSync(path.join(__dirname,'../../../packages/database/prisma/schema.prisma'),'utf8');const src=fs.readFileSync(path.join(__dirname,'../src/workspace/tenant-accounts.controller.ts'),'utf8');assert.match(schema,/@@unique\(\[organizationId,domain\]\)/);assert.match(src,/organizationId:orgId/);assert.match(src,/selectedWorkspace!==orgId/);assert.match(src,/TENANT_SCOPED_CRM_PREVIEW/);assert.match(src,/\.example/);});

test('independent audit receipt verifier accepts pinned key and rejects tampering',()=>{
 const crypto=require('node:crypto'),os=require('node:os'),{execFileSync,spawnSync}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'salesos-evidence-test-'));
 try{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
  const payload={format:'seebot-signing-evidence-v1',envelopeId:'demo-test',eventCount:2};
  const data=Buffer.from(JSON.stringify(payload));
  const filename=path.join(dir,'packet.json'),keyfile=path.join(dir,'pinned.pem');
  const packet={payload,sha256:crypto.createHash('sha256').update(data).digest('hex'),signatureAlgorithm:'Ed25519',signature:crypto.sign(null,data,privateKey).toString('base64')};
  fs.writeFileSync(filename,JSON.stringify(packet));fs.writeFileSync(keyfile,publicKey.export({type:'spki',format:'pem'}));
  const cli=path.join(__dirname,'../../../scripts/verify-signing-evidence.mjs');
  const valid=JSON.parse(execFileSync(process.execPath,[cli,filename,keyfile],{encoding:'utf8'}));assert.equal(valid.valid,true);
  packet.payload.eventCount=3;fs.writeFileSync(filename,JSON.stringify(packet));
  assert.notEqual(spawnSync(process.execPath,[cli,filename,keyfile],{encoding:'utf8'}).status,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
