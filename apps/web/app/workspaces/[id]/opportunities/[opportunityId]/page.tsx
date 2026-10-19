'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import type {StageId} from '@seebot/shared';
import {request,post} from '@/lib/api';
import {Badge,BrandSelect,Button,ErrorMessage,Field,PageTop,Panel} from '@/components/ui';
import {OpportunityIntelligence} from '@/components/opportunity-intelligence';
type Opportunity={id:string;title:string;stage:StageId;status:string;serviceLine:string;account:{name:string;domain:string};stageVisits:{id:string;stage:string;evidence:Record<string,string>}[];contracts:{id:string;title:string;status:string}[]};
type StageField={key:string;label:string;type:'text'|'textarea'|'date'|'select'|'checkbox';required?:boolean;options?:string[];help?:string;autoFill?:string};
type StageConfig={id:StageId;label:string;short:string;fields:StageField[]};
type StageState={missing:string[];ready:boolean;evidence:Record<string,string>;prefill:Record<string,string>;visitId:string;stage:StageConfig};
export default function TenantOpportunity(){
 const params=useParams(),org=String(params.id||''),id=String(params.opportunityId||'');
 const [deal,setDeal]=useState<Opportunity|null>(null),[state,setState]=useState<StageState|null>(null),[fields,setFields]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[intelligence,setIntelligence]=useState<'research'|'contacts'|'outreach'>('research');
 async function refresh(){
  const [record,stage]=await Promise.all([request<Opportunity>('/workspace-business/'+org+'/opportunities/'+id),request<StageState>('/workspace-business/'+org+'/opportunities/'+id+'/stage-state')]);
  setDeal(record);setState(stage);
  const merged={...(stage.prefill||{}),...(stage.evidence||{})};
  setFields(Object.fromEntries(Object.entries(merged).map(([key,value])=>[key,String(value??'')])));
  setLoading(false);
 }
 useEffect(()=>{void refresh().catch(e=>{setError(e instanceof Error?e.message:'Unable to load opportunity.');setLoading(false);});},[org,id]);
 async function submit(e:FormEvent){e.preventDefault();setSaving(true);setError('');setNotice('');
  try{const out=await post<{advanced:boolean;stage:string;missing:string[]}>('/workspace-business/'+org+'/opportunities/'+id+'/evidence',{fields});await refresh();setNotice(out.advanced?'Stage advanced after validating requirements.':'Evidence saved. See remaining requirements below.');}
  catch(e){setError(e instanceof Error?e.message:'Could not save evidence.');}finally{setSaving(false);}
 }
 if(loading)return <section className="panel">Loading opportunity…</section>;
 const current=state?.stage;
 return <section className="tenant-opportunity">
  <Link className="text-link" href={'/workspaces/'+org+'/pipeline'}>← Kanban Pipeline</Link>
  <PageTop kicker="PIPELINE OPPORTUNITY" title={deal?.account.name||'Opportunity'} description={deal?.title||''}/>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner" role="status">{notice}</div>}
  {deal&&<div className="tenant-dashboard-grid">
   <Panel title="Opportunity status"><div className="tenant-kpi-rows"><div><span>Stage</span><strong>{current?.label||deal.stage}</strong></div><div><span>Status</span><Badge>{deal.status}</Badge></div><div><span>Service line</span><strong>{deal.serviceLine}</strong></div><div><span>Prospect domain</span><strong>{deal.account.domain}</strong></div></div><p className="muted small-text">Transitions combine your workspace evidence fields with non-bypassable system checks such as contacts, logged outreach, proposals and signed contracts.</p></Panel>
   <Panel title="Stage requirements"><p className="muted small-text">Missing checks must be resolved before a normal transition.</p>{state?.missing.length?<div className="tenant-requirements">{state.missing.map((message,i)=><div className="record-row" key={message+i}>{message}</div>)}</div>:<div className="soft-callout">No missing requirements for this stage.</div>}</Panel>
  </div>}
  {deal&&current&&current.fields.length>0&&<Panel title="Stage evidence"><p className="muted small-text">Fields marked as auto-pulled are suggested from existing CRM data. Review them before saving; SalesOS does not silently treat suggested values as verified evidence.</p><form className="stack-16" onSubmit={submit}>{current.fields.map(field=><Field key={field.key} label={field.label+(field.required?' *':'')}>
   {field.help&&<small className="field-help">{field.help}{field.autoFill?' · Auto-pull: '+field.autoFill:''}</small>}
   {field.type==='select'?<BrandSelect value={fields[field.key]||''} onValueChange={v=>setFields(x=>({...x,[field.key]:v}))} ariaLabel={field.label}><option value="">Choose an option</option>{(field.options||[]).map(option=><option key={option} value={option}>{option}</option>)}</BrandSelect>
   :field.type==='textarea'?<textarea rows={3} maxLength={5000} value={fields[field.key]||''} onChange={e=>setFields(x=>({...x,[field.key]:e.target.value}))}/>
   :field.type==='checkbox'?<label className="checkbox-line"><input type="checkbox" checked={fields[field.key]==='true'} onChange={e=>setFields(x=>({...x,[field.key]:e.target.checked?'true':'false'}))}/>Confirmed</label>
   :<input type={field.type==='date'?'date':'text'} maxLength={5000} value={fields[field.key]||''} onChange={e=>setFields(x=>({...x,[field.key]:e.target.value}))}/>}
  </Field>)}<Button loading={saving} type="submit">Save & validate stage</Button></form></Panel>}
  {deal&&<Panel title="Sales intelligence & outreach"><div className="segmented-control" role="tablist" aria-label="Sales intelligence section"><button type="button" role="tab" aria-selected={intelligence==='research'} className={intelligence==='research'?'selected':''} onClick={()=>setIntelligence('research')}>Research</button><button type="button" role="tab" aria-selected={intelligence==='contacts'} className={intelligence==='contacts'?'selected':''} onClick={()=>setIntelligence('contacts')}>Contacts</button><button type="button" role="tab" aria-selected={intelligence==='outreach'} className={intelligence==='outreach'?'selected':''} onClick={()=>setIntelligence('outreach')}>Outreach</button></div><OpportunityIntelligence accountId={deal.account.id} orgId={org} section={intelligence} editable={deal.status==='OPEN'}/></Panel>}
  {deal&&<Panel title="Contracts">{deal.contracts.length?deal.contracts.map(c=><div className="record-row" key={c.id}><strong>{c.title}</strong><Badge>{c.status}</Badge></div>):<p className="muted small-text">No contracts yet. Create a draft only when the opportunity reaches a contracting step.</p>}<Link className="text-link" href={'/workspaces/'+org+'/business'}>Go to contracts & finance</Link></Panel>}
 </section>;
}
