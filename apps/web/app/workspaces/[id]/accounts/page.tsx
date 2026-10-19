'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {useParams} from 'next/navigation';
import {Building2,Plus,Search} from 'lucide-react';
import {request,post} from '@/lib/api';
import {Badge,BrandSelect,Button,Empty,ErrorMessage,Field,PageTop,Panel} from '@/components/ui';

type Account={id:string;name:string;domain:string;website:string;industry:string;status:string;opportunities:{id:string;title:string;stage:string;status?:string}[]};
const industries=['Technology & Software','AI & Data','Computer Vision','Sports & Entertainment','Professional Services','Manufacturing','Healthcare','Finance & Insurance','Retail & Commerce','Education','Other'];
export default function TenantProspects(){
 const params=useParams(),orgId=String(params.id||'');
 const [rows,setRows]=useState<Account[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[showForm,setShowForm]=useState(false),[search,setSearch]=useState('');
 const [name,setName]=useState(''),[website,setWebsite]=useState(''),[industry,setIndustry]=useState('Technology & Software');
 async function reload(){setRows(await request<Account[]>('/workspace-crm/'+orgId+'/accounts'));}
 useEffect(()=>{void reload().catch(e=>setError(e instanceof Error?e.message:'Unable to load prospects.'));},[orgId]);
 async function submit(e:FormEvent){e.preventDefault();setError('');setNotice('');setSaving(true);try{await post('/workspace-crm/'+orgId+'/accounts',{name,website,industry});setName('');setWebsite('');setShowForm(false);setNotice('Prospect created with its initial Account Researched opportunity.');await reload();}catch(e){setError(e instanceof Error?e.message:'Unable to create prospect.')}finally{setSaving(false)}}
 const shown=rows.filter(a=>(a.name+' '+a.domain+' '+a.industry).toLowerCase().includes(search.toLowerCase()));
 return <section className="tenant-prospects">
  <PageTop kicker="ACCOUNT DEVELOPMENT" title="Prospects & Accounts" description="Companies you may sell to. Creating a prospect creates one Account and its first open opportunity—there is no duplicate company record later in Client Management." action={<Button onClick={()=>setShowForm(v=>!v)}><Plus size={16}/>{showForm?'Close form':'New prospect'}</Button>}/>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner" role="status">{notice}</div>}
  {showForm&&<Panel title="Add prospective company"><form onSubmit={submit} className="stack-16"><div className="field-grid"><Field label="Company name"><input required minLength={2} maxLength={150} value={name} onChange={e=>setName(e.target.value)} placeholder="Acme Vision"/></Field><Field label="Company website"><input required type="url" value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://acme.example"/></Field></div><Field label="Industry"><BrandSelect value={industry} onValueChange={setIndustry} ariaLabel="Prospect industry">{industries.map(v=><option key={v} value={v}>{v}</option>)}</BrandSelect></Field><div className="ws-nav-buttons"><Button type="submit" loading={saving}>Create prospect</Button><Button type="button" variant="secondary" onClick={()=>setShowForm(false)}>Cancel</Button></div></form></Panel>}
  <Panel title={'Prospect accounts ('+shown.length+')'} actions={<div className="search-box compact-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search prospects"/></div>}>
   {shown.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Company</th><th>Domain</th><th>Industry</th><th>Relationship</th><th>Open opportunities</th></tr></thead><tbody>{shown.map(a=><tr key={a.id}><td><strong>{a.name}</strong></td><td>{a.domain}</td><td>{a.industry}</td><td><Badge tone={a.status==='Customer'?'green':a.status==='Contracting'?'orange':'neutral'}>{a.status}</Badge></td><td>{a.opportunities.filter(o=>o.status!=='CLOSED_LOST').length}</td></tr>)}</tbody></table></div>:<Empty title={rows.length?'No matching prospects':'No prospects yet'} description={rows.length?'Try a different search.':'Add a company only when your team is ready to start a sales relationship.'} action={!rows.length?<Button onClick={()=>setShowForm(true)}><Building2 size={16}/>Add first prospect</Button>:undefined}/>}
  </Panel>
 </section>;
}
