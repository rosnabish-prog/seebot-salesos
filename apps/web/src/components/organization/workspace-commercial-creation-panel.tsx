'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {BriefcaseBusiness,FileSignature,Plus,ReceiptText} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';

type Account={id:string;name:string;domain:string};
type Opportunity={id:string;accountId:string;title:string;stage:string;status:string};
type Contract={id:string;opportunityId:string;title:string;type:string;status?:string};
type Draft={id:string;number:string;status:string};
export function WorkspaceCommercialCreationPanel({orgId,onChanged}:{orgId:string;onChanged:()=>Promise<void>}){
 const [accounts,setAccounts]=useState<Account[]>([]),[opportunities,setOpportunities]=useState<Opportunity[]>([]),[contracts,setContracts]=useState<Contract[]>([]);
 const [mode,setMode]=useState<'opportunity'|'contract'|'invoice'|null>(null),[accountId,setAccountId]=useState(''),[opportunityId,setOpportunityId]=useState(''),[contractId,setContractId]=useState('');
 const [opportunityTitle,setOpportunityTitle]=useState(''),[service,setService]=useState(''),[contractTitle,setContractTitle]=useState(''),[contractType,setContractType]=useState('SOW');
 const [description,setDescription]=useState(''),[quantity,setQuantity]=useState('1'),[unitPrice,setUnitPrice]=useState(''),[currency,setCurrency]=useState('USD'),[billingEmail,setBillingEmail]=useState(''),[dueAt,setDueAt]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){
  const [a,o,c]=await Promise.all([request<Account[]>('/workspace-crm/'+orgId+'/accounts'),request<Opportunity[]>('/workspace-business/'+orgId+'/opportunities'),request<Contract[]>('/workspace-business/'+orgId+'/contracts')]);
  setAccounts(a);setOpportunities(o);setContracts(c);setAccountId(prev=>a.some(x=>x.id===prev)?prev:(a[0]?.id||''));
 }
 useEffect(()=>{if(orgId)void refresh().catch(e=>setError(e instanceof Error?e.message:'Unable to load commercial records.'));},[orgId]);
 const applicable=opportunities.filter(o=>o.accountId===accountId&&o.status==='OPEN');
 const chosen=applicable.some(o=>o.id===opportunityId)?opportunityId:(applicable[0]?.id||'');
 const relatedContracts=contracts.filter(c=>applicable.some(o=>o.id===c.opportunityId));
 const selectedContract=relatedContracts.some(c=>c.id===contractId)?contractId:'';
 async function run(work:()=>Promise<unknown>,message:string){setError('');setNotice('');setBusy(true);try{await work();await refresh();await onChanged();setNotice(message);setMode(null);}catch(e){setError(e instanceof Error?e.message:'Could not save commercial record.');}finally{setBusy(false)}}
 async function createOpportunity(e:FormEvent){e.preventDefault();if(!accountId||!opportunityTitle.trim()||!service.trim())return;await run(async()=>{await post('/workspace-business/'+orgId+'/accounts/'+accountId+'/opportunities',{title:opportunityTitle.trim(),serviceLine:service.trim()});setOpportunityTitle('');setService('');},'Opportunity created at the first configured pipeline stage.');}
 async function createContract(e:FormEvent){e.preventDefault();if(!chosen||!contractTitle.trim())return;await run(async()=>{await post('/workspace-business/'+orgId+'/opportunities/'+chosen+'/contracts',{title:contractTitle.trim(),type:contractType});setContractTitle('');},'Draft contract created under the selected opportunity.');}
 async function createInvoice(e:FormEvent){e.preventDefault();if(!accountId||!description.trim()||!billingEmail.trim()||!dueAt)return;const qty=Number(quantity),rate=Number(unitPrice);if(!Number.isSafeInteger(qty)||qty<1||qty>1000000||!/^\d+(?:\.\d{1,2})?$/.test(unitPrice)||!Number.isFinite(rate)||rate<=0){setError('Use a whole-number quantity and positive price with up to two decimal places.');return;}const subtotal=(qty*rate).toFixed(2);await run(async()=>{await post('/workspace-business/'+orgId+'/accounts/'+accountId+'/invoices',{lineItems:[{description:description.trim(),quantity:qty,unitPrice}],subtotal,tax:'0.00',total:subtotal,currency,billingEmail:billingEmail.trim(),dueAt,contractId:selectedContract||undefined});setDescription('');setUnitPrice('');},'Invoice draft created. Finance review is required before approval and issue.');}
 return <Panel title="Create commercial record" actions={<Badge>Optional actions</Badge>}>
  <p className="muted small-text">Use the record you need now. SalesOS does not force opportunity, contract and invoice creation in one sequence.</p>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner" role="status">{notice}</div>}
  <div className="commercial-action-grid">
   <button type="button" className={'commercial-action-card '+(mode==='opportunity'?'active':'')} onClick={()=>setMode(mode==='opportunity'?null:'opportunity')}><BriefcaseBusiness size={20}/><span><strong>New opportunity</strong><small>Start another sales engagement for an existing account</small></span><Plus size={16}/></button>
   <button type="button" className={'commercial-action-card '+(mode==='contract'?'active':'')} onClick={()=>setMode(mode==='contract'?null:'contract')}><FileSignature size={20}/><span><strong>Draft contract</strong><small>Attach NDA, MSA, SOW, DPA or production agreement</small></span><Plus size={16}/></button>
   <button type="button" className={'commercial-action-card '+(mode==='invoice'?'active':'')} onClick={()=>setMode(mode==='invoice'?null:'invoice')}><ReceiptText size={20}/><span><strong>Invoice draft</strong><small>Create billing lines only when commercial work requires it</small></span><Plus size={16}/></button>
  </div>
  {mode&&<div className="commercial-action-form">
   <Field label="Company account"><BrandSelect value={accountId} onValueChange={v=>{setAccountId(v);setOpportunityId('');setContractId('')}} ariaLabel="Company account"><option value="">Select company</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.domain}</option>)}</BrandSelect></Field>
   {mode==='opportunity'&&<form className="stack-16" onSubmit={createOpportunity}><div className="field-grid"><Field label="Opportunity title"><input required value={opportunityTitle} onChange={e=>setOpportunityTitle(e.target.value)} placeholder="Production annotation program"/></Field><Field label="Service line"><input required value={service} onChange={e=>setService(e.target.value)} placeholder="Computer vision annotation"/></Field></div><Button loading={busy} disabled={!accountId}>Create opportunity</Button></form>}
   {mode==='contract'&&<form className="stack-16" onSubmit={createContract}><Field label="Opportunity"><BrandSelect value={chosen} onValueChange={setOpportunityId} ariaLabel="Opportunity for contract"><option value="">Select opportunity</option>{applicable.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</BrandSelect></Field><div className="field-grid"><Field label="Contract title"><input required value={contractTitle} onChange={e=>setContractTitle(e.target.value)} placeholder="Pilot statement of work"/></Field><Field label="Contract type"><BrandSelect value={contractType} onValueChange={setContractType}><option value="NDA">NDA</option><option value="MSA">MSA</option><option value="SOW">SOW</option><option value="DPA">DPA</option><option value="PRODUCTION_OTHER">Production / other</option></BrandSelect></Field></div><Button loading={busy} disabled={!chosen}>Create draft contract</Button></form>}
   {mode==='invoice'&&<form className="stack-16" onSubmit={createInvoice}><Field label="Contract (optional)"><BrandSelect value={selectedContract} onValueChange={setContractId}><option value="">No linked contract</option>{relatedContracts.map(c=><option key={c.id} value={c.id}>{c.title} · {c.type}</option>)}</BrandSelect></Field><Field label="Line description"><input required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Annotation services"/></Field><div className="field-grid"><Field label="Quantity"><input required type="number" min="1" max="1000000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field><Field label="Unit price"><input required type="number" min="0.01" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)}/></Field><Field label="Currency"><BrandSelect value={currency} onValueChange={setCurrency}><option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option><option value="NPR">NPR</option><option value="INR">INR</option><option value="CAD">CAD</option><option value="AUD">AUD</option></BrandSelect></Field><Field label="Billing email"><input required type="email" value={billingEmail} onChange={e=>setBillingEmail(e.target.value)}/></Field><Field label="Due date"><input required type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></Field></div><Button loading={busy} disabled={!accountId}>Create invoice draft</Button></form>}
  </div>}
 </Panel>;
}
