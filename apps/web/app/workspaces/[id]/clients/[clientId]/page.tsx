'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {Building2,FileSignature,ReceiptText,UsersRound} from 'lucide-react';
import {Badge,ErrorMessage,PageTop,Panel} from '@/components/ui';
import {fmtDate,request} from '@/lib/api';
import {TenantClientSurveys} from '@/components/client/tenant-surveys-panel';

type Client={
 id:string;name:string;domain:string;status:string;clientSince:string|null;
 contacts:{id:string;name:string;title:string;email:string|null}[];
 opportunities:{id:string;title:string;stage:string;status:string;contracts:{id:string;title:string;status:string;signedAt:string|null;expiresAt:string|null;committedAmount:string|null;currency:string|null}[]}[];
 invoices:{id:string;number:string;status:string;currency:string;total:string;dueAt:string;issuedAt:string|null}[];
 clientReviews:{id:string;type:string;title:string;score:number|null;summary:string;occurredAt:string}[];
 clientIssues:{id:string;title:string;severity:string;status:string;createdAt:string;resolvedAt:string|null}[];
 milestones:{id:string;title:string;status:string;dueAt?:string|null;createdAt:string}[];
};
type Profile={role:string};
const contractingStages=['PILOT_CONTRACTED','PILOT_DELIVERED','PRODUCTION_NEGOTIATED','CLOSED_WON'];
export default function TenantClientDetail(){
 const params=useParams(),orgId=String(params.id||''),clientId=String(params.clientId||'');
 const [client,setClient]=useState<Client|null>(null),[role,setRole]=useState('MEMBER'),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 useEffect(()=>{let active=true;void Promise.all([request<Client>('/workspace-business/'+orgId+'/clients/'+clientId),request<Profile>('/workspaces/'+orgId+'/profile')]).then(([c,p])=>{if(active){setClient(c);setRole(p.role)}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Cannot load client relationship.')}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[orgId,clientId]);
 const relationship=useMemo(()=>client?.status==='Customer'?'Active client':client?.opportunities.some(o=>contractingStages.includes(o.stage))?'Contracting':'Prospect',[client]);
 if(busy)return <section className="panel">Loading client relationship…</section>;
 return <section className="tenant-client-detail"><Link href={'/workspaces/'+orgId+'/clients'} className="text-link">← Client Management</Link><PageTop kicker="CLIENT RELATIONSHIP" title={client?.name||'Client'} description="One account record carries the relationship from prospecting through contracting, delivery, billing and satisfaction."/>
 <ErrorMessage message={error}/>{client&&<>
  <div className="client-lifecycle-strip"><div><span>Relationship</span><Badge tone={relationship==='Active client'?'green':'orange'}>{relationship}</Badge></div><div><span>Domain</span><strong>{client.domain}</strong></div><div><span>Client since</span><strong>{client.clientSince?fmtDate(client.clientSince):'Not Closed Won yet'}</strong></div></div>
  <div className="tenant-dashboard-grid">
   <Panel title="Contacts" actions={<UsersRound size={18}/>}>{client.contacts.length?client.contacts.map(c=><div className="record-row" key={c.id}><div><strong>{c.name}</strong><p>{c.title}</p></div><span>{c.email||'No email'}</span></div>):<p className="muted small-text">No client contacts recorded yet.</p>}</Panel>
   <Panel title="Commercial relationship" actions={<FileSignature size={18}/>}>{client.opportunities.map(o=><div className="record-row" key={o.id}><div><strong>{o.title}</strong><p>{o.stage.replaceAll('_',' ')}</p></div><Badge>{o.status}</Badge></div>)}</Panel>
  </div>
  <div className="tenant-dashboard-grid">
   <Panel title="Invoices" actions={<ReceiptText size={18}/>}>{client.invoices.length?client.invoices.map(inv=><div className="record-row" key={inv.id}><div><strong>{inv.number}</strong><p>{inv.currency} {Number(inv.total).toLocaleString()} · due {fmtDate(inv.dueAt)}</p></div><Badge>{inv.status}</Badge></div>):<p className="muted small-text">No invoices yet. Billing remains optional until the commercial workflow needs it.</p>}</Panel>
   <Panel title="Health & issues" actions={<Building2 size={18}/>}>{client.clientIssues.length?client.clientIssues.map(issue=><div className="record-row" key={issue.id}><div><strong>{issue.title}</strong><p>{issue.severity} · {fmtDate(issue.createdAt)}</p></div><Badge tone={issue.status==='OPEN'?'orange':'green'}>{issue.status}</Badge></div>):<p className="muted small-text">No unresolved client issues recorded.</p>}</Panel>
  </div>
  <TenantClientSurveys orgId={orgId} accountId={clientId} canAdmin={['ADMIN','OWNER'].includes(role)}/>
 </>}</section>;
}
