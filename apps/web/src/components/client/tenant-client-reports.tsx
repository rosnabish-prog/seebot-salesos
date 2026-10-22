'use client';
import {FormEvent,useEffect,useState} from 'react';
import {Download,FileBarChart2,Plus} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {fmtDate,post,request} from '@/lib/api';

type Report={id:string;title:string;type:'MBR'|'QBR';periodStart:string;periodEnd:string;status:string;createdAt:string;approvedAt:string|null};
type Template={id:string;name:string;type:'MBR'|'QBR';sections:string[];active:boolean};
const today=new Date(),monthStart=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1));
const iso=(d:Date)=>d.toISOString().slice(0,10);
export function TenantClientReports({orgId,accountId,canAdmin}:{orgId:string;accountId:string;canAdmin:boolean}){
 const [reports,setReports]=useState<Report[]>([]),[templates,setTemplates]=useState<Template[]>([]),[type,setType]=useState<'MBR'|'QBR'>('MBR'),[start,setStart]=useState(iso(monthStart)),[end,setEnd]=useState(iso(today)),[templateId,setTemplateId]=useState(''),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){const [r,t]=await Promise.all([request<Report[]>(`/workspace-client-success/${orgId}/clients/${accountId}/reports`),request<Template[]>(`/workspace-client-success/${orgId}/templates`)]);setReports(r);setTemplates(t);}
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load business reviews.'))},[orgId,accountId]);
 const choices=templates.filter(t=>t.type===type);
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await post(`/workspace-client-success/${orgId}/clients/${accountId}/reports`,{type,periodStart:start,periodEnd:end,title:title||undefined,templateId:templateId||undefined});setTitle('');await load();setNotice(type+' snapshot created from the current recorded client data.');}catch(e){setError(e instanceof Error?e.message:'Unable to create report.')}finally{setBusy(false)}}
 async function approve(id:string){setBusy(true);setError('');try{await post(`/workspace-client-success/${orgId}/reports/${id}/approve`,{});await load();setNotice('Management approval recorded.');}catch(e){setError(e instanceof Error?e.message:'Unable to approve report.')}finally{setBusy(false)}}
 async function download(id:string){setError('');try{const base=process.env.NEXT_PUBLIC_API_URL||'';const res=await fetch(base+`/api/workspace-client-success/${orgId}/reports/${id}/pdf`,{credentials:'include',cache:'no-store'});if(!res.ok)throw Error('Report PDF unavailable.');const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download='client-review-'+id+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){setError(e instanceof Error?e.message:'Unable to download report.')}}
 return <Panel title="MBR / QBR business reviews" actions={<FileBarChart2 size={18}/>}>
  <p className="muted small-text">Generate a frozen review snapshot from recorded delivery, satisfaction, issues, contracts and finance. Review and approve before sharing externally.</p>
  <form className="stack-16" onSubmit={create}>
   <div className="field-grid"><Field label="Review type"><BrandSelect value={type} onValueChange={v=>{setType(v as 'MBR'|'QBR');setTemplateId('')}}><option value="MBR">Monthly Business Review</option><option value="QBR">Quarterly Business Review</option></BrandSelect></Field><Field label="Layout (optional)"><BrandSelect value={templateId} onValueChange={setTemplateId}><option value="">Standard layout</option>{choices.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</BrandSelect></Field></div>
   <div className="field-grid"><Field label="Period start"><input required type="date" value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="Period end"><input required type="date" value={end} onChange={e=>setEnd(e.target.value)}/></Field></div>
   <Field label="Report title (optional)"><input maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder={type+' client review'}/></Field>
   <Button type="submit" loading={busy}><Plus size={15}/>Generate review</Button>
  </form>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner">{notice}</div>}
  <div className="report-list">{reports.map(r=><div className="record-row" key={r.id}><div><strong>{r.title}</strong><p>{r.type} · {fmtDate(r.periodStart)}–{fmtDate(r.periodEnd)} · {r.status}</p></div><div className="ws-nav-buttons"><Badge tone={r.status==='APPROVED'?'green':'neutral'}>{r.status}</Badge><Button variant="secondary" onClick={()=>void download(r.id)}><Download size={14}/>PDF</Button>{canAdmin&&r.status==='DRAFT'&&<Button variant="secondary" loading={busy} onClick={()=>void approve(r.id)}>Approve</Button>}</div></div>)}{!reports.length&&<p className="muted small-text">No business-review reports generated yet.</p>}</div>
 </Panel>;
}
