'use client';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {BarChart3,Check,ClipboardList,Plus,Send,Trash2} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,patch,request,fmtDate} from '@/lib/api';

type Question={id:string;label:string;type:'RATING'|'TEXT'|'SINGLE'|'MULTI'|'YES_NO';required:boolean;min?:number;max?:number;options?:string[];metric?:'NPS'|'CSAT'|'NONE'};
type Template={id:string;name:string;description?:string|null;type:string;questions:Question[];active:boolean};
type Survey={id:string;title:string;type:string;recipientEmail:string;status:string;score:number|null;feedback:string|null;answers:Record<string,unknown>|null;createdAt:string;respondedAt:string|null;templateId:string|null};
type Data={entries:Survey[];aggregates:{nps:{responses:number;score:number|null};csat:{responses:number;score:number|null};customResponses:number}};
export function TenantClientSurveys({orgId,accountId,canAdmin}:{orgId:string;accountId:string;canAdmin:boolean}){
 const [templates,setTemplates]=useState<Template[]>([]),[data,setData]=useState<Data|null>(null),[email,setEmail]=useState(''),[selected,setSelected]=useState('builtin-nps'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState('');
 const [builderOpen,setBuilderOpen]=useState(false),[templateName,setTemplateName]=useState(''),[templateDescription,setTemplateDescription]=useState(''),[questions,setQuestions]=useState<Question[]>([{id:'overall_rating',label:'How would you rate your overall experience?',type:'RATING',required:true,min:1,max:5,metric:'NONE'}]);
 async function load(){
  const [t,s]=await Promise.all([request<{builtIns:Template[];custom:Template[]}>(`/workspace-surveys/${orgId}/templates`),request<Data>(`/workspace-surveys/${orgId}/clients/${accountId}`)]);
  setTemplates([...t.builtIns,...t.custom]);setData(s);
 }
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load surveys.'))},[orgId,accountId]);
 const activeTemplates=useMemo(()=>templates.filter(t=>t.active),[templates]);
 async function send(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');setPreview('');
  try{const body=selected.startsWith('builtin-')?{email,type:selected==='builtin-csat'?'CSAT':'NPS'}:{email,templateId:selected};const out=await post<{notice:string;previewUrl?:string}>(`/workspace-surveys/${orgId}/clients/${accountId}`,body);setNotice(out.notice);setPreview(out.previewUrl||'');setEmail('');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to create survey.')}finally{setBusy(false)}
 }
 function updateQuestion(index:number,patchData:Partial<Question>){setQuestions(prev=>prev.map((q,i)=>i===index?{...q,...patchData}:q))}
 function addQuestion(){setQuestions(prev=>[...prev,{id:'question_'+(prev.length+1),label:'',type:'TEXT',required:false,metric:'NONE'}])}
 async function saveTemplate(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');
  try{const out=await post<Template>(`/workspace-surveys/${orgId}/templates`,{name:templateName,description:templateDescription,questions});setNotice('Questionnaire template created.');setTemplateName('');setTemplateDescription('');setQuestions([{id:'overall_rating',label:'How would you rate your overall experience?',type:'RATING',required:true,min:1,max:5,metric:'NONE'}]);setBuilderOpen(false);await load();setSelected(out.id);}catch(e){setError(e instanceof Error?e.message:'Unable to save questionnaire.')}finally{setBusy(false)}
 }
 return <section className="tenant-survey-stack">
  <div className="survey-summary-grid"><div><span>NPS</span><strong>{data?.aggregates.nps.score??'—'}</strong><small>{data?.aggregates.nps.responses||0} responses</small></div><div><span>CSAT</span><strong>{data?.aggregates.csat.score==null?'—':data.aggregates.csat.score+'%'}</strong><small>{data?.aggregates.csat.responses||0} responses</small></div><div><span>Custom questionnaires</span><strong>{data?.aggregates.customResponses||0}</strong><small>completed responses</small></div></div>
  <Panel title="Send satisfaction survey" actions={<BarChart3 size={18}/>}>
   <p className="muted small-text">Use the built-in NPS/CSAT surveys or a reusable questionnaire with ratings, text, multiple choice and Yes/No questions.</p>
   <form className="stack-16" onSubmit={send}><div className="field-grid"><Field label="Recipient email"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="contact@client.com"/></Field><Field label="Questionnaire"><BrandSelect value={selected} onValueChange={setSelected} ariaLabel="Questionnaire template">{activeTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</BrandSelect></Field></div><Button type="submit" loading={busy}><Send size={16}/> Send survey</Button></form>
   <ErrorMessage message={error}/>{notice&&<div className="success-banner"><Check size={16}/>{notice}</div>}{preview&&<a className="text-link" href={preview} target="_blank" rel="noreferrer">Open private preview questionnaire</a>}
  </Panel>
  {canAdmin&&<Panel title="Questionnaire templates" actions={<Button variant="secondary" type="button" onClick={()=>setBuilderOpen(v=>!v)}><Plus size={15}/>{builderOpen?'Close builder':'New questionnaire'}</Button>}>
   {builderOpen&&<form className="survey-template-builder" onSubmit={saveTemplate}><div className="field-grid"><Field label="Template name"><input required minLength={2} maxLength={120} value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Quarterly service review"/></Field><Field label="Description (optional)"><input maxLength={1000} value={templateDescription} onChange={e=>setTemplateDescription(e.target.value)} placeholder="What this survey measures"/></Field></div>
    <div className="survey-builder-list">{questions.map((q,index)=><div className="survey-builder-question" key={index}><div className="survey-builder-head"><strong>Question {index+1}</strong>{questions.length>1&&<button type="button" className="icon-button" aria-label={'Remove question '+(index+1)} onClick={()=>setQuestions(prev=>prev.filter((_,i)=>i!==index))}><Trash2 size={15}/></button>}</div>
     <div className="field-grid"><Field label="Question"><input required value={q.label} onChange={e=>updateQuestion(index,{label:e.target.value})} placeholder="Ask the client something specific"/></Field><Field label="Answer type"><BrandSelect value={q.type} onValueChange={v=>updateQuestion(index,{type:v as Question['type'],...(v==='RATING'?{min:1,max:5}:{}),...(v==='SINGLE'||v==='MULTI'?{options:['Option 1','Option 2']}: {})})} ariaLabel={'Question '+(index+1)+' answer type'}><option value="RATING">Rating scale</option><option value="TEXT">Written response</option><option value="SINGLE">Single choice</option><option value="MULTI">Multiple choice</option><option value="YES_NO">Yes / No</option></BrandSelect></Field></div>
     {q.type==='RATING'&&<div className="field-grid"><Field label="Minimum rating"><input type="number" min={0} max={9} value={q.min??1} onChange={e=>updateQuestion(index,{min:Number(e.target.value)})}/></Field><Field label="Maximum rating"><input type="number" min={1} max={10} value={q.max??5} onChange={e=>updateQuestion(index,{max:Number(e.target.value)})}/></Field></div>}
     {(q.type==='SINGLE'||q.type==='MULTI')&&<Field label="Options (comma separated)"><input value={(q.options||[]).join(', ')} onChange={e=>updateQuestion(index,{options:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)})} placeholder="Excellent, Good, Fair, Poor"/></Field>}
     <label className="checkbox-line"><input type="checkbox" checked={q.required} onChange={e=>updateQuestion(index,{required:e.target.checked})}/>Required question</label>
    </div>)}</div>
    <div className="ws-nav-buttons"><Button variant="secondary" type="button" onClick={addQuestion}><Plus size={15}/> Add question</Button><Button type="submit" loading={busy}><ClipboardList size={15}/> Save questionnaire</Button></div>
   </form>}
   {!builderOpen&&<div className="stack-16">{templates.filter(t=>!t.id.startsWith('builtin-')).map(t=><div className="record-row" key={t.id}><div><strong>{t.name}</strong><p>{t.questions.length} questions · {t.description||'No description'}</p></div><div className="ws-nav-buttons"><Badge tone={t.active?'green':'neutral'}>{t.active?'Active':'Archived'}</Badge><Button variant="secondary" type="button" onClick={async()=>{await patch(`/workspace-surveys/${orgId}/templates/${t.id}`,{active:!t.active});await load();}}>{t.active?'Archive':'Restore'}</Button></div></div>)}{templates.filter(t=>!t.id.startsWith('builtin-')).length===0&&<p className="muted small-text">No custom questionnaires yet. Built-in NPS and CSAT are already available.</p>}</div>}
  </Panel>}
  <Panel title="Survey history">{data?.entries.length?<div className="stack-16">{data.entries.map(item=><div className="record-row" key={item.id}><div><strong>{item.title}</strong><p>{item.recipientEmail} · {fmtDate(item.createdAt)}</p>{item.feedback&&<small>{item.feedback}</small>}</div><div><Badge>{item.status}</Badge>{item.score!==null&&<p className="survey-history-score">{item.score}</p>}</div></div>)}</div>:<p className="muted small-text">No satisfaction surveys have been sent to this client yet.</p>}</Panel>
 </section>;
}
