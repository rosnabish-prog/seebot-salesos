'use client';
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {useParams} from 'next/navigation';
import {post,request} from '@/lib/api';
import {Button,ErrorMessage,Field} from '@/components/ui';
type Opportunity={id:string;accountId:string;title:string;stage:string;status:string};
type Client={id:string;name:string;domain:string};
type Contract={id:string;title:string;type:string;status:string};
type Invoice={id:string;number:string;status:string;currency:string;total:string};
type Summary={accounts:number;clients:number;opportunities:number;contracts:number;invoices:number;mode:string;invoicedByCurrency:Record<string,number>};
const endpoint=(id:string,section:string)=>`/workspace-business/${id}/${section}`;
export default function WorkspaceBusinessPreview(){
 const params=useParams(),orgId=String(params.id||'');
 const [summary,setSummary]=useState<Summary|null>(null),[opportunities,setOpportunities]=useState<Opportunity[]>([]),[clients,setClients]=useState<Client[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[invoices,setInvoices]=useState<Invoice[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [accountId,setAccountId]=useState(''),[title,setTitle]=useState(''),[service,setService]=useState('Data annotation');
 async function refresh(){const [s,o,c,ct,i]=await Promise.all([request<Summary>(endpoint(orgId,'dashboard')),request<Opportunity[]>(endpoint(orgId,'opportunities')),request<Client[]>(endpoint(orgId,'clients')),request<Contract[]>(endpoint(orgId,'contracts')),request<Invoice[]>(endpoint(orgId,'invoices'))]);setSummary(s);setOpportunities(o);setClients(c);setContracts(ct);setInvoices(i);}
 useEffect(()=>{if(orgId)void refresh().catch(e=>setError(e.message));},[orgId]);
 async function createOpportunity(){setBusy(true);setError('');try{await post(endpoint(orgId,`accounts/${accountId}/opportunities`),{title,serviceLine:service});setNotice('Fictional opportunity created.');setTitle('');await refresh();}catch(e:any){setError(e.message)}finally{setBusy(false);}}
 return <main style={{background:'#fafafb',minHeight:'100vh',padding:'30px 16px'}}><section style={{maxWidth:1100,margin:'auto',background:'#fff',border:'1px solid #e7e7eb',borderRadius:18,padding:26}}>
 <Link href={`/workspaces/${orgId}/accounts`}>← Workspace prospects</Link><h1>Workspace Business Preview</h1>
 <p className="muted">Fictional data only. This preview is enabled only in local development with TENANT_SCOPED_CRM_PREVIEW=true. The full Seebot CRM remains separated from other company workspaces.</p>
 <ErrorMessage message={error}/>{notice&&<p role="status">{notice}</p>}
 {summary&&<div className="field-grid" style={{margin:'18px 0'}}>{(['accounts','clients','opportunities','contracts','invoices'] as const).map(k=><div key={k} className="panel" style={{padding:16}}><div className="muted">{k.toUpperCase()}</div><strong style={{fontSize:24}}>{summary[k]}</strong></div>)}</div>}
 <section className="panel" style={{padding:18,marginBottom:18}}><h2>Create a fictional opportunity</h2><div className="field-grid"><Field label="Customer account ID"><input value={accountId} onChange={e=>setAccountId(e.target.value)} placeholder="Copy ID from workspace prospect details"/></Field><Field label="Opportunity title"><input value={title} onChange={e=>setTitle(e.target.value)}/></Field><Field label="Service"><input value={service} onChange={e=>setService(e.target.value)}/></Field></div><Button onClick={()=>void createOpportunity()} disabled={busy||!accountId||!title} loading={busy}>Create</Button></section>
 <section className="panel" style={{padding:18,marginBottom:18}}><h2>Opportunities ({opportunities.length})</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Title</th><th>Stage</th><th>Status</th></tr></thead><tbody>{opportunities.map(o=><tr key={o.id}><td>{o.title}</td><td>{o.stage}</td><td>{o.status}</td></tr>)}</tbody></table></div></section>
 <section className="panel" style={{padding:18,marginBottom:18}}><h2>Contracts ({contracts.length})</h2>{contracts.map(c=><p key={c.id}>{c.title} — {c.type} / {c.status}</p>)}{!contracts.length&&<p className="muted">No fictional contracts.</p>}</section>
 <section className="panel" style={{padding:18,marginBottom:18}}><h2>Invoices ({invoices.length})</h2>{invoices.map(i=><p key={i.id}>{i.number} — {i.currency} {String(i.total)} ({i.status})</p>)}{!invoices.length&&<p className="muted">No fictional invoices.</p>}</section>
 <section className="panel" style={{padding:18}}><h2>Client accounts ({clients.length})</h2>{clients.map(c=><p key={c.id}>{c.name} — {c.domain}</p>)}</section>
 </section></main>;
}
