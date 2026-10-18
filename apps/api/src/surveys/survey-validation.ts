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
