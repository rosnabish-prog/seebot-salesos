const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
function load(relative){
 const filename=path.join(__dirname,'../src',relative);
 const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(compiled,filename);return m.exports;
}
const {taxRuleInput,taxTotals,taxRate,exportCsv,parseTaxCsv}=load('accounting/tax-policy.ts');
const {Prisma}=require('@prisma/client');
test('finance tax catalog rejects unsupported treatments and invented rate precision',()=>{
 assert.throws(()=>taxRuleInput({code:'UK_STANDARD',name:'VAT standard',jurisdiction:'GB',treatment:'UNKNOWN',ratePercent:'20'}));
 assert.throws(()=>taxRuleInput({code:'UK_STANDARD',name:'VAT standard',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'20.00001'}));
 assert.throws(()=>taxRuleInput({code:'UK_STANDARD',name:'VAT standard',jurisdiction:'GB',treatment:'EXEMPT',ratePercent:'20'}));
 assert.throws(()=>taxRuleInput({code:'UK_STANDARD',name:'VAT standard',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'101'}));
});
test('finance rule includes exact decimal rate and valid jurisdiction',()=>{
 const r=taxRuleInput({code:'UK_VAT_DEMO',name:'Approved VAT example',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'20.0000',invoiceNote:'Illustrative only.'});
 assert.equal(r.code,'UK_VAT_DEMO');assert.equal(r.ratePercent.toString(),'20');
 assert.equal(r.jurisdiction,'GB');
});
test('invoice tax totals use decimal calculation with currency rounding',()=>{
 const {tax,total}=taxTotals(new Prisma.Decimal('99.99'),taxRate('20','STANDARD'));
 assert.equal(tax.toFixed(2),'20.00');assert.equal(total.toFixed(2),'119.99');
 const empty=taxTotals(new Prisma.Decimal('99.99'),taxRate('0','ZERO'));
 assert.equal(empty.tax.toFixed(2),'0.00');
});
test('CSV export safely escapes names, notes and embedded quotes',()=>{
 const csv=exportCsv([{code:'TAX_A',name:'VAT, special',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'20',status:'DRAFT',invoiceNote:'Note "needs review"'}]);
 assert.match(csv,/"VAT, special"/);assert.match(csv,/"Note ""needs review"""/);
});
test('effective-date intervals reject reversal',()=>{
 assert.throws(()=>taxRuleInput({code:'UK_VAT_DEMO',name:'Test tax rate',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'20',effectiveFrom:'2030-06-01',effectiveTo:'2029-06-01'}));
});

test('editable tax CSV roundtrips quoted notes into inactive import drafts',()=>{
 const csv=exportCsv([{code:'GB_TAX_V2',name:'Standard, service',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'20.00',status:'APPROVED',invoiceNote:'Quoted "text" in note'}]);
 const parsed=parseTaxCsv(csv);
 assert.equal(parsed.length,1);assert.equal(parsed[0].code,'GB_TAX_V2');
 assert.equal(parsed[0].invoiceNote,'Quoted "text" in note');
 assert.equal(parsed[0].ratePercent.toString(),'20');
});
test('tax CSV import rejects missing rates and duplicate codes',()=>{
 const base='code,name,jurisdiction,treatment,ratePercent,status,invoiceNote\r\n';
 assert.throws(()=>parseTaxCsv(base+'GB_A,Sample name,GB,STANDARD,,DRAFT,Note\r\n'));
 assert.throws(()=>parseTaxCsv(base+'GB_A,Sample name,GB,STANDARD,20,DRAFT,Note\r\nGB_A,Sample name,GB,STANDARD,20,DRAFT,Note\r\n'));
});
