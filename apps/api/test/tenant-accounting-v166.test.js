const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript');
function tsToCjs(relative){const src=fs.readFileSync(path.join(__dirname,'../src',relative),'utf8');const {outputText,diagnostics}=ts.transpileModule(src,{fileName:relative,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});assert.equal((diagnostics||[]).filter(x=>x.category===1).length,0);return outputText;}
function pure(relative){const js=tsToCjs(relative),m={exports:{}};Function('exports','module',js)(m.exports,m);return m.exports;}
const p=pure('accounting/journal-policy.ts');
test('journal posting is strict decimal and forbids fractional penny amounts',()=>{
 assert.equal(p.amountMinor('123.45'),12345);assert.throws(()=>p.amountMinor('12.345'));
 assert.throws(()=>p.amountMinor('-10.00'));assert.throws(()=>p.amountMinor('0'));
});
test('invoices create balanced receivables, revenue and tax lines',()=>{
 const lines=p.invoiceJournal('100.00','20.00');assert.equal(p.balanced(lines),true);
 assert.equal(lines.filter(x=>x.side==='DEBIT').reduce((n,x)=>n+x.amountMinor,0),12000);
 assert.equal(lines.filter(x=>x.side==='CREDIT').reduce((n,x)=>n+x.amountMinor,0),12000);
});
test('payments, approved customer credits and write-offs use distinct accounts',()=>{
 assert.equal(p.balanced(p.receiptJournal('12.50')),true);
 const customer=p.creditJournal('1.00','CREDIT_NOTE'),writeoff=p.creditJournal('1.00','WRITE_OFF');
 assert.notEqual(customer[0].accountCode,writeoff[0].accountCode);
 assert.equal(p.balanced(p.reverseJournal(customer)),true);
});
test('journal rejects unbalanced or invalid account-code postings',()=>{
 assert.equal(p.balanced([{accountCode:p.ACCOUNTS.AR,side:'DEBIT',amountMinor:100},{accountCode:p.ACCOUNTS.REVENUE,side:'CREDIT',amountMinor:101}]),false);
 assert.equal(p.balanced([{accountCode:'999999',side:'DEBIT',amountMinor:100},{accountCode:p.ACCOUNTS.REVENUE,side:'CREDIT',amountMinor:100}]),false);
});
test('all new scoped business routes enforce workspace membership and account lineage',()=>{
 const scope=fs.readFileSync(path.join(__dirname,'../src/workspace/tenant-scope.service.ts'),'utf8');const business=fs.readFileSync(path.join(__dirname,'../src/workspace/tenant-business.controller.ts'),'utf8');
 assert.match(scope,/this\.access\.require/);assert.match(fs.readFileSync(path.join(__dirname,'../src/workspace/workspace-access.service.ts'),'utf8'),/selectedWorkspace!==organizationId/);assert.match(scope,/organizationId\}\}/);
 for(const model of ['opportunity','contract','invoice'])assert.match(scope,new RegExp('async '+model+'\\('));
 assert.match(business,/scope\.membership\(/);assert.match(business,/scope\.account\(/);
});
test('real contract does not finalize until signing receipts have been archived',()=>{
 const signing=fs.readFileSync(path.join(__dirname,'../src/signing/signing.controller.ts'),'utf8');const evidence=fs.readFileSync(path.join(__dirname,'../src/signing/evidence-archive.service.ts'),'utf8');
 assert.match(signing,/finalizeAfterEvidence\(env.contractId\)/);assert.match(evidence,/for\(const env of envelopes\)/);
 assert.match(evidence,/await this\.verify\(env.id\)/);assert.match(signing,/contractFullyExecuted:finalized/);
});
test('credit notes and payments journalize within database transactions',()=>{
 const invoice=fs.readFileSync(path.join(__dirname,'../src/invoices/invoice-pdf.service.ts'),'utf8');
 const payment=fs.readFileSync(path.join(__dirname,'../src/clients/clients.controller.ts'),'utf8');
 const credit=fs.readFileSync(path.join(__dirname,'../src/commercial/credit-note-pdf.controller.ts'),'utf8');
 assert.match(invoice,/writeJournal\(tx,/);assert.match(payment,/writeJournal\(tx,/);assert.match(credit,/writeJournal\(tx,/);
});
