export const QUESTION_TYPES=['RATING','TEXT','SINGLE','MULTI','YES_NO'] as const;
export type QuestionType=typeof QUESTION_TYPES[number];
export type SurveyMetric='NPS'|'CSAT'|'NONE';
export type SurveyQuestion={id:string;label:string;type:QuestionType;required:boolean;min?:number;max?:number;options?:string[];metric?:SurveyMetric;help?:string};

const clean=(v:unknown,max:number)=>String(v??'').trim().slice(0,max);
export function standardQuestionnaire(type:'NPS'|'CSAT',question:string):SurveyQuestion[]{
 return [{id:'score',label:question,type:'RATING',required:true,min:type==='NPS'?0:0,max:type==='NPS'?10:5,metric:type}];
}
export function validateQuestionnaire(raw:unknown):SurveyQuestion[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>30)throw Error('A questionnaire must contain 1–30 questions.');
 const seen=new Set<string>(),out:SurveyQuestion[]=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Each survey question must be an object.');
  const q=item as Record<string,unknown>,id=clean(q.id,50),label=clean(q.label,300),type=clean(q.type,20) as QuestionType;
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(id)||seen.has(id))throw Error('Every question needs a unique identifier.');
  if(label.length<2||!QUESTION_TYPES.includes(type))throw Error('Every question needs a label and supported type.');
  seen.add(id);
  const question:SurveyQuestion={id,label,type,required:Boolean(q.required),metric:['NPS','CSAT','NONE'].includes(String(q.metric))?String(q.metric) as SurveyMetric:'NONE'};
  const help=clean(q.help,500);if(help)question.help=help;
  if(type==='RATING'){
   const min=Number(q.min??1),max=Number(q.max??5);
   if(!Number.isInteger(min)||!Number.isInteger(max)||min<0||max>10||min>=max)throw Error('Rating scales must use whole numbers between 0 and 10.');
   question.min=min;question.max=max;
  }
  if(type==='SINGLE'||type==='MULTI'){
   if(!Array.isArray(q.options)||q.options.length<2||q.options.length>20)throw Error('Choice questions need 2–20 options.');
   const options=q.options.map(v=>clean(v,120)).filter(Boolean);
   if(options.length!==q.options.length||new Set(options).size!==options.length)throw Error('Choice options must be unique non-empty text.');
   question.options=options;
  }
  out.push(question);
 }
 if(out.filter(q=>q.metric==='NPS').length>1||out.filter(q=>q.metric==='CSAT').length>1)throw Error('Use at most one NPS and one CSAT metric question.');
 return out;
}
export function validateAnswers(questions:SurveyQuestion[],raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Survey answers are required.');
 const input=raw as Record<string,unknown>,answers:Record<string,unknown>={};let score:number|undefined,metric:SurveyMetric='NONE';
 for(const q of questions){
  const value=input[q.id],missing=value===undefined||value===null||value===''||(Array.isArray(value)&&value.length===0);
  if(missing){if(q.required)throw Error('Please answer: '+q.label);continue;}
  if(q.type==='RATING'){
   const n=Number(value);if(!Number.isInteger(n)||n<(q.min??0)||n>(q.max??10))throw Error('Invalid rating for: '+q.label);answers[q.id]=n;
   if(q.metric&&q.metric!=='NONE'){score=n;metric=q.metric;}
  }else if(q.type==='TEXT'){
   if(typeof value!=='string'||value.length>4000)throw Error('Text answer is too long for: '+q.label);answers[q.id]=value.trim();
  }else if(q.type==='YES_NO'){
   if(value!==true&&value!==false&&value!=='YES'&&value!=='NO')throw Error('Choose Yes or No for: '+q.label);answers[q.id]=value===true||value==='YES';
  }else if(q.type==='SINGLE'){
   if(typeof value!=='string'||!q.options?.includes(value))throw Error('Choose a valid option for: '+q.label);answers[q.id]=value;
  }else{
   if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!q.options?.includes(v))||new Set(value).size!==value.length)throw Error('Choose valid options for: '+q.label);answers[q.id]=value;
  }
 }
 return {answers,score,metric};
}
