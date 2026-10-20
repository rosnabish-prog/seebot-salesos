const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript');
const name=path.join(__dirname,'../src/opportunities/pipeline-config.ts');
const js=ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const loaded=new Module(name,module);loaded.filename=name;loaded.paths=module.paths;loaded._compile(js,name);
const cfg=loaded.exports;
test('stage customization appends fields but never changes mandatory system gates',()=>{
 const input={extraFields:{DISCOVERY_COMPLETED:[{key:'custom_risk_rating',label:'Risk rating',type:'select',required:true,options:['Low','High']}]},mappings:{PILOT_QUALIFIED:{pilotScope:'evidence.technicalScope'}}};
 const valid=cfg.validatePipelineConfig(input);
 const fields=cfg.configuredFields(valid,'DISCOVERY_COMPLETED');
 assert.ok(fields.some(x=>x.key==='painPoint'&&x.required));
 assert.ok(fields.some(x=>x.key==='custom_risk_rating'&&x.required));
 assert.equal(valid.mappings.PILOT_QUALIFIED.pilotScope,'evidence.technicalScope');
});
test('settings reject duplicate, malformed and excessive custom fields',()=>{
 const field={key:'custom_priority',label:'Client priority',type:'text',required:true};
 assert.throws(()=>cfg.validatePipelineConfig({extraFields:{ACCOUNT_RESEARCHED:[field,field]},mappings:{}}));
 assert.throws(()=>cfg.validatePipelineConfig({extraFields:{ACCOUNT_RESEARCHED:[{...field,key:'companySummary'}]},mappings:{}}));
 assert.throws(()=>cfg.validatePipelineConfig({extraFields:{ACCOUNT_RESEARCHED:Array.from({length:9},(_,i)=>({...field,key:'custom_level_'+i}))},mappings:{}}));
});
test('auto-prefill cannot copy data from future stages or unknown models',()=>{
 assert.throws(()=>cfg.validatePipelineConfig({extraFields:{},mappings:{OUTREACH_INITIATED:{followupDate:'evidence.clientAcceptance'}}}));
 assert.throws(()=>cfg.validatePipelineConfig({extraFields:{},mappings:{OUTREACH_INITIATED:{followupDate:'account.passwordHash'}}}));
 assert.throws(()=>cfg.validatePipelineConfig({extraFields:{},mappings:{CLOSED_WON:{foo:'account.name'}}}));
});
test('malformed saved settings fall back safely rather than breaking the sales pipeline',()=>{
 assert.deepEqual(cfg.safePipelineConfig({extraFields:{INVALID_STAGE:[]},mappings:{}}),cfg.EMPTY_PIPELINE_CONFIG);
 assert.equal(cfg.configuredFields(cfg.safePipelineConfig({}),'ACCOUNT_RESEARCHED').length>0,true);
});
test('workflow engine stores mapped data only within the same opportunity',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/opportunities/workflow.service.ts'),'utf8');
 assert.match(source,/where:\{opportunityId:opp.id\}/);
 assert.match(source,/this\.prefill\(tx,opp,stage\)/);
 assert.match(source,/this\.fieldDefs\(tx,opp,stage\)/);
});
