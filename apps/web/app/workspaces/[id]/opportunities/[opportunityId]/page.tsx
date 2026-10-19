'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {STAGES,STAGE_FIELDS,type StageId} from '@seebot/shared';
import {request,post} from '@/lib/api';
import {Badge,BrandSelect,Button,ErrorMessage,Field,PageTop,Panel} from '@/components/ui';
type Opportunity={id:string;title:string;stage:StageId;status:string;serviceLine:string;account:{name:string;domain:string};stageVisits:{id:string;stage:string;evidence:Record<string,string>}[];contracts:{id:string;title:string;status:string}[]};
type StageState={missing:string[];ready:boolean;evidence:Record<string,string>;visitId:string};
export default function TenantOpportunity(){
 const params=useParams(),org=String(params.id||''),id=String(params.opportunityId||'');
 const [deal,setDeal]=useState<Opportunity|null>(null),[state,setState]=useState<StageState|null>(null),[fields,setFields]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){
  const [record,stage]=await Promise.all([request<Opportunity>('/workspace-business/'+org+'/opportunities/'+id),request<StageState>('/workspace-business/'+org+'/opportunities/'+id+'/stage-state')]);
  setDeal(record);setState(stage);setFields(Object.fromEntries(Object.entries(stage.evidence||{}).map(([key,value])=>[key,String(value??'')])));setLoading(false);
 }
 useEffect(()=>{void refresh().catch(e=>{setError(e instanceof Error?e.message:'Unable to load opportunity.');setLoading(false);});},[org,id]);
 async function submit(e:FormEvent){e.preventDefault();setSaving(true);setError('');setNotice('');
  try{const out=await post<{advanced:boolean;stage:string;missing:string[]}>('/workspace-business/'+org+'/opportunities/'+id+'/evidence',{fields});await refresh();setNotice(out.advanced?'Stage advanced after validating requirements.':'Evidence saved. See remaining requirements below.');}
  catch(e){setError(e instanceof Error?e.message:'Could not save evidence.');}finally{setSaving(false);}
 }
 if(loading)return <section className="panel">Loading opportunity…</section>;
 return <section className="tenant-opportunity">
  <Link className="text-link" href={'/workspaces/'+org+'/pipeline'}>← Kanban Pipeline</Link>
  <PageTop kicker="PIPELINE OPPORTUNITY" title={deal?.account.name||'Opportunity'} description={deal?.title||''}/>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner" role="status">{notice}</div>}
  {deal&&<div className="tenant-dashboard-grid">
   <Panel title="Opportunity status"><div className="tenant-kpi-rows"><div><span>Stage</span><strong>{STAGES.find(s=>s.id===deal.stage)?.label||deal.stage}</strong></div><div><span>Status</span><Badge>{deal.status}</Badge></div><div><span>Service line</span><strong>{deal.serviceLine}</strong></div><div><span>Prospect domain</span><strong>{deal.account.domain}</strong></div></div><p className="muted small-text">Transitions follow evidence and customer-interaction requirements. Some stages cannot be completed through text fields alone.</p></Panel>
   <Panel title="Stage requirements"><p className="muted small-text">Missing checks must be resolved before a normal transition.</p>{state?.missing.length?<div className="tenant-requirements">{state.missing.map((message,i)=><div className="record-row" key={message+i}>{message}</div>)}</div>:<div className="soft-callout">No missing requirements for this stage.</div>}</Panel>
  </div>}
  {deal&&STAGE_FIELDS[deal.stage]?.length>0&&<Panel title="Stage evidence"><form className="stack-16" onSubmit={submit}>{STAGE_FIELDS[deal.stage].map(field=><Field key={field.key} label={field.label+(field.required?' *':'')}>
   {field.type==='select'?<BrandSelect value={fields[field.key]||''} onValueChange={v=>setFields(x=>({...x,[field.key]:v}))} ariaLabel={field.label}><option value="">Choose an option</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}</BrandSelect>
   :field.type==='textarea'?<textarea rows={3} maxLength={5000} value={fields[field.key]||''} onChange={e=>setFields(x=>({...x,[field.key]:e.target.value}))}/>
   :<input type={field.type==='date'?'date':'text'} maxLength={5000} value={fields[field.key]||''} onChange={e=>setFields(x=>({...x,[field.key]:e.target.value}))}/>}
  </Field>)}<Button loading={saving} type="submit">Save stage evidence</Button></form></Panel>}
  {deal&&<Panel title="Contracts">{deal.contracts.length?deal.contracts.map(c=><div className="record-row" key={c.id}><strong>{c.title}</strong><Badge>{c.status}</Badge></div>):<p className="muted small-text">No contracts yet. You can create a draft from Contracts & Finance.</p>}<Link className="text-link" href={'/workspaces/'+org+'/business'}>Go to contracts & finance</Link></Panel>}
 </section>;
}
