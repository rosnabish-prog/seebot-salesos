'use client';
import {useParams} from 'next/navigation';
import {useEffect,useState,FormEvent} from 'react';
import Image from 'next/image';
import {Check,MessageSquareText,Star} from 'lucide-react';
import {post,request} from '@/lib/api';
import {Button,ErrorMessage,Field} from '@/components/ui';

type Question={id:string;label:string;type:'RATING'|'TEXT'|'SINGLE'|'MULTI'|'YES_NO';required:boolean;min?:number;max?:number;options?:string[];help?:string};
type Invitation={company:string;title:string;question:string;questionnaire:Question[];type:'NPS'|'CSAT'|'CUSTOM';status:string;isDemo:boolean};
export default function ExternalSurvey(){
 const token=String(useParams().token||'');
 const [info,setInfo]=useState<Invitation|null>(null),[answers,setAnswers]=useState<Record<string,unknown>>({}),[feedback,setFeedback]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false);
 useEffect(()=>{request<Invitation>(`/surveys/${encodeURIComponent(token)}`).then(setInfo).catch(e=>setError(e.message))},[token]);
 function set(id:string,value:unknown){setAnswers(prev=>({...prev,[id]:value}));}
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await post(`/surveys/${encodeURIComponent(token)}/respond`,{answers,feedback});setSent(true)}catch(e){setError(e instanceof Error?e.message:'Could not submit feedback.')}finally{setBusy(false)}}
 function question(q:Question){
  if(q.type==='RATING'){const min=q.min??1,max=q.max??5;return <div className="survey-rating" role="group" aria-label={q.label}>{Array.from({length:max-min+1},(_,i)=>min+i).map(value=><button type="button" key={value} className={answers[q.id]===value?'selected':''} aria-pressed={answers[q.id]===value} onClick={()=>set(q.id,value)}>{value}</button>)}</div>}
  if(q.type==='TEXT')return <textarea rows={4} maxLength={4000} value={String(answers[q.id]??'')} onChange={e=>set(q.id,e.target.value)} placeholder="Share your feedback"/>;
  if(q.type==='YES_NO')return <div className="survey-choice-row"><button type="button" className={answers[q.id]===true?'selected':''} onClick={()=>set(q.id,true)}>Yes</button><button type="button" className={answers[q.id]===false?'selected':''} onClick={()=>set(q.id,false)}>No</button></div>;
  if(q.type==='SINGLE')return <div className="survey-options">{(q.options||[]).map(option=><label key={option}><input type="radio" name={q.id} checked={answers[q.id]===option} onChange={()=>set(q.id,option)}/><span>{option}</span></label>)}</div>;
  const selected=Array.isArray(answers[q.id])?answers[q.id] as string[]:[];
  return <div className="survey-options">{(q.options||[]).map(option=><label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={e=>set(q.id,e.target.checked?[...selected,option]:selected.filter(v=>v!==option))}/><span>{option}</span></label>)}</div>;
 }
 return <main className="survey-public"><section className="survey-public-card">
  <header className="survey-public-brand"><Image src="/seebot-logo.png" width={1174} height={328} alt="Seebot" className="official-wordmark"/><span>CLIENT FEEDBACK</span></header>
  {sent?<div className="survey-success"><span><Check size={24}/></span><h1>Thank you for your feedback.</h1><p>Your response has been recorded for {info?.company||'the team'}.</p></div>
  :error&&!info?<ErrorMessage message={error}/>
  :info?<><div className="survey-public-heading"><span className="survey-icon"><MessageSquareText size={20}/></span><div><small>{info.company}{info.isDemo?' · DEMO ONLY':''}</small><h1>{info.title}</h1><p>Your answers are shared with the company team responsible for this client relationship.</p></div></div>
   {info.status==='ANSWERED'?<div className="soft-callout">This questionnaire has already been completed.</div>
   :<form onSubmit={submit} className="survey-questionnaire">{(info.questionnaire||[]).map((q,index)=><div className="survey-question" key={q.id}><div className="survey-question-number">{String(index+1).padStart(2,'0')}</div><Field label={q.label+(q.required?' *':'')}>{q.help&&<small className="survey-question-help">{q.help}</small>}{question(q)}</Field></div>)}
    <Field label="Anything else you'd like us to know? (optional)"><textarea rows={3} maxLength={4000} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Additional context or suggestions"/></Field>
    <ErrorMessage message={error}/><Button type="submit" loading={busy} className="full-width"><Star size={16}/> Submit feedback</Button></form>}
  </>:<p>Loading questionnaire…</p>}
 </section></main>;
}
