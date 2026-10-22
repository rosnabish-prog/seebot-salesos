'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {ArrowUpRight} from 'lucide-react';
import {PageTop,Panel,ErrorMessage,Badge,Empty} from '@/components/ui';
import {request} from '@/lib/api';
type Client={id:string;name:string;domain:string;relationshipStatus:'CONTRACTING'|'ACTIVE_CLIENT'|'PROSPECT';contacts:{id:string;name:string;title:string;email:string}[];invoices:{id:string;number:string;status:string;currency:string;total:string;dueAt:string}[];opportunities:{id:string;title:string;stage:string;status:string}[]};
export default function TenantClients(){
 const params=useParams(),id=String(params.id||'');
 const [rows,setRows]=useState<Client[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 useEffect(()=>{let active=true;void request<Client[]>('/workspace-business/'+id+'/clients').then(v=>{if(active)setRows(v)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Cannot load clients.')}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[id]);
 return <section><PageTop kicker="ACCOUNT RELATIONSHIPS" title="Client Management" description="The same company record follows the relationship from contracting to active customer—no duplicate client record is created." action={<Link href={'/workspaces/'+id+'/accounts'} className="btn btn-secondary">Prospects & accounts</Link>}/>
 <ErrorMessage message={error}/><Panel title={'Client relationships ('+rows.length+')'}>{busy?<p>Loading clients…</p>:rows.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Company</th><th>Relationship</th><th>Contacts</th><th>Invoices</th><th>Latest opportunity</th><th></th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><strong>{c.name}</strong><p className="muted small-text">{c.domain}</p></td><td><Badge tone={c.relationshipStatus==='ACTIVE_CLIENT'?'green':'orange'}>{c.relationshipStatus==='ACTIVE_CLIENT'?'Active client':'Contracting'}</Badge></td><td>{c.contacts.length}</td><td>{c.invoices.length}</td><td>{c.opportunities[0]?.title||'—'}</td><td><Link className="icon-button" aria-label={'Open '+c.name} href={'/workspaces/'+id+'/clients/'+c.id}><ArrowUpRight size={17}/></Link></td></tr>)}</tbody></table></div>:<Empty title="No client relationships yet" description="A company appears here automatically when a deal reaches Pilot Contracted. It becomes an Active client at Closed Won." action={<Link href={'/workspaces/'+id+'/accounts'} className="btn btn-primary">Add a prospect</Link>}/>}</Panel>
 </section>;
}
