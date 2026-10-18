'use client';
import {useEffect,useState,FormEvent} from 'react';
import {useAuth} from '@/context/auth';
import {AlertTriangle,Download,FileBarChart2,HeartPulse,RefreshCw} from 'lucide-react';
import {Badge,Button,ErrorMessage,Field} from '@/components/ui';
import {fmtDate,post,request} from '@/lib/api';

type Health={score:number;level:'HEALTHY'|'ATTENTION'|'AT_RISK';flags:string[];calculatedAt:string;method:string};
type Report={id:string;title:string;type:string;periodStart:string;periodEnd:string;isDemo:boolean;createdAt:string};
type Renewal={id:string;status:string;nextReviewAt:string;contract:{id:string;title:string;expiresAt:string|null;status:string}};
type Contract={id:string;title:string;status:string;expiresAt:string|null};
const iso=(d:Date)=>d.toISOString().slice(0,10);
const today=new Date();const prior=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1));
export function ClientSuccessPanel({accountId,editable,isDemo,contracts}:{accountId:string;editable:boolean;isDemo:boolean;contracts:Contract[]}){
 const {user}=useAuth();const canApprove=['SUPER_ADMIN','SALES_MANAGER'].includes(user?.role||'');
 const [health,setHealth]=useState<Health|null>(null),[reports,setReports]=useState<Report[]>([]),[renewals,setRenewals]=useState<Renewal[]>([]),[healthHistory,setHealthHistory]=useState<any[]>([]);
 const [type,setType]=useState<'MBR'|'QBR'>('MBR'),[start,setStart]=useState(iso(prior)),[end,setEnd]=useState(iso(today)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){const [h,r,n]=await Promise.all([request<Health>(`/client-success/clients/${accountId}/health`),request<Report[]>(`/client-success/clients/${accountId}/reports`),request<Renewal[]>(`/client-success/clients/${accountId}/renewals`)]);setHealth(h);setReports(r);setRenewals(n);request<any>(`/review-workflow/clients/${accountId}/health-history`).then(x=>setHealthHistory(x.history||[])).catch(()=>{})}
 useEffect(()=>{void refresh().catch(e=>setError(e.message))},[accountId]);
 async function generate(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await post(`/client-success/clients/${accountId}/reports`,{type,periodStart:start,periodEnd:end});await refresh();setNotice(`${type} snapshot generated. Review before distributing.`)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function schedule(contractId:string){setBusy(true);setError('');try{await post(`/client-success/contracts/${contractId}/renewal`,{daysBefore:60});await refresh();setNotice('Renewal review scheduled; a task was created if needed.')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function download(reportId:string){setError('');try{const origin=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000';const res=await fetch(`${origin}/api/client-success/reports/${reportId}/pdf`,{credentials:'include',cache:'no-store'});if(!res.ok)throw Error('Cannot download the report.');const url=URL.createObjectURL(await res.blob());const anchor=document.createElement('a');anchor.href=url;anchor.download=`client-review-${reportId}.pdf`;anchor.click();URL.revokeObjectURL(url);}catch(e:any){setError(e.message)}}
 return <div className="stack-16" style={{marginTop:16}}>
  <section className="panel" style={{padding:24}}>
   <header className="panel-head"><h3><HeartPulse size={19}/> Client Health</h3><Badge tone={health?.level==='HEALTHY'?'green':health?.level==='AT_RISK'?'red':'orange'}>{health?health.level.replaceAll('_',' '):'Loading'}</Badge></header>
   {health&&<><div className="client-summary-grid"><div className="client-summary-tile"><small>Rule-based health indicator</small><strong>{health.score}/100</strong></div><div className="client-summary-tile"><small>Last calculated</small><strong>{fmtDate(health.calculatedAt)}</strong></div></div><p className="muted small-text">{health.method} Only recorded CRM signals are used. This is not a prediction of renewal.</p>{healthHistory.length>0&&<details><summary>Historical review health ({healthHistory.length})</summary>{healthHistory.map(h=><div className="record-row" key={h.reportId}><strong>{fmtDate(h.periodEnd)}</strong><span>{h.health?.level||'Unknown'} · {h.health?.score??'—'}/100</span></div>)}</details>}{health.flags.length?health.flags.map((f,i)=><div className="record-row" key={i}><AlertTriangle size={16}/><div>{f}</div></div>):<div className="soft-callout">No recorded risk flags. This does not establish that the client is satisfied.</div>}</>}
  </section>
  <section className="panel" style={{padding:24}}>
   <header className="panel-head"><h3><FileBarChart2 size={19}/> MBR / QBR Reports</h3><Badge>{isDemo?'Fictional demo':'Internal records'}</Badge></header>
   <p className="muted small-text">Generate a fixed report snapshot from actual client records. PDFs are internal drafts until a person reviews and approves distribution. No email is sent automatically.</p>
   {editable&&<form onSubmit={generate} className="stack-16"><div className="field-grid"><Field label="Report"><select value={type} onChange={e=>setType(e.target.value as 'MBR'|'QBR')}><option value="MBR">Monthly business review</option><option value="QBR">Quarterly business review</option></select></Field><Field label="Start"><input required type="date" value={start} onChange={e=>setStart(e.target.value)}/></Field><Field label="End"><input required type="date" value={end} onChange={e=>setEnd(e.target.value)}/></Field></div><Button type="submit" loading={busy}>Generate review draft</Button></form>}
   {reports.length?reports.map(r=><div className="record-row" key={r.id}><FileBarChart2 size={18}/><div style={{flex:1}}><strong>{r.title}</strong><p>{r.type} · {fmtDate(r.periodStart)} to {fmtDate(r.periodEnd)} · {fmtDate(r.createdAt)}</p></div><Button variant="secondary" onClick={()=>void download(r.id)}><Download size={15}/> PDF</Button>{canApprove&&<Button variant="secondary" onClick={()=>void post(`/review-workflow/reports/${r.id}/approve`,{}).then(()=>{setNotice('Management approval recorded.');void refresh()}).catch(e=>setError(e.message))}>Approve review</Button>}</div>):<p className="muted small-text">No business-review reports generated yet.</p>}
  </section>
  <section className="panel" style={{padding:24}}>
   <header className="panel-head"><h3><RefreshCw size={19}/> Renewal Follow-ups</h3></header>
   {contracts.filter(c=>c.status==='SIGNED'&&c.expiresAt).map(c=>{const planned=renewals.find(r=>r.contract.id===c.id);return <div className="record-row" key={c.id}><RefreshCw size={18}/><div style={{flex:1}}><strong>{c.title}</strong><p>Expires: {fmtDate(c.expiresAt)}{planned?` · Review ${fmtDate(planned.nextReviewAt)} (${planned.status})`:' · Review not scheduled'}</p></div>{editable&&<Button variant="secondary" loading={busy} onClick={()=>void schedule(c.id)}>{planned?'Reschedule':'Plan renewal'}</Button>}</div>})}
   {!contracts.some(c=>c.status==='SIGNED'&&c.expiresAt)&&<p className="muted small-text">Renewal plans are available for signed contracts with an expiry date.</p>}
  </section>
  <ErrorMessage message={error}/>{notice&&<div role="status" className="soft-callout">{notice}</div>}
 </div>;
}
