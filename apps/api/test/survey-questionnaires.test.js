const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),filename=path.join(__dirname,'../src/surveys/survey-validation.ts');
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(js,filename);const s=m.exports;
const questions=[
 {id:'q_rating',label:'Rate the quality',kind:'RATING_5',required:true},
 {id:'q_notes',label:'Share your experience',kind:'TEXT',required:false},
 {id:'q_speed',label:'How was the speed?',kind:'SINGLE_CHOICE',required:true,options:['Fast','Slow']},
 {id:'q_services',label:'Which services were used?',kind:'MULTIPLE_CHOICE',required:false,options:['Data','QA']}
];
test('custom client survey accepts valid rating, text and choice answers',()=>{
 const validated=s.validateQuestionnaire(questions);
 const result=s.validateSurveyAnswers(validated,{q_rating:5,q_notes:'  Helpful feedback ',q_speed:'Fast',q_services:['Data','QA']});
 assert.equal(result.q_rating,5);assert.equal(result.q_notes,'Helpful feedback');assert.deepEqual(result.q_services,['Data','QA']);
});
test('unknown, duplicate and unsupported questions are rejected',()=>{
 assert.throws(()=>s.validateQuestionnaire([...questions,questions[0]]));
 assert.throws(()=>s.validateQuestionnaire([{...questions[0],kind:'HTML'}]));
 assert.throws(()=>s.validateQuestionnaire([{...questions[2],options:['Fast','Fast']}]));
});
test('required supplemental responses are enforced and unknown answers rejected',()=>{
 assert.throws(()=>s.validateSurveyAnswers(questions,{q_speed:'Fast'}));
 assert.throws(()=>s.validateSurveyAnswers(questions,{q_rating:6,q_speed:'Fast'}));
 assert.throws(()=>s.validateSurveyAnswers(questions,{q_rating:3,q_speed:'Fast',unexpected:'yes'}));
 assert.throws(()=>s.validateSurveyAnswers(questions,{q_rating:4,q_speed:'Fast',q_services:['Unknown']}));
 assert.throws(()=>s.validateSurveyAnswers(questions,{q_rating:4,q_speed:'Fast',q_notes:'a'.repeat(2001)}));
});
test('historic one-number NPS and CSAT scoring is unchanged',()=>{
 assert.equal(s.validateSurveyScore('NPS',10),10);
 assert.equal(s.validateSurveyScore('CSAT',5),5);
 assert.equal(s.scoreSummary('NPS',[10,9,4]).score,33);
 assert.equal(s.scoreSummary('CSAT',[5,4,1]).score,67);
});
