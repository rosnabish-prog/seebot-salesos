'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {useParams} from 'next/navigation';
import {patch,post,request} from '@/lib/api';
import {Badge,BrandSelect,Button,Empty,ErrorMessage,Field,PageTop,Panel} from '@/components/ui';
import {Plus,Target,UsersRound,X} from 'lucide-react';

type Account={id:string;name:string;domain:string;industry:string;status:string};
type Campaign={id:string;name:string;sector:string;status:string;objective:string|null;createdAt:string;owner:{name:string};accounts:{account:{id:string;name:string}}[]};
export default function TenantCampaigns(){
 const params=useParams(),orgId=String(params.id||'');
 const [items,setItems]=useState<Campaign[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[show,setShow]=useState(false),[name,setName]=useState(''),[sector,setSector]=useState(''),[objective,setObjective]=useState(''),[selected,setSelected]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){const [campaigns,companies]=await Promise.all([request<Campaign[]>('/workspace-business/'+orgId+'/campaigns'),request<Account[]>('/workspace-crm/'+orgId+'/accounts')]);setItems(campaigns);setAccounts(companies);}
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Cannot load campaigns.'));},[orgId]);
 async function run(fn:()=>Promise<unknown>,message:string){setBusy(true);setError('');setNotice('');try{await fn();await refresh();setNotice(message);}catch(e){setError(e instanceof Error?e.message:'Campaign action failed.')}finally{setBusy(false)}}
 async function save(e:FormEvent){e.preventDefault();await run(()=>post('/workspace-business/'+orgId+'/campaigns',{name,sector,objective}),'Campaign plan created.');setName('');setSector('');setObjective('');setShow(false);}
 const available=(campaign:Campaign)=>accounts.filter(a=>!campaign.accounts.some(x=>x.account.id===a.id));
 return <section className="tenant-campaigns">
  <PageTop kicker="OUTREACH PLANNING" title="Campaigns" description="Group target accounts, objectives and ownership without creating duplicate prospect records. Campaign membership is planning metadata; sending remains a separate reviewed outreach action." action={<Button onClick={()=>setShow(v=>!v)}><Plus size={16}/>{show?'Close form':'New campaign'}</Button>}/>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner">{notice}</div>}
  {show&&<Panel title="Plan a campaign"><form className="stack-16" onSubmit={save}><div className="field-grid"><Field label="Campaign name"><input required minLength={2} maxLength={150} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Sector"><input required minLength={2} maxLength={100} value={sector} onChange={e=>setSector(e.target.value)}/></Field></div><Field label="Objective (optional)"><input value={objective} onChange={e=>setObjective(e.target.value)} maxLength={1000}/></Field><Button type="submit" loading={busy}>Save campaign</Button></form></Panel>}
  {items.length?<div className="campaign-grid">{items.map(c=><Panel key={c.id} title={c.name} actions={<Badge tone={c.status==='ACTIVE'?'green':c.status==='PAUSED'?'orange':'neutral'}>{c.status}</Badge>}>
   <p className="muted small-text">{c.objective||'No objective added yet'} · {c.sector} · owner {c.owner.name}</p>
   <div className="campaign-controls"><Field label="Campaign status"><BrandSelect value={c.status} onValueChange={status=>void run(()=>patch('/workspace-business/'+orgId+'/campaigns/'+c.id,{status}),'Campaign status updated.')} ariaLabel={'Campaign status '+c.name}><option value="PLANNING">Planning</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="COMPLETED">Completed</option></BrandSelect></Field></div>
   <div className="campaign-enrollment"><div className="survey-builder-head"><strong><UsersRound size={15}/> Target accounts ({c.accounts.length})</strong></div>{c.accounts.length?<div className="campaign-account-chips">{c.accounts.map(x=><span className="ws-chip" key={x.account.id}>{x.account.name}<button type="button" aria-label={'Remove '+x.account.name+' from '+c.name} disabled={busy} onClick={()=>void run(()=>request('/workspace-business/'+orgId+'/campaigns/'+c.id+'/accounts/'+x.account.id,{method:'DELETE'}),'Account removed from campaign.')}><X size={13}/></button></span>)}</div>:<p className="muted small-text">No target accounts enrolled.</p>}
    {!!available(c).length&&<div className="finance-inline-action"><Field label="Add existing prospect/account"><BrandSelect value={selected[c.id]||''} onValueChange={v=>setSelected(x=>({...x,[c.id]:v}))} ariaLabel={'Add account to '+c.name}><option value="">Choose account</option>{available(c).map(a=><option key={a.id} value={a.id}>{a.name} · {a.industry}</option>)}</BrandSelect></Field><Button variant="secondary" disabled={busy||!selected[c.id]} onClick={()=>void run(async()=>{await post('/workspace-business/'+orgId+'/campaigns/'+c.id+'/accounts',{accountId:selected[c.id]});setSelected(x=>({...x,[c.id]:''}));},'Account enrolled in campaign.')}><Target size={14}/>Add</Button></div>}
   </div>
  </Panel>)}</div>:<Panel title="Campaigns"><Empty title="No campaigns yet" description="Create a campaign when you need to organize outreach around a market, service line or strategic account group."/></Panel>}
 </section>;
}
