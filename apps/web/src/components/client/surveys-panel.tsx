'use client';
import { useEffect,useState,FormEvent } from 'react';
import { Button,Badge,ErrorMessage } from '@/components/ui';
import { request,post,fmtDate } from '@/lib/api';
type Survey={id:string;title:string;type:'NPS'|'CSAT';recipientEmail:string;score:number|null;feedback:string|null;status:string;createdAt:string;respondedAt:string|null;isDemo:boolean};
type Summary={entries:Survey[];aggregates:{nps:{responses:number;score:number|null};csat:{responses:number;score:number|null}}};
export function ClientSurveysPanel({accountId,editable,isDemo}:{accountId:string;editable:boolean;isDemo:boolean}){
 const [data,setData]=useState<Summary|null>(null),[email,setEmail]=useState(''),[kind,setKind]=useState<'NPS'|'CSAT'>('NPS'),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[previewUrl,setPreviewUrl]=useState('');
 const load=()=>request<Summary>(`/clients/${accountId}/surveys`).then(setData).catch(e=>setError(e.message));
 useEffect(()=>{void load()},[accountId]);
 async function send(e:FormEvent){e.preventDefault();setPending(true);setError('');setNotice('');setPreviewUrl('');try{const result=await post<{notice:string;previewUrl?:string}>(`/clients/${accountId}/surveys`,{email,type:kind});setNotice(result.notice);if(result.previewUrl)setPreviewUrl(result.previewUrl);await load();}catch(err:any){setError(err.message)}finally{setPending(false)}}
 const summaries=data?.aggregates;
 return <section className="panel" style={{padding:24}} aria-label="Client satisfaction surveys">
  <header className="panel-head"><h3>Client Satisfaction Surveys</h3><Badge>{isDemo?'DEMO':'Client feedback'}</Badge></header>
  <p className="muted small-text">NPS is calculated as % promoters (9–10) minus % detractors (0–6). CSAT is the percentage scoring 4 or 5 out of 5. Feedback stays attached to this client.</p>
  {summaries&&<div className="field-grid"><div className="soft-callout"><strong>NPS: {summaries.nps.score??'—'}</strong><p>{summaries.nps.responses} responses</p></div><div className="soft-callout"><strong>CSAT: {summaries.csat.score==null?'—':`${summaries.csat.score}%`}</strong><p>{summaries.csat.responses} responses</p></div></div>}
  {editable&&<form onSubmit={send} className="stack-16"><div className="field-grid"><label>Recipient email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="contact@client.com"/></label><label>Survey type<select value={kind} onChange={e=>setKind(e.target.value as any)}><option value="NPS">NPS · 0–10</option><option value="CSAT">CSAT · 0–5</option></select></label></div><Button type="submit" loading={pending}>{isDemo?'Create fictional survey':'Send survey invitation'}</Button></form>}
  <ErrorMessage message={error}/>{notice&&<p role="status" className="soft-callout">{notice}</p>}{previewUrl&&<p><a href={previewUrl} target="_blank" rel="noopener noreferrer">Open fictional survey form</a></p>}
  <div className="stack-16" style={{marginTop:16}}>{data?.entries.map(item=><div key={item.id} className="record-row" style={{alignItems:'start'}}><div style={{flex:1}}><strong>{item.title}</strong><p>{item.recipientEmail} · {fmtDate(item.createdAt)}</p>{item.feedback&&<p>{item.feedback}</p>}</div><div><Badge>{item.status}</Badge>{item.score!==null&&<p style={{textAlign:'right'}}>{item.score}/{item.type==='NPS'?10:5}</p>}</div></div>)}{data?.entries.length===0&&<p className="muted small-text">No survey invitations yet.</p>}</div>
 </section>;
}
