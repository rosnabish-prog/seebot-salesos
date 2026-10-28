const {test}=require('node:test');
const {strict:assert}=require('node:assert');
const fs=require('node:fs');
const vm=require('node:vm');
// Test the TypeScript source directly; no API credentials or third-party calls are required.
const ts=require('typescript');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../src/intelligence/demo-provider.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
const moduleExports={};
vm.runInNewContext(js,{exports:moduleExports,require:(name)=>name==='@nestjs/common'?{Injectable:()=>target=>target}:undefined});
const p=new moduleExports.DemoIntelligenceProvider();
test('mock research never claims verification or external sources',()=>{
 const r=p.research({name:'Fictional One',website:'https://fictional.example',industry:'AI / NLP',hypothesis:'possible training data need'});
 assert.match(r.warning,/DEMO ONLY/);assert.equal(r.sources[0].verified,false);assert.ok(r.unknowns.length>0);
});
test('all lookalikes are explicitly fictional placeholders',()=>{
 const r=p.discover({name:'Fictional One',industry:'AI'});
 assert.ok(r.companies.length>0);assert.ok(r.companies.every(x=>x.domain.endsWith('.example')));
});
test('opted out contacts never appear as contactable',()=>{
 const r=p.rank([{id:'1',name:'Test Person',title:'Head of AI',verified:true, email:'a@example.com',optedOut:true}]);
 assert.equal(r.rankings[0].score,0);assert.equal(r.rankings[0].canContact,false);
});
test('revision preserves meaningful draft text and is explicitly demo',()=>{
 const draft=p.draft({name:'Example Company',industry:'AI',hypothesis:'test'},{name:'Jane Test',title:'Head of Data'});
 assert.match(draft.body,/Jane/);assert.match(draft.warning,/DEMO/);
 const branded=p.draft({name:'Prospect',industry:'AI',hypothesis:''},{name:'Jane',title:'Buyer'},{name:'Tenant Alpha',services:['Consulting'],signature:'Alex · Tenant Alpha'});assert.match(branded.body,/Tenant Alpha/);assert.doesNotMatch(branded.body,/Seebot/);const changed=p.revise(branded.subject,branded.body,'shorter',{name:'Tenant Alpha',signature:'Alex · Tenant Alpha'});assert.match(changed.body,/Alex · Tenant Alpha/);assert.doesNotMatch(changed.body,/Seebot/);
});
test('reply classifier handles suppression ahead of positive interest',()=>{
 assert.equal(p.analyze('Interested, but please unsubscribe').classification,'OPT_OUT');
 assert.equal(p.analyze('Could we schedule a meeting?').classification,'POTENTIAL_INTEREST');
 assert.equal(p.analyze('Out of office until Monday').classification,'AUTO_REPLY');
});
