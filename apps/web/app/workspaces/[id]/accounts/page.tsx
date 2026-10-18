'use client';
import {useEffect,useState,FormEvent} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {request,post} from '@/lib/api';
import {Button,ErrorMessage,Field} from '@/components/ui';
type Account={id:string;name:string;domain:string;website:string;industry:string;status:string;opportunities:{id:string;title:string;stage:string}[]};
export default function TenantProspects(){
 const params=useParams(),id=String(params.id||'');const [rows,setRows]=useState<Account[]>([]),[error,setError]=useState(''),[saving,setSaving]=useState(false),[name,setName]=useState(''),[website,setWebsite]=useState(''),[industry,setIndustry]=useState('Other');
 async function reload(){setRows(await request<Account[]>(`/workspace-crm/${id}/accounts`));}
 useEffect(()=>{void reload().catch((e:any)=>setError(e.message));},[id]);
 async function submit(e:FormEvent){e.preventDefault();setError('');setSaving(true);try{await post(`/workspace-crm/${id}/accounts`,{name,website,industry});setName('');setWebsite('');await reload();}catch(e:any){setError(e.message)}finally{setSaving(false)}}
 return <main style={{minHeight:'100vh',padding:'32px 16px',background:'#fafafb'}}><section style={{maxWidth:1050,margin:'auto',background:'#fff',padding:26,borderRadius:18,border:'1px solid #e5e7eb'}}>
 <Link href="/workspaces">← Company workspaces</Link> · <Link href={`/workspaces/${id}/business`}>Business preview</Link><h1>Company Prospects</h1><p className="muted small-text">Developer-only fictional-data preview (enable TENANT_SCOPED_CRM_PREVIEW=true locally). These records are scoped to the selected company. The original Seebot pipeline, contract and invoice pages remain unavailable to this tenant until their endpoints are migrated and security-tested.</p>
 <ErrorMessage message={error}/><form onSubmit={submit} className="stack-16" style={{padding:16,border:'1px solid #eee',borderRadius:12,marginBottom:26}}><h2>Add prospective company</h2><Field label="Company name"><input required minLength={2} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="HTTPS website"><input required type="url" placeholder="https://example.com" value={website} onChange={e=>setWebsite(e.target.value)}/></Field><Field label="Industry"><input required value={industry} onChange={e=>setIndustry(e.target.value)}/></Field><Button loading={saving}>Create prospect</Button></form>
 <h2>Prospect list ({rows.length})</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Company</th><th>Domain</th><th>Industry</th><th>Initial opportunity</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td><strong>{a.name}</strong></td><td>{a.domain}</td><td>{a.industry}</td><td>{a.opportunities[0]?.stage||'Unassigned'}</td></tr>)}</tbody></table></div>
 {!rows.length&&<p className="muted">No prospects yet.</p>}
 </section></main>;
}
