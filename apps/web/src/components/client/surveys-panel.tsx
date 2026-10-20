'use client';
import {useEffect,useState,FormEvent} from 'react';
import {Button,Badge,ErrorMessage,Field,BrandSelect} from '@/components/ui';
import {request,post,fmtDate} from '@/lib/api';
import {Plus,Trash2} from 'lucide-react';
type Question={id:string;label:string;kind:'RATING_5'|'TEXT'|'SINGLE_CHOICE'|'MULTIPLE_CHOICE';required:boolean;options?:string[]};
type Survey={id:string;title:string;type:'NPS'|'CSAT';recipientEmail:string;score:number|null;feedback:string|null;questions:Question[];answers:Record<string,string|number|string[]>;status:string;createdAt:string;respondedAt:string|null;isDemo:boolean};
type Summary={entries:Survey[];aggregates:{nps:{responses:number;score:number|null};csat:{responses:number;score:number|null}}};
export function ClientSurveysPanel({accountId,editable,isDemo}:{accountId:string;editable:boolean;isDemo:boolean}){
 const[data,setData]=useState<Summary|null>(null),[email,setEmail]=useState(''),[kind,setKind]=useState<'NPS'|'CSAT'>('NPS'),[title,setTitle]=useState(''),[question,setQuestion]=useState(''),[questions,setQuestions]=useState<Question[]>([]),[draft,setDraft]=useState({label:'',kind:'RATING_5' as Question['kind'],required:true,options:''}),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[previewUrl,setPreviewUrl]=useState('');
 const load=()=>request<Summary>(`/clients/${accountId}/surveys`).then(setData).catch(e=>setError(e.message));
 useEffect(()=>{void load()},[accountId]);
 function addQuestion(){
   setError('');
   const label=draft.label.trim(),choices=draft.options.split(',').map(x=>x.trim()).filter(Boolean);
   if(label.length<5){setError('Write a descriptive question.');return;}
   if(questions.length>=15){setError('Maximum 15 additional questions.');return;}
   if(['SINGLE_CHOICE','MULTIPLE_CHOICE'].includes(draft.kind)&&(choices.length<2||choices.length>10)){setError('Choice questions need 2–10 options.');return;}
   const slug=(label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,20)||'feedback');
   const id='q_'+slug+'_'+(questions.length+1);
   setQuestions(old=>[...old,{id,label,kind:draft.kind,required:draft.required,...(['SINGLE_CHOICE','MULTIPLE_CHOICE'].includes(draft.kind)?{options:choices}:{})}]);
   setDraft({label:'',kind:'RATING_5',required:true,options:''});
 }
 async function send(e:FormEvent){e.preventDefault();setPending(true);setError('');setNotice('');setPreviewUrl('');
   try{const result=await post<{notice:string;previewUrl?:string}>(`/clients/${accountId}/surveys`,{email,type:kind,title:title.trim()||undefined,question:question.trim()||undefined,questions});setNotice(result.notice);if(result.previewUrl)setPreviewUrl(result.previewUrl);setQuestions([]);setEmail('');setTitle('');setQuestion('');await load();}catch(err:any){setError(err.message)}finally{setPending(false)}
 }
 const summaries=data?.aggregates;
 return <section className="panel" style={{padding:24}} aria-label="Client satisfaction surveys">
  <header className="panel-head"><h3>Client Satisfaction Surveys</h3><Badge>{isDemo?'DEMO':'Client feedback'}</Badge></header>
  <p className="muted small-text">Create recipient-specific NPS/CSAT surveys with optional ratings and questionnaires. NPS uses promoters (9–10) minus detractors (0–6); CSAT counts 4–5 responses. Supplemental ratings are analyzed separately.</p>
  {summaries&&<div className="field-grid"><div className="soft-callout"><strong>NPS: {summaries.nps.score??'—'}</strong><p>{summaries.nps.responses} responses</p></div><div className="soft-callout"><strong>CSAT: {summaries.csat.score==null?'—':`${summaries.csat.score}%`}</strong><p>{summaries.csat.responses} responses</p></div></div>}
  {editable&&<form onSubmit={send} className="stack-16"><div className="field-grid">
    <Field label="Recipient email"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="contact@client.com"/></Field>
    <Field label="Survey type"><BrandSelect value={kind} onValueChange={v=>setKind(v as 'NPS'|'CSAT')}><option value="NPS">NPS · 0–10</option><option value="CSAT">CSAT · 0–5</option></BrandSelect></Field>
    <Field label="Survey title (optional)"><input value={title} maxLength={180} onChange={e=>setTitle(e.target.value)} placeholder="Quarterly service satisfaction"/></Field>
    <Field label="Main rating question (optional)"><input value={question} maxLength={700} onChange={e=>setQuestion(e.target.value)} placeholder="How satisfied were you?"/></Field>
  </div>
  <div className="panel" style={{margin:0,padding:16}}><h3>Additional questionnaire ({questions.length}/15)</h3>
   {questions.map(q=><div key={q.id} className="record-row"><div style={{flex:1}}><strong>{q.label}</strong><p>{q.kind.replaceAll('_',' ')} · {q.required?'Required':'Optional'}{q.options?.length?` · ${q.options.join(', ')}`:''}</p></div><Button type="button" variant="secondary" onClick={()=>setQuestions(items=>items.filter(x=>x.id!==q.id))}><Trash2 size={14}/>Remove</Button></div>)}
   <div className="field-grid">
    <Field label="Additional question"><input value={draft.label} onChange={e=>setDraft(p=>({...p,label:e.target.value}))} placeholder="Rate the quality of our deliverables"/></Field>
    <Field label="Answer type"><BrandSelect value={draft.kind} onValueChange={v=>setDraft(p=>({...p,kind:v as Question['kind']}))}>{['RATING_5','TEXT','SINGLE_CHOICE','MULTIPLE_CHOICE'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</BrandSelect></Field>
   </div>
   {['SINGLE_CHOICE','MULTIPLE_CHOICE'].includes(draft.kind)&&<Field label="Choices separated by commas"><input value={draft.options} onChange={e=>setDraft(p=>({...p,options:e.target.value}))} placeholder="Excellent, Good, Fair, Poor"/></Field>}
   <label className="checkbox-line"><input type="checkbox" checked={draft.required} onChange={e=>setDraft(p=>({...p,required:e.target.checked}))}/>Required question</label>
   <div><Button type="button" variant="secondary" onClick={addQuestion}><Plus size={14}/>Add question</Button></div>
  </div><Button type="submit" loading={pending}>{isDemo?'Create fictional survey':'Send survey invitation'}</Button></form>}
  <ErrorMessage message={error}/>{notice&&<p role="status" className="soft-callout">{notice}</p>}{previewUrl&&<p><a href={previewUrl} target="_blank" rel="noopener noreferrer">Open fictional survey form</a></p>}
  <div className="stack-16" style={{marginTop:16}}>{data?.entries.map(item=><div key={item.id} className="record-row" style={{alignItems:'start'}}><div style={{flex:1}}><strong>{item.title}</strong><p>{item.recipientEmail} · {fmtDate(item.createdAt)}</p>{item.feedback&&<p>{item.feedback}</p>}
    {item.status==='ANSWERED'&&item.questions?.map(q=><div key={q.id} className="small-text" style={{marginTop:7}}><strong>{q.label}</strong><p>{Array.isArray(item.answers?.[q.id])?(item.answers[q.id] as string[]).join(', '):String(item.answers?.[q.id]??'No response')}</p></div>)}
   </div><div><Badge>{item.status}</Badge>{item.score!==null&&<p style={{textAlign:'right'}}>{item.score}/{item.type==='NPS'?10:5}</p>}</div></div>)}{data?.entries.length===0&&<p className="muted small-text">No survey invitations yet.</p>}</div>
 </section>;
}
