/** Pure, provider-independent validation that can be tested without a database. */
export const SURVEY_TYPES = ['NPS','CSAT'] as const;
export type SurveyType = typeof SURVEY_TYPES[number];
export function validateSurveyScore(type:SurveyType,score:unknown){
  const max=type==='NPS'?10:5;
  if(typeof score!=='number'||!Number.isInteger(score)||score<0||score>max)throw Error(`A ${type} response must be an integer from 0 to ${max}.`);
  return score;
}
export function surveyClassification(type:SurveyType, score:number){
  validateSurveyScore(type,score);
  return type==='NPS'?(score>=9?'PROMOTER':score>=7?'PASSIVE':'DETRACTOR'):(score>=4?'SATISFIED':score===3?'NEUTRAL':'DISSATISFIED');
}
export function scoreSummary(type:SurveyType, scores:number[]){
  scores.forEach(s=>validateSurveyScore(type,s));
  if(!scores.length)return {responses:0,score:null};
  if(type==='NPS')return {responses:scores.length,score:Math.round(100*(scores.filter(s=>s>=9).length-scores.filter(s=>s<=6).length)/scores.length)};
  return {responses:scores.length,score:Math.round(100*scores.filter(s=>s>=4).length/scores.length)};
}

/** Supplementary customer questions are independently validated and never affect NPS/CSAT calculations. */
export type QuestionKind='RATING_5'|'TEXT'|'SINGLE_CHOICE'|'MULTIPLE_CHOICE';
export type SurveyQuestion={id:string;label:string;kind:QuestionKind;required:boolean;options?:string[]};
export function validateQuestionnaire(raw:unknown):SurveyQuestion[]{
 if(raw===undefined||raw===null)return [];
 if(!Array.isArray(raw)||raw.length>15)throw Error('Provide at most 15 questionnaire items.');
 const seen=new Set<string>();
 return raw.map(q=>{
   if(!q||typeof q!=='object'||Array.isArray(q))throw Error('Question must be an object.');
   if(typeof q.id!=='string'||!/^q_[a-z][a-z0-9_]{1,30}$/.test(q.id)||seen.has(q.id))throw Error('Question IDs must be unique and start with q_.');
   if(typeof q.label!=='string'||q.label.trim().length<5||q.label.length>240)throw Error('Each question requires a descriptive label.');
   if(!['RATING_5','TEXT','SINGLE_CHOICE','MULTIPLE_CHOICE'].includes(q.kind)||typeof q.required!=='boolean')throw Error('Invalid question type or required flag.');
   seen.add(q.id);
   if(['SINGLE_CHOICE','MULTIPLE_CHOICE'].includes(q.kind)){
     if(!Array.isArray(q.options)||q.options.length<2||q.options.length>10||q.options.some((v:unknown)=>typeof v!=='string'||!v.trim()||v.length>100)||new Set(q.options).size!==q.options.length)throw Error('Choice questions require 2–10 distinct, nonempty options.');
   }else if(q.options!==undefined)throw Error('Only choice questions support options.');
   return {id:q.id,label:q.label.trim(),kind:q.kind,required:q.required,...(q.options?{options:q.options}:{})};
 });
}
export function validateSurveyAnswers(questions:SurveyQuestion[],raw:unknown):Record<string,string|number|string[]>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Questionnaire answers must be an object.');
 const data=raw as Record<string,unknown>,answered:Record<string,string|number|string[]>={};
 const known=new Set(questions.map(q=>q.id));
 if(Object.keys(data).some(key=>!known.has(key)))throw Error('Unexpected questionnaire response.');
 for(const q of questions){
   const value=data[q.id];
   if(value===undefined||value===null||value===''){
     if(q.required)throw Error('Required questionnaire response missing: '+q.label);
     continue;
   }
   if(q.kind==='RATING_5'){
     if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>5)throw Error('A rating must be an integer between 1 and 5.');
     answered[q.id]=value;
   }else if(q.kind==='TEXT'){
     if(typeof value!=='string'||value.length>2000||q.required&&!value.trim())throw Error('Text response must be under 2000 characters.');
     answered[q.id]=value.trim();
   }else if(q.kind==='SINGLE_CHOICE'){
     if(typeof value!=='string'||!q.options?.includes(value))throw Error('Choice response does not match permitted options.');
     answered[q.id]=value;
   }else if(q.kind==='MULTIPLE_CHOICE'){
     if(!Array.isArray(value)||value.length>10||value.some((x:unknown)=>typeof x!=='string'||!q.options?.includes(x))||new Set(value).size!==value.length||q.required&&!value.length)throw Error('Invalid multiple-choice response.');
     answered[q.id]=value;
   }
 }
 return answered;
}
