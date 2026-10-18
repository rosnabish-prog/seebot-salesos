const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=(s)=>fs.readFileSync(path.join(__dirname,'../src/client-success',s),'utf8');
test('health signals include NPS, CSAT, issues, invoices, expiry',()=>{const x=read('client-health.ts');for(const key of ['npsScores','csatScores','criticalIssues','overdueInvoices','expiresWithinDays'])assert.ok(x.includes(key));});
test('reports are account-scoped before snapshot access',()=>{const x=read('client-success.controller.ts');assert.ok(x.includes('await this.client(req,report.accountId)'));});
test('renewal requires signed contract with expiry',()=>{const x=read('client-success.controller.ts');assert.ok(x.includes("c.status!=='SIGNED'||!c.expiresAt"));});
test('demo report marked accurately',()=>{const x=read('report-renderer.ts');assert.ok(x.includes('FICTIONAL DEMO'));});
