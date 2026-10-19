'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {useParams} from 'next/navigation';
import {post,request} from '@/lib/api';
import {Button,PageTop,Panel,Field,Badge,ErrorMessage,Empty} from '@/components/ui';
import {Plus} from 'lucide-react';
type Campaign={id:string;name:string;sector:string;status:string;objective:string|null;createdAt:string;owner:{name:string};accounts:{account:{id:string;name:string}}[]};
export default function TenantCampaigns(){
 const params=useParams(),id=String(params.id||'');
 const [items,setItems]=useState<Campaign[]>([]),[show,setShow]=useState(false),[name,setName]=useState(''),[sector,setSector]=useState(''),[objective,setObjective]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setItems(await request<Campaign[]>('/workspace-business/'+id+'/campaigns'));}
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Cannot load campaigns.'));},[id]);
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await post('/workspace-business/'+id+'/campaigns',{name,sector,objective});setName('');setSector('');setObjective('');setShow(false);await refresh();}catch(e){setError(e instanceof Error?e.message:'Cannot create campaign.')}finally{setBusy(false)}}
 return <section><PageTop kicker="OUTREACH PLANNING" title="Campaigns" description="Plan initiatives scoped to your company workspace. Sending email campaigns requires an independently configured integration." action={<Button onClick={()=>setShow(v=>!v)}><Plus size={16}/> New campaign</Button>}/>
 <ErrorMessage message={error}/>{show&&<Panel title="Plan a campaign"><form className="stack-16" onSubmit={save}><div className="field-grid"><Field label="Campaign name"><input required minLength={2} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Sector"><input required minLength={2} value={sector} onChange={e=>setSector(e.target.value)}/></Field></div><Field label="Objective (optional)"><input value={objective} onChange={e=>setObjective(e.target.value)} maxLength={1000}/></Field><Button type="submit" loading={busy}>Save campaign</Button></form></Panel>}
 <Panel title={'Campaigns ('+items.length+')'}>{items.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Campaign</th><th>Sector</th><th>Owner</th><th>Accounts</th><th>Status</th></tr></thead><tbody>{items.map(c=><tr key={c.id}><td><strong>{c.name}</strong><p className="muted small-text">{c.objective||'No objective added yet'}</p></td><td>{c.sector}</td><td>{c.owner.name}</td><td>{c.accounts.length}</td><td><Badge>{c.status}</Badge></td></tr>)}</tbody></table></div>:<Empty title="No campaigns yet" description="Create a campaign plan for your company. It will not send any messages automatically."/ >}</Panel></section>;
}
