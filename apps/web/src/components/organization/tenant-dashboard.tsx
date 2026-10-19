'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {BriefcaseBusiness,Building2,Trophy,FileSignature,Plus,ArrowUpRight,KanbanSquare,ShieldCheck} from 'lucide-react';
import {request} from '@/lib/api';
import {MetricCard,Bars} from '@/components/charts';
import {Panel,PageTop,ErrorMessage,Button,Badge,Empty} from '@/components/ui';
import {useAuth} from '@/context/auth';

type Summary={organizationId:string;mode:string;accounts:number;clients:number;opportunities:number;contracts:number;invoices:number;invoicedByCurrency:Record<string,number>};
type Deal={id:string;title:string;stage:string;status:string;updatedAt:string;account:{id:string;name:string;industry:string};currency:string;estimatedAmount:string|null};
type Profile={organization:{name:string};role:string};
type PipelineConfig={stages:{id:string;label:string}[]};
export function TenantDashboard({executiveView=false}:{executiveView?:boolean}){
 const params=useParams(),id=String(params.id||''),{user}=useAuth();
 const [data,setData]=useState<Summary|null>(null),[deals,setDeals]=useState<Deal[]>([]),[profile,setProfile]=useState<Profile|null>(null),[pipeline,setPipeline]=useState<PipelineConfig|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;setBusy(true);setError('');
  void Promise.all([request<Summary>('/workspace-business/'+id+'/dashboard'),request<Deal[]>('/workspace-business/'+id+'/opportunities'),request<Profile>('/workspaces/'+id+'/profile'),request<PipelineConfig>('/workspace-pipeline/'+id)])
   .then(([metrics,dealsList,info,pipelineConfig])=>{if(active){setData(metrics);setDeals(dealsList);setProfile(info);setPipeline(pipelineConfig);}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load company dashboard.');})
   .finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[id]);
 const counts=useMemo(()=>(pipeline?.stages||[]).map(stage=>({stage:stage.label,count:deals.filter(d=>d.stage===stage.id).length})),[deals,pipeline]);
 const stageLabel=(id:string)=>pipeline?.stages.find(stage=>stage.id===id)?.label||id;
 const won=deals.filter(d=>d.status==='CLOSED_WON'||d.stage==='CLOSED_WON').length;
 const open=deals.filter(d=>d.status==='OPEN').length;
 const leadership=['OWNER','ADMIN'].includes(profile?.role||'');
 if(executiveView&&!busy&&!leadership)return <ErrorMessage message="Executive Overview is available to workspace administrators."/>;
 const home='/workspaces/'+id;
 return <section className="tenant-dashboard">
  <PageTop kicker={executiveView?'LEADERSHIP INTELLIGENCE':'YOUR SALES WORKSPACE'} title={executiveView?'Executive Overview':`Good morning${user?.name?', '+user.name.split(' ')[0]:''}`} description={executiveView?`Company performance for ${profile?.organization.name||'your workspace'}, based only on this company's data.`:'Here is what needs attention across your company sales pipeline.'} action={<Link className="btn btn-primary" href={home+'/accounts'}><Plus size={16}/> Create New</Link>}/>
  {data?.mode==='DEMO_ONLY'&&<p className="tenant-preview-message"><ShieldCheck size={17}/> Private development preview · fictional test data only</p>}
  <ErrorMessage message={error}/>
  {busy?<div className="dashboard-skeleton" aria-busy="true"><div className="skeleton-metrics">{[0,1,2,3].map(i=><div key={i} className="skeleton skeleton-card"/>)}</div></div>:data&&<>
   <div className="metrics-grid">
    <MetricCard label="Active Opportunities" value={open} icon={<BriefcaseBusiness size={21}/>} sub="Open deals in this workspace"/>
    <MetricCard label="New Prospects" value={data.accounts} icon={<Building2 size={21}/>} sub="Total recorded company prospects"/>
    <MetricCard label="Deals Won" value={won} icon={<Trophy size={21}/>} sub="Closed Won opportunities"/>
    <MetricCard label="Contracts" value={data.contracts} icon={<FileSignature size={21}/>} sub="Total contracts (all statuses)"/>
   </div>
   <div className="tenant-dashboard-grid">
    <Panel title="Pipeline by stage"><Bars data={counts} labels="stage" values="count" maxItems={pipeline?.stages.length||11}/><div className="tenant-panel-action"><Link href={home+'/pipeline'} className="text-link">Open Kanban Pipeline <ArrowUpRight size={14}/></Link></div></Panel>
    <Panel title="Recently updated opportunities">
     {deals.length?<div className="tenant-recent-deals">{deals.slice(0,6).map(d=><Link key={d.id} href={home+'/opportunities/'+d.id} className="record-row"><div><strong>{d.account.name}</strong><p>{d.title}</p><small>{stageLabel(d.stage)}</small></div><ArrowUpRight size={17}/></Link>)}</div>:<Empty title="No opportunities yet" description="Add a prospect when you're ready. SalesOS creates its first engagement in Account Researched." action={<Link className="btn btn-secondary" href={home+'/accounts'}>Add a prospect</Link>}/>}
    </Panel>
   </div>
   {executiveView&&<div className="tenant-dashboard-grid">
    <Panel title="Commercial overview"><div className="tenant-kpi-rows"><div><span>Prospects</span><strong>{data.accounts}</strong></div><div><span>Customers</span><strong>{data.clients}</strong></div><div><span>Opportunities</span><strong>{data.opportunities}</strong></div><div><span>Contracts</span><strong>{data.contracts}</strong></div><div><span>Invoices (all statuses)</span><strong>{data.invoices}</strong></div></div><Link className="text-link" href={home+'/business'}>Open business & finance <ArrowUpRight size={14}/></Link></Panel>
    <Panel title="Invoiced by currency"><p className="muted small-text">Only non-draft, non-void invoices are included; currencies are never combined.</p>{Object.entries(data.invoicedByCurrency).map(([currency,amount])=><div className="tenant-money-row" key={currency}><Badge>{currency}</Badge><strong>{new Intl.NumberFormat('en-US',{style:'currency',currency}).format(amount)}</strong></div>)}{!Object.keys(data.invoicedByCurrency).length&&<Empty title="No issued invoices" description="Amounts will appear after a reviewed invoice is issued."/>}</Panel>
   </div>}
  </>}
 </section>;
}
