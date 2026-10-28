'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';

type Records={activities:{id:string;type:string;outcome:string;note:string}[];proposals:{id:string;title:string;status:string;amount:string;currency:string}[]};
export function TenantSalesActions({orgId,opportunityId,editable,onChanged}:{orgId:string;opportunityId:string;editable:boolean;onChanged:()=>Promise<void>}){
 const base='/workspace-business/'+orgId+'/opportunities/'+opportunityId;
 const [records,setRecords]=useState<Records>({activities:[],proposals:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[role,setRole]=useState('VIEWER');
 const [activity,setActivity]=useState({type:'CALL',outcome:'OUTBOUND',note:''});
 const [proposal,setProposal]=useState({title:'',amount:'',currency:'USD',status:'SENT',acceptanceCriteria:''});
 async function load(){setRecords(await request<Records>(base+'/sales-records'));}
 useEffect(()=>{void Promise.all([load(),request<{role:string}>('/workspaces/'+orgId+'/profile').then(p=>setRole(p.role))]).catch(e=>setError(e.message));},[base]);
 async function save(e:FormEvent,kind:'activities'|'proposals'){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  try{await post(base+'/'+kind,kind==='activities'?activity:proposal);await load();await onChanged();setNotice(kind==='activities'?'Activity recorded. Pipeline requirements rechecked.':'Proposal recorded. Pipeline requirements rechecked.');if(kind==='activities')setActivity(a=>({...a,note:''}));}
  catch(e){setError(e instanceof Error?e.message:'Could not save sales record.');}finally{setBusy(false);}
 }
 return <Panel title="Sales activities & proposals"><ErrorMessage message={error}/>{notice&&<p role="status" className="success-banner">{notice}</p>}
  <p className="muted small-text">Record actual outreach, buyer responses and proposal evidence. Demo emails and simulated replies do not satisfy sales gates.</p>
  {editable&&['OWNER','ADMIN','MEMBER'].includes(role)&&<form className="commercial-action-form" onSubmit={e=>void save(e,'activities')}><div className="field-grid">
   <Field label="Activity channel"><BrandSelect value={activity.type} onValueChange={type=>setActivity(a=>({...a,type}))}>{['CALL','EMAIL','MEETING','LINKEDIN','NOTE','OTHER'].map(v=><option key={v} value={v}>{v}</option>)}</BrandSelect></Field>
   <Field label="Activity outcome"><BrandSelect value={activity.outcome} onValueChange={outcome=>setActivity(a=>({...a,outcome}))}>{['OUTBOUND','POSITIVE','NEUTRAL','NEGATIVE','NO_RESPONSE','OPTED_OUT','BOUNCED'].map(v=><option key={v} value={v}>{v}</option>)}</BrandSelect></Field>
  </div><Field label="Activity evidence notes"><textarea required minLength={3} maxLength={5000} value={activity.note} onChange={e=>setActivity(a=>({...a,note:e.target.value}))}/></Field><Button loading={busy}>Record sales activity</Button></form>}
  {records.activities.map(a=><div key={a.id} className="record-row"><div><strong>{a.type} · {a.outcome}</strong><p>{a.note}</p></div></div>)}
  {editable&&['OWNER','ADMIN','MEMBER'].includes(role)&&<form className="commercial-action-form" onSubmit={e=>void save(e,'proposals')}><div className="field-grid"><Field label="Proposal title"><input required minLength={3} maxLength={200} value={proposal.title} onChange={e=>setProposal(p=>({...p,title:e.target.value}))}/></Field><Field label="Proposal fee"><input required type="number" min="0" step="0.01" value={proposal.amount} onChange={e=>setProposal(p=>({...p,amount:e.target.value}))}/></Field><Field label="Proposal currency"><input required maxLength={3} pattern="[A-Z]{3}" value={proposal.currency} onChange={e=>setProposal(p=>({...p,currency:e.target.value.toUpperCase()}))}/></Field><Field label="Proposal status"><BrandSelect value={proposal.status} onValueChange={status=>setProposal(p=>({...p,status}))}>{['DRAFT','SENT','ACCEPTED','DECLINED'].map(v=><option key={v} value={v}>{v}</option>)}</BrandSelect></Field></div><Field label="Proposal acceptance criteria"><textarea required minLength={10} maxLength={5000} value={proposal.acceptanceCriteria} onChange={e=>setProposal(p=>({...p,acceptanceCriteria:e.target.value}))}/></Field><Button loading={busy}>Record proposal</Button></form>}
  {records.proposals.map(p=><div key={p.id} className="record-row"><strong>{p.title}</strong><span>{p.currency} {p.amount}</span><Badge>{p.status}</Badge></div>)}
 </Panel>;
}
