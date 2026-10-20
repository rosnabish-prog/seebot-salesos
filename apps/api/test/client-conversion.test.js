const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
test('contracting activates existing account in client management without a duplicate company',()=>{
 const workflow=read('opportunities/workflow.service.ts'),clients=read('clients/clients.controller.ts');
 assert.match(workflow,/stage==='PILOT_CONTRACTED'/);
 assert.match(workflow,/tx\.account\.updateMany\(\{where:\{id:opp\.accountId/);
 assert.match(workflow,/status:'Contracting'/);
 assert.match(workflow,/stage==='CLOSED_WON'/);
 assert.match(workflow,/status:'Customer'/);
 assert.match(clients,/status:\{in:\['Customer','Contracting'\]\}/);
});
test('billing remains restricted to active clients',()=>{
 const clients=read('clients/clients.controller.ts');
 assert.match(clients,/if\(account\.status!=='Customer'\)/);
});
