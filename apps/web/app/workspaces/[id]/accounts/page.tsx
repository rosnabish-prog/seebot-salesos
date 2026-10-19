'use client';
import {useEffect,useState,FormEvent} from 'react';
import Link from 'next/link';
import {useParams,useRouter} from 'next/navigation';
import {request,post} from '@/lib/api';
import {Button,ErrorMessage,Field,BrandSelect} from '@/components/ui';
type Account={id:string;name:string;domain:string;website:string;industry:string;status:string;opportunities:{id:string;title:string;stage:string}[]};
export default function TenantProspects(){
 const params=useParams(),router=useRouter(),id=String(params.id||'');const [rows,setRows]=useState<Account[]>([]),[error,setError]=useState(''),[saving,setSaving]=useState(false),[name,setName]=useState(''),[website,setWebsite]=useState(''),[industry,setIndustry]=useState('Other'),[showForm,setShowForm]=useState(true);
 async function reload(){setRows(await request<Account[]>(`/workspace-crm/${id}/accounts`));}
 useEffect(()=>{void reload().catch((e:any)=>setError(e.message));},[id]);
 async function submit(e:FormEvent){e.preventDefault();setError('');setSaving(true);try{await post(`/workspace-crm/${id}/accounts`,{name,website,industry});setName('');setWebsite('');await reload();}catch(e:any){setError(e.message)}finally{setSaving(false)}}
 return <main style={{minHeight:'100vh',padding:'32px 16px',background:'#fafafb'}}><section style={{maxWidth:1050,margin:'auto',background:'#fff',padding:26,borderRadius:18,border:'1px solid #e5e7eb'}}>
 <Link href={`/workspaces/${id}`}>← Company home</Link> · <Link href={`/workspaces/${id}/business`}>Business preview</Link><h1>Company Prospects</h1><p className="muted small-text">Adding a prospect means saving a company you may want to sell to. This is optional; you can create and manage your workspace without adding any prospects. In this private developer preview, use fictional .example or .invalid prospect websites.</p>
 <ErrorMessage message={error}/>
 {showForm?<form onSubmit={submit} className="stack-16 ws-prospect-form" style={{padding:20,border:'1px solid #e6e9ed',borderRadius:13,marginBottom:22}}>
  <div className="ws-form-heading"><div><h2>Add a prospective customer (optional)</h2><p className="muted small-text">You can skip this step and return anytime.</p></div></div>
  <div className="field-grid"><Field label="Prospect company name"><input required minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder="Prospect company name"/></Field>
   <Field label="HTTPS website"><input required type="url" placeholder="https://example.com" value={website} onChange={e=>setWebsite(e.target.value)}/></Field></div>
  <Field label="Industry"><BrandSelect value={industry} onValueChange={setIndustry} ariaLabel="Prospect industry">{['Technology & Software','AI & Data','Computer Vision','Sports & Entertainment','Professional Services','Manufacturing','Healthcare','Finance & Insurance','Retail & Commerce','Education','Other'].map(v=><option key={v} value={v}>{v}</option>)}</BrandSelect></Field>
  <div className="ws-nav-buttons"><Button type="submit" loading={saving}>Create prospect</Button><Button type="button" variant="secondary" onClick={()=>router.push('/workspaces/'+id)}>Skip — return to company home</Button></div>
 </form>:<div className="ws-nav-buttons" style={{marginBottom:24}}><Button type="button" onClick={()=>setShowForm(true)}>Add a prospect</Button><Button variant="secondary" type="button" onClick={()=>router.push('/workspaces/'+id)}>Back to company home</Button></div>}
 <h2>Prospect list ({rows.length})</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Company</th><th>Domain</th><th>Industry</th><th>Initial opportunity</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td><strong>{a.name}</strong></td><td>{a.domain}</td><td>{a.industry}</td><td>{a.opportunities[0]?.stage||'Unassigned'}</td></tr>)}</tbody></table></div>
 {!rows.length&&<p className="muted">No prospects yet.</p>}
 </section></main>;
}
