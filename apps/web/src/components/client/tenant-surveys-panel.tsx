'use client';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {BarChart3,Check,Send} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,request,fmtDate} from '@/lib/api';

type Question={id:string;label:string;type:'RATING'|'TEXT'|'SINGLE'|'MULTI'|'YES_NO';required:boolean;min?:number;max?:number;options?:string[];metric?:'NPS'|'CSAT'|'NONE'};
type Template={id:string;name:string;description?:string|null;type:string;questions:Question[];active:boolean};
type Survey={id:string;title:string;type:string;recipientEmail:string;status:string;score:number|null;feedback:string|null;answers:Record<string,unknown>|null;questionnaire:Question[];createdAt:string;respondedAt:string|null;templateId:string|null};
type Data={entries:Survey[];aggregates:{nps:{responses:number;score:number|null};csat:{responses:number;score:number|null};customResponses:number}};
export function TenantClientSurveys({orgId,accountId}:{orgId:string;accountId:string;canAdmin?:boolean}){
 const [templates,setTemplates]=useState<Template[]>([]),[data,setData]=useState<Data|null>(null),[email,setEmail]=useState(''),[selected,setSelected]=useState('builtin-nps'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState('');
 async function load(){
  const [t,s]=await Promise.all([request<{builtIns:Template[];custom:Template[]}>(`/workspace-surveys/${orgId}/templates`),request<Data>(`/workspace-surveys/${orgId}/clients/${accountId}`)]);
  setTemplates([...t.builtIns,...t.custom]);setData(s);
 }
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load surveys.'))},[orgId,accountId]);
 const activeTemplates=useMemo(()=>templates.filter(t=>t.active),[templates]);
 async function send(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');setPreview('');
  try{const body=selected.startsWith('builtin-')?{email,type:selected==='builtin-csat'?'CSAT':'NPS'}:{email,templateId:selected};const out=await post<{notice:string;previewUrl?:string}>(`/workspace-surveys/${orgId}/clients/${accountId}`,body);setNotice(out.notice);setPreview(out.previewUrl||'');setEmail('');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to create survey.')}finally{setBusy(false)}
 }
 return <section className="tenant-survey-stack">
  <div className="survey-summary-grid"><div><span>NPS</span><strong>{data?.aggregates.nps.score??'—'}</strong><small>{data?.aggregates.nps.responses||0} responses</small></div><div><span>CSAT</span><strong>{data?.aggregates.csat.score==null?'—':data.aggregates.csat.score+'%'}</strong><small>{data?.aggregates.csat.responses||0} responses</small></div><div><span>Questionnaires</span><strong>{data?.aggregates.customResponses||0}</strong><small>custom responses</small></div></div>
  <Panel title="Send satisfaction survey" actions={<BarChart3 size={18}/>}>
   <p className="muted small-text">Choose built-in NPS/CSAT or a questionnaire managed centrally under Client Satisfaction.</p>
   <form className="stack-16" onSubmit={send}><div className="field-grid"><Field label="Recipient email"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="contact@client.com"/></Field><Field label="Questionnaire"><BrandSelect value={selected} onValueChange={setSelected} ariaLabel="Questionnaire template">{activeTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</BrandSelect></Field></div><Button type="submit" loading={busy}><Send size={16}/> Send survey</Button></form>
   <ErrorMessage message={error}/>{notice&&<div className="success-banner"><Check size={16}/>{notice}</div>}{preview&&<a className="text-link" href={preview} target="_blank" rel="noreferrer">Open private preview questionnaire</a>}
  </Panel>
  <Panel title="Survey history">{data?.entries.length?<div className="stack-16">{data.entries.map(item=><details className="survey-history-item" key={item.id}><summary className="record-row"><div><strong>{item.title}</strong><p>{item.recipientEmail} · {fmtDate(item.createdAt)}</p>{item.feedback&&<small>{item.feedback}</small>}</div><div><Badge tone={item.status==='ANSWERED'?'green':'neutral'}>{item.status}</Badge>{item.score!==null&&<p className="survey-history-score">{item.score}</p>}</div></summary>{item.status==='ANSWERED'&&item.answers&&<div className="survey-answer-grid">{(item.questionnaire||[]).map(q=><div key={q.id}><span>{q.label}</span><strong>{Array.isArray(item.answers?.[q.id])?(item.answers?.[q.id] as string[]).join(', '):typeof item.answers?.[q.id]==='boolean'?(item.answers?.[q.id]?'Yes':'No'):String(item.answers?.[q.id]??'—')}</strong></div>)}</div>}</details>)}</div>:<p className="muted small-text">No satisfaction surveys have been sent to this client yet.</p>}</Panel>
 </section>;
}
