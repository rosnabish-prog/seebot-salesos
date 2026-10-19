'use client';
import {useEffect,useState} from 'react';
import {Clock3,MailCheck,RefreshCw,Repeat2} from 'lucide-react';
import {Badge,Button,ErrorMessage,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';
type Reminder={id:string;status:string;scheduledFor:string;invoiceId:string;number:string;client:string;recipient:string;currency:string;total:string};
type Candidate={invoiceId:string;invoiceNumber:string;clientName:string;currency:string;balance:number;day:number;scheduledFor:string};
type Data={candidates:Candidate[];pending:Reminder[]};
type Profile={role:string};
export function TenantFinanceAutomationPanel({orgId,onChanged}:{orgId:string;onChanged?:()=>Promise<void>}){
 const [role,setRole]=useState(''),[data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const allowed=['OWNER','ADMIN','FINANCE'].includes(role),admin=['OWNER','ADMIN'].includes(role);
 async function load(){const profile=await request<Profile>('/workspaces/'+orgId+'/profile');setRole(profile.role);if(['OWNER','ADMIN','FINANCE'].includes(profile.role))setData(await request<Data>('/workspace-finance-automation/'+orgId+'/reminders'));}
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load billing automation.'))},[orgId]);
 async function run(fn:()=>Promise<any>,fallback:string){setBusy(true);setError('');setNotice('');try{const out=await fn();setNotice(out?.note||out?.status||fallback);await load();if(onChanged)await onChanged();}catch(e){setError(e instanceof Error?e.message:'Finance automation action failed.')}finally{setBusy(false)}}
 if(role&&!allowed)return null;
 return <Panel title="Billing schedules & payment reminders" actions={<Repeat2 size={18}/>}>
  <p className="muted small-text">Automation prepares work; it does not silently issue invoices or contact clients. Scheduled billing creates drafts. Overdue reminders create review tasks, require approval, then require an explicit send.</p>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner">{notice}</div>}
  {allowed&&<><div className="ws-nav-buttons"><Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post('/workspace-finance-automation/'+orgId+'/billing/generate-drafts',{}),'Billing drafts checked.')}><RefreshCw size={15}/>Generate due invoice drafts</Button><Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post('/workspace-finance-automation/'+orgId+'/reminders/create-review-tasks',{}),'Reminder review tasks checked.')}><Clock3 size={15}/>Create reminder review tasks</Button></div>
   {!!data?.candidates.length&&<div className="finance-reminder-candidates"><h3>Overdue reminder candidates</h3>{data.candidates.map(c=><div className="record-row" key={c.invoiceId+'-'+c.day}><div><strong>{c.invoiceNumber} · {c.clientName}</strong><p>{c.currency} {c.balance.toFixed(2)} outstanding · day {c.day}</p></div><Badge tone="orange">Review task not created</Badge></div>)}</div>}
   <div className="finance-reminder-list"><h3>Reminder approvals</h3>{data?.pending.length?data.pending.map(r=><div className="record-row" key={r.id}><div><strong>{r.number} · {r.client}</strong><p>{r.recipient} · scheduled {new Date(r.scheduledFor).toLocaleDateString()}</p></div><div className="ws-nav-buttons"><Badge tone={r.status==='APPROVED'?'green':'orange'}>{r.status.replaceAll('_',' ')}</Badge>{admin&&r.status==='PENDING_APPROVAL'&&<Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post('/workspace-finance-automation/'+orgId+'/reminders/'+r.id+'/approve',{}),'Reminder approved.')}>Approve</Button>}{r.status==='APPROVED'&&<Button disabled={busy} onClick={()=>void run(()=>post('/workspace-finance-automation/'+orgId+'/reminders/'+r.id+'/send',{}),'Reminder sent through connected Gmail.')}><MailCheck size={14}/>Send</Button>}</div></div>):<p className="muted small-text">No reminder approvals are waiting.</p>}</div>
  </>}
 </Panel>;
}
