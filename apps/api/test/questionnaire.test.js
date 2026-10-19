const test=require('node:test');const assert=require('node:assert/strict');
const ts=require('typescript'),Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
function load(file){const filename=path.resolve(__dirname,'../src',file);const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(js,filename);return mod.exports;}
const {validateQuestionnaire,validateAnswers,standardQuestionnaire}=load('surveys/questionnaire.ts');
test('custom questionnaire accepts rating text choice and yes/no answers',()=>{const q=validateQuestionnaire([
 {id:'rating',label:'Overall rating',type:'RATING',required:true,min:1,max:5},
 {id:'why',label:'What worked well?',type:'TEXT',required:false},
 {id:'area',label:'Which area?',type:'SINGLE',required:true,options:['Quality','Speed']},
 {id:'recommend',label:'Would you work with us again?',type:'YES_NO',required:true}
]);const out=validateAnswers(q,{rating:5,why:'Good work',area:'Quality',recommend:true});assert.equal(out.answers.rating,5);assert.equal(out.metric,'NONE');});
test('NPS and CSAT standard templates expose metric ratings',()=>{const nps=standardQuestionnaire('NPS','Recommend?');const out=validateAnswers(nps,{score:10});assert.equal(out.score,10);assert.equal(out.metric,'NPS');});
test('questionnaire rejects duplicate ids and invalid options',()=>{assert.throws(()=>validateQuestionnaire([{id:'x',label:'One',type:'TEXT'},{id:'x',label:'Two',type:'TEXT'}]));assert.throws(()=>validateQuestionnaire([{id:'choice',label:'Choice',type:'SINGLE',options:['A','A']}]))});
