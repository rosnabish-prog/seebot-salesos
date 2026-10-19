'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {PageTop,Panel,ErrorMessage,Badge,Empty} from '@/components/ui';
import {request} from '@/lib/api';
type Client={id:string;name:string;domain:string;contacts:{id:string;name:string;title:string;email:string}[];invoices:{id:string;number:string;status:string;currency:string;total:string;dueAt:string}[]};
export default function TenantClients(){
 const params=useParams(),id=String(params.id||'');
 const [rows,setRows]=useState<Client[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 useEffect(()=>{let active=true;void request<Client[]>('/workspace-business/'+id+'/clients').then(v=>{if(active)setRows(v)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Cannot load clients.')}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[id]);
 return <section><PageTop kicker="ACCOUNT RELATIONSHIPS" title="Client Management" description="Only customers belonging to your selected company workspace are shown." action={<Link href={'/workspaces/'+id+'/accounts'} className="btn btn-secondary">Prospects & accounts</Link>}/>
 <ErrorMessage message={error}/><Panel title={'Client accounts ('+rows.length+')'}>{busy?<p>Loading clients…</p>:rows.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Company</th><th>Domain</th><th>Contacts</th><th>Invoices</th><th>Status</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.domain}</td><td>{c.contacts.length}</td><td>{c.invoices.length}</td><td><Badge tone="green">Customer</Badge></td></tr>)}</tbody></table></div>:<Empty title="No customers yet" description="Customers will appear when qualifying opportunities reach Closed Won. You can add prospective accounts now." action={<Link href={'/workspaces/'+id+'/accounts'} className="btn btn-primary">Add a prospect</Link>}/>}</Panel>
 </section>;
}
