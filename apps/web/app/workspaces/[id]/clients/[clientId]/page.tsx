'use client';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {Activity,AlertTriangle,Building2,CalendarClock,CheckCircle2,FileSignature,HeartPulse,Plus,ReceiptText,UsersRound} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Modal,PageTop,Panel} from '@/components/ui';
import {fmtDate,patch,post,request} from '@/lib/api';
import {TenantClientSurveys} from '@/components/client/tenant-surveys-panel';

type Client={
 id:string;name:string;domain:string;status:string;clientSince:string|null;
 contacts:{id:string;name:string;title:string;email:string|null}[];
 opportunities:{id:string;title:string;stage:string;status:string;contracts:{id:string;title:string;status:string;signedAt:string|null;expiresAt:string|null;committedAmount:string|null;currency:string|null}[]}[];
 invoices:{id:string;number:string;status:string;currency:string;total:string;dueAt:string;issuedAt:string|null}[];
 clientReviews:{id:string;type:string;title:string;score:number|null;summary:string;occurredAt:string}[];
 clientIssues:{id:string;title:string;details?:string|null;severity:string;status:string;createdAt:string;resolvedAt:string|null}[];
 milestones:{id:string;title:string;description:string;acceptanceCriteria:string;status:string;dueAt?:string|null;createdAt:string}[];
};
type Profile={role:string};
type Health={score:number;level:'HEALTHY'|'ATTENTION'|'AT_RISK';flags:string[];method:string};
type Renewal={id:string;nextReviewAt:string;status:string;contract:{id:string;title:string;status:string;expiresAt:string|null}};
const contractingStages=['PILOT_CONTRACTED','PILOT_DELIVERED','PRODUCTION_NEGOTIATED','CLOSED_WON'];

