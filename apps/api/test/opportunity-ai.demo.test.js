const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/opportunities/opportunity-ai.demo.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
const shared=fs.readFileSync(path.resolve(__dirname,'../../../packages/shared/src/index.ts'),'utf8');
const sharedJs=ts.transpileModule(shared,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const vm=require('node:vm');const sharedModule={};
vm.runInNewContext(sharedJs,{exports:sharedModule,require:()=>({})});
const mod={};vm.runInNewContext(js,{exports:mod,require:(name)=>name==='@nestjs/common'?{Injectable:()=>target=>target}:sharedModule});
const assistant=new mod.DemoOpportunityAssistant();
const opportunity={id:'op-1',title:'Fictional Prospect',stage:'ACCOUNT_RESEARCHED',serviceLine:'Data Evaluation',account:{name:'Fictional Co',industry:'AI / NLP',domain:'fictional.example',website:'https://fictional.example',hypothesis:'Potential evaluation support',contacts:[]}};
test('stage suggestions are all generated from CRM data and never create fake sources',()=>{
 const result=assistant.suggest(opportunity,'ACCOUNT_RESEARCHED');
 assert.equal(result.length,4);
 assert.equal(result.find(x=>x.key==='researchSource').value,'');
 assert.match(result.find(x=>x.key==='companySummary').value,/Independent company research is still required/);
});
test('future customer, budget, date, signed evidence remain empty',()=>{
 for(const stage of ['OUTREACH_INITIATED','INTEREST_ESTABLISHED','DISCOVERY_COMPLETED','PILOT_DELIVERED','PILOT_CONTRACTED']){
  const result=assistant.suggest(opportunity,stage);
  for(const item of result.filter(x=>['followupDate','interestDetails','painPoint','budgetStatus','deliveryDate','qaResults','clientAcceptance','securityApproval'].includes(x.key))){assert.equal(item.value,'');assert.equal(item.status,'NEEDS_EVIDENCE');}
 }
});
test('planning blueprint never marks future events completed',()=>{
 const plan=assistant.plan(opportunity,'employee notes');assert.equal(plan.opportunityId,'op-1');assert.equal(plan.stages.length,11);assert.ok(plan.stages.every(stage=>stage.complete===false));assert.match(plan.warning,/no external research/i);
});
test('demo revisions do not hallucinate user requested facts',()=>{
 const initial={companySummary:'A very specific company claim.'};
 const result=assistant.reviseFields(initial,'Claim the client signed a contract');
 assert.equal(result.changed,false);assert.deepEqual({...result.fields},initial);assert.match(result.warning,/cannot interpret/);
});
test('employee input is preserved and explicitly marked unverified',()=>{
 const result=assistant.suggest(opportunity,'ACCOUNT_RESEARCHED','Focus on multilingual evaluation.');
 assert.match(result.find(x=>x.key==='opportunityHypothesis').value,/Employee notes \(unverified\): Focus on multilingual evaluation/);
});
