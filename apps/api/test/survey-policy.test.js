const test=require('node:test');const assert=require('node:assert/strict');
// Compile the pure TS policy using the installed TypeScript runtime when tests run in the monorepo.
const ts=require('typescript'),Module=require('node:module');
const fs=require('node:fs'),path=require('node:path');
function load(filename){const file=path.resolve(__dirname,'../src',filename);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,require);return mod.exports;}
const {scoreSummary,surveyClassification,validateSurveyScore}=load('surveys/survey-validation.ts');
const {reminderEligibility}=load('invoices/reminder-policy.ts');
test('NPS standard promoters/passives/detractors',()=>{assert.equal(scoreSummary('NPS',[10,9,8,6,2]).score,0);assert.equal(surveyClassification('NPS',6),'DETRACTOR');assert.equal(surveyClassification('NPS',8),'PASSIVE')});
test('CSAT percentage and invalid scores',()=>{assert.equal(scoreSummary('CSAT',[5,4,2,1]).score,50);assert.throws(()=>validateSurveyScore('NPS',11));assert.throws(()=>validateSurveyScore('CSAT',2.5));});
test('overdue policy excludes paid and demo and waits for interval',()=>{const dueAt=new Date('2026-01-01T00:00:00Z'),today=new Date('2026-01-09T00:00:00Z');const inv={id:'x',number:'1',currency:'GBP',total:100,paid:0,dueAt,status:'SENT',isDemo:false,billingEmail:'a@example.com'};assert.equal(reminderEligibility(inv,today).eligible,true);assert.equal(reminderEligibility({...inv,paid:100},today).eligible,false);assert.equal(reminderEligibility({...inv,isDemo:true},today).eligible,false);assert.equal(reminderEligibility(inv,new Date('2026-01-03T00:00:00Z')).eligible,false);});