export default function TenantClientDetail(){
 const params=useParams(),orgId=String(params.id||''),clientId=String(params.clientId||'');
 const [client,setClient]=useState<Client|null>(null),[health,setHealth]=useState<Health|null>(null),[renewals,setRenewals]=useState<Renewal[]>([]),[role,setRole]=useState('MEMBER'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(true),[saving,setSaving]=useState(false),[modal,setModal]=useState<'review'|'issue'|'milestone'|null>(null),[form,setForm]=useState<any>({});
 const editable=!['VIEWER'].includes(role),admin=['ADMIN','OWNER'].includes(role);
 async function load(){
  const [c,p,h,r]=await Promise.all([
   request<Client>('/workspace-business/'+orgId+'/clients/'+clientId),
   request<Profile>('/workspaces/'+orgId+'/profile'),
   request<Health>('/workspace-business/'+orgId+'/clients/'+clientId+'/health'),
   request<Renewal[]>('/workspace-business/'+orgId+'/clients/'+clientId+'/renewals')
  ]);
  setClient(c);setRole(p.role);setHealth(h);setRenewals(r);
 }
 useEffect(()=>{let active=true;setBusy(true);void load().catch(e=>{if(active)setError(e instanceof Error?e.message:'Cannot load client relationship.')}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[orgId,clientId]);
 const relationship=useMemo(()=>client?.status==='Customer'?'Active client':client?.status==='Contracting'||client?.opportunities.some(o=>contractingStages.includes(o.stage))?'Contracting':'Prospect',[client]);
 const contracts=useMemo(()=>client?.opportunities.flatMap(o=>o.contracts.map(c=>({...c,opportunityId:o.id})))||[],[client]);
 async function run(action:()=>Promise<unknown>,message:string){setSaving(true);setError('');setNotice('');try{await action();await load();setNotice(message);setModal(null);setForm({});}catch(e){setError(e instanceof Error?e.message:'Action failed.')}finally{setSaving(false)}}
 async function submit(e:FormEvent){e.preventDefault();
  if(modal==='review')await run(()=>post('/workspace-business/'+orgId+'/clients/'+clientId+'/reviews',{type:form.type||'GENERAL',title:form.title,summary:form.summary,score:form.score===''||form.score===undefined?undefined:Number(form.score),actionItems:String(form.actionItems||'').split('\n').map(x=>x.trim()).filter(Boolean)}),'Client review recorded.');
  if(modal==='issue')await run(()=>post('/workspace-business/'+orgId+'/clients/'+clientId+'/issues',{title:form.title,details:form.details,severity:form.severity||'MEDIUM'}),'Client issue logged.');
  if(modal==='milestone')await run(()=>post('/workspace-business/'+orgId+'/clients/'+clientId+'/milestones',{title:form.title,description:form.description||'',acceptanceCriteria:form.acceptanceCriteria,dueAt:form.dueAt||undefined,contractId:form.contractId||undefined}),'Delivery milestone created.');
 }
 if(busy)return <section className="panel">Loading client relationship…</section>;
 return <section className="tenant-client-detail">
  <Link href={'/workspaces/'+orgId+'/clients'} className="text-link">← Client Management</Link>
  <PageTop kicker="CLIENT RELATIONSHIP" title={client?.name||'Client'} description="One company record follows the relationship from prospecting through contracting, delivery, billing, renewal and satisfaction."/>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner" role="status">{notice}</div>}
  {client&&<>
   <div className="client-lifecycle-strip"><div><span>Relationship</span><Badge tone={relationship==='Active client'?'green':'orange'}>{relationship}</Badge></div><div><span>Domain</span><strong>{client.domain}</strong></div><div><span>Client since</span><strong>{client.clientSince?fmtDate(client.clientSince):'Contracting relationship'}</strong></div><div><span>Health</span><Badge tone={health?.level==='HEALTHY'?'green':health?.level==='AT_RISK'?'red':'orange'}>{health?health.score+'/100 · '+health.level.replace('_',' '):'—'}</Badge></div></div>

   <div className="tenant-dashboard-grid">
    <Panel title="Contacts" actions={<UsersRound size={18}/>}>{client.contacts.length?client.contacts.map(c=><div className="record-row" key={c.id}><div><strong>{c.name}</strong><p>{c.title}</p></div><span>{c.email||'No email'}</span></div>):<p className="muted small-text">No contacts recorded yet. Add contacts from Prospects & Accounts so the same person is reused throughout the relationship.</p>}</Panel>
    <Panel title="Relationship health" actions={<HeartPulse size={18}/>}>{health?<><div className="client-health-score"><strong>{health.score}</strong><span>/100</span><Badge tone={health.level==='HEALTHY'?'green':health.level==='AT_RISK'?'red':'orange'}>{health.level.replace('_',' ')}</Badge></div>{health.flags.length?health.flags.map(flag=><div className="record-row" key={flag}><AlertTriangle size={16}/><span>{flag}</span></div>):<p className="muted small-text">No current risk signals from recorded feedback, issues, invoices or contract expiry.</p>}<small className="muted">{health.method}</small></>:<p className="muted small-text">Health will calculate from recorded client evidence.</p>}</Panel>
   </div>

   <div className="tenant-dashboard-grid">
    <Panel title="Commercial relationship" actions={<FileSignature size={18}/>}>{client.opportunities.map(o=><div className="record-row" key={o.id}><div><strong>{o.title}</strong><p>{o.stage.replaceAll('_',' ')}</p></div><Badge>{o.status}</Badge></div>)}</Panel>
    <Panel title="Invoices" actions={<ReceiptText size={18}/>}>{client.invoices.length?client.invoices.map(inv=><div className="record-row" key={inv.id}><div><strong>{inv.number}</strong><p>{inv.currency} {Number(inv.total).toLocaleString()} · due {fmtDate(inv.dueAt)}</p></div><Badge>{inv.status}</Badge></div>):<p className="muted small-text">No invoices yet. Billing remains optional until commercial terms require it.</p>}</Panel>
   </div>

   <Panel title="Client reviews & issues" actions={editable&&<div className="ws-nav-buttons"><Button variant="secondary" onClick={()=>{setForm({type:'GENERAL',title:'',summary:'',score:'',actionItems:''});setModal('review')}}><Plus size={15}/>Review</Button><Button variant="secondary" onClick={()=>{setForm({title:'',details:'',severity:'MEDIUM'});setModal('issue')}}><Plus size={15}/>Issue</Button></div>}>
    <div className="tenant-dashboard-grid compact-grid"><div><h3>Reviews</h3>{client.clientReviews.length?client.clientReviews.map(r=><div className="record-row" key={r.id}><div><strong>{r.title}</strong><p>{r.type}{r.score!==null?' · '+r.score:''} · {fmtDate(r.occurredAt)}</p><small>{r.summary}</small></div></div>):<p className="muted small-text">No manually recorded reviews.</p>}</div>
    <div><h3>Issues</h3>{client.clientIssues.length?client.clientIssues.map(i=><div className="record-row" key={i.id}><div><strong>{i.title}</strong><p>{i.severity} · {i.status}</p><small>{i.details||''}</small></div>{editable&&i.status==='OPEN'&&<Button variant="secondary" disabled={saving} onClick={()=>void run(()=>patch('/workspace-business/'+orgId+'/clients/'+clientId+'/issues/'+i.id,{status:'RESOLVED'}),'Client issue resolved.')}>Resolve</Button>}</div>):<p className="muted small-text">No issues logged.</p>}</div></div>
   </Panel>

   <Panel title="Delivery milestones" actions={editable&&<Button variant="secondary" onClick={()=>{setForm({title:'',description:'',acceptanceCriteria:'',dueAt:'',contractId:''});setModal('milestone')}}><Plus size={15}/>Milestone</Button>}>
    {client.milestones.length?client.milestones.map(m=><div className="record-row" key={m.id}><div><strong>{m.title}</strong><p>{m.status.replaceAll('_',' ')}{m.dueAt?' · due '+fmtDate(m.dueAt):''}</p><small>{m.acceptanceCriteria}</small></div>{editable&&m.status!=='ACCEPTED'&&<BrandSelect value={m.status} onValueChange={async status=>{const evidence=status==='ACCEPTED'?window.prompt('Acceptance evidence reference')||'':'';if(status==='ACCEPTED'&&!evidence)return;await run(()=>patch('/workspace-business/'+orgId+'/clients/'+clientId+'/milestones/'+m.id,{status,evidenceReference:evidence}),'Milestone updated.')}} ariaLabel={'Status '+m.title}><option value="PLANNED">Planned</option><option value="IN_PROGRESS">In progress</option><option value="SUBMITTED">Submitted</option><option value="ACCEPTED">Accepted</option><option value="REJECTED">Rejected</option></BrandSelect>}</div>):<p className="muted small-text">No delivery milestones yet.</p>}
   </Panel>

   <Panel title="Renewal planning" actions={<CalendarClock size={18}/>}>
    {renewals.length?renewals.map(r=><div className="record-row" key={r.id}><div><strong>{r.contract.title}</strong><p>Review {fmtDate(r.nextReviewAt)} · {r.status}</p></div><Badge>{r.contract.expiresAt?'Expires '+fmtDate(r.contract.expiresAt):'No expiry'}</Badge></div>):<p className="muted small-text">No renewal reviews scheduled.</p>}
    {editable&&contracts.filter(c=>c.status==='SIGNED'&&c.expiresAt).map(c=><div className="record-row" key={'renew-'+c.id}><div><strong>{c.title}</strong><p>Signed contract · expires {fmtDate(c.expiresAt)}</p></div><Button variant="secondary" disabled={saving} onClick={()=>void run(()=>post('/workspace-business/'+orgId+'/contracts/'+c.id+'/renewal',{daysBefore:60}),'Renewal review scheduled and follow-up task created.')}>Plan renewal</Button></div>)}
   </Panel>

   <TenantClientSurveys orgId={orgId} accountId={clientId}/>
  </>}

  {modal&&<Modal title={modal==='review'?'Record client review':modal==='issue'?'Log client issue':'Create delivery milestone'} onClose={()=>setModal(null)} width={620}><form className="stack-16" onSubmit={submit}>
   {modal==='review'&&<><div className="field-grid"><Field label="Review type"><BrandSelect value={form.type||'GENERAL'} onValueChange={v=>setForm({...form,type:v})}><option value="GENERAL">General review</option><option value="NPS">NPS</option><option value="CSAT">CSAT</option><option value="MBR">MBR</option><option value="QBR">QBR</option></BrandSelect></Field><Field label="Score (for NPS/CSAT)"><input type="number" min={0} max={10} value={form.score||''} onChange={e=>setForm({...form,score:e.target.value})}/></Field></div><Field label="Title"><input required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/></Field><Field label="Summary"><textarea required rows={3} value={form.summary||''} onChange={e=>setForm({...form,summary:e.target.value})}/></Field><Field label="Action items (one per line, optional)"><textarea rows={2} value={form.actionItems||''} onChange={e=>setForm({...form,actionItems:e.target.value})}/></Field></>}
   {modal==='issue'&&<><Field label="Issue title"><input required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/></Field><Field label="Severity"><BrandSelect value={form.severity||'MEDIUM'} onValueChange={v=>setForm({...form,severity:v})}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></BrandSelect></Field><Field label="Details (optional)"><textarea rows={3} value={form.details||''} onChange={e=>setForm({...form,details:e.target.value})}/></Field></>}
   {modal==='milestone'&&<><Field label="Milestone title"><input required value={form.title||''} onChange={e=>setForm({...form,title:e.target.value})}/></Field><Field label="Contract (optional)"><BrandSelect value={form.contractId||''} onValueChange={v=>setForm({...form,contractId:v})}><option value="">No linked contract</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</BrandSelect></Field><Field label="Description (optional)"><textarea rows={2} value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></Field><Field label="Acceptance criteria"><textarea required rows={3} value={form.acceptanceCriteria||''} onChange={e=>setForm({...form,acceptanceCriteria:e.target.value})}/></Field><Field label="Due date (optional)"><input type="date" value={form.dueAt||''} onChange={e=>setForm({...form,dueAt:e.target.value})}/></Field></>}
   <ErrorMessage message={error}/><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setModal(null)}>Cancel</Button><Button type="submit" loading={saving}>{modal==='review'?'Save review':modal==='issue'?'Log issue':'Create milestone'}</Button></div>
  </form></Modal>}
 </section>;
}
