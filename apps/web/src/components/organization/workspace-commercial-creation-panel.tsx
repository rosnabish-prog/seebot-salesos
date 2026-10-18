'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Button,ErrorMessage,Field} from '@/components/ui';
import {post,request} from '@/lib/api';

type Account={id:string;name:string;domain:string};
type Opportunity={id:string;accountId:string;title:string;stage:string};
type Contract={id:string;opportunityId:string;title:string;type:string};
type Draft={id:string;number:string;status:string};
export function WorkspaceCommercialCreationPanel({orgId,onChanged}:{orgId:string;onChanged:()=>Promise<void>}){
 const [accounts,setAccounts]=useState<Account[]>([]),[opportunities,setOpportunities]=useState<Opportunity[]>([]),[contracts,setContracts]=useState<Contract[]>([]);
 const [accountId,setAccountId]=useState(''),[opportunityId,setOpportunityId]=useState(''),[contractId,setContractId]=useState('');
 const [opportunityTitle,setOpportunityTitle]=useState(''),[service,setService]=useState('Data annotation');
 const [contractTitle,setContractTitle]=useState(''),[contractType,setContractType]=useState('SOW');
 const [description,setDescription]=useState('Annotation services'),[quantity,setQuantity]=useState('1'),[unitPrice,setUnitPrice]=useState('100.00');
 const [currency,setCurrency]=useState('USD'),[billingEmail,setBillingEmail]=useState(''),[dueAt,setDueAt]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [createdContract,setCreatedContract]=useState<Contract|null>(null),[createdDraft,setCreatedDraft]=useState<Draft|null>(null);
 async function refresh(){
  const [a,o,c]=await Promise.all([
   request<Account[]>(`/workspace-crm/${orgId}/accounts`),
   request<Opportunity[]>(`/workspace-business/${orgId}/opportunities`),
   request<Contract[]>(`/workspace-business/${orgId}/contracts`)
  ]);
  setAccounts(a);setOpportunities(o);setContracts(c);
  setAccountId(prev=>a.some(x=>x.id===prev)?prev:(a[0]?.id||''));
 }
 useEffect(()=>{if(orgId)void refresh().catch(e=>setError(e.message));},[orgId]);
 const applicable=opportunities.filter(o=>o.accountId===accountId);
 const chosen=applicable.some(o=>o.id===opportunityId)?opportunityId:(applicable[0]?.id||'');
 const relatedContracts=contracts.filter(c=>applicable.some(o=>o.id===c.opportunityId));
 const selectedContract=relatedContracts.some(c=>c.id===contractId)?contractId:'';
 async function run(work:()=>Promise<any>,message:string){
  setError('');setNotice('');setBusy(true);
  try{await work();await refresh();await onChanged();setNotice(message);}
  catch(e:any){setError(e.message||'Could not save workspace record.');}
  finally{setBusy(false);}
 }
 async function createOpportunity(e:FormEvent){
  e.preventDefault();
  if(!accountId||!opportunityTitle.trim()||!service.trim())return;
  await run(async()=>{
   const result=await post<Opportunity>(`/workspace-business/${orgId}/accounts/${accountId}/opportunities`,{title:opportunityTitle.trim(),serviceLine:service.trim()});
   setOpportunityId(result.id);setOpportunityTitle('');
  },'Opportunity created in the selected workspace.');
 }
 async function createContract(e:FormEvent){
  e.preventDefault();if(!chosen||!contractTitle.trim())return;
  await run(async()=>{
   const result=await post<Contract>(`/workspace-business/${orgId}/opportunities/${chosen}/contracts`,{title:contractTitle.trim(),type:contractType});
   setCreatedContract(result);setContractId(result.id);setContractTitle('');
  },'Draft contract created under the selected opportunity.');
 }
 async function createInvoice(e:FormEvent){
  e.preventDefault();
  if(!accountId||!description.trim()||!billingEmail.trim()||!dueAt)return;
  const qty=Number(quantity),rate=Number(unitPrice);
  if(!Number.isSafeInteger(qty)||qty<1||qty>1000000||!/^\d+(?:\.\d{1,2})?$/.test(unitPrice)||!Number.isFinite(rate)||rate<=0){setError('Use a whole-number quantity and positive price with up to two decimal places.');return;}
  const subtotal=(qty*rate).toFixed(2);
  await run(async()=>{
   const result=await post<Draft>(`/workspace-business/${orgId}/accounts/${accountId}/invoices`,{
    lineItems:[{description:description.trim(),quantity:qty,unitPrice}],subtotal,tax:'0.00',total:subtotal,
    currency:currency.toUpperCase(),billingEmail:billingEmail.trim(),dueAt,contractId:selectedContract||undefined
   });
   setCreatedDraft(result);
  },'Invoice draft created. Finance must apply and approve a tax rule before it can be issued.');
 }
 return <section className="panel" style={{padding:22,marginBottom:18}}>
  <h2>Prospect → opportunity → contract → invoice draft</h2>
  <p className="muted small-text">Choose an existing workspace prospect; no copying internal record IDs. Creating an opportunity starts at Account Researched. A contract and invoice are drafts until reviewed and approved. This developer preview uses fictional records.</p>
  <ErrorMessage message={error}/>{notice&&<p role="status">{notice}</p>}
  <Field label="Workspace prospect"><select aria-label="Workspace prospect" value={accountId} onChange={e=>{setAccountId(e.target.value);setOpportunityId('');setCreatedContract(null);setContractId('');setCreatedDraft(null);}}>
   {!accounts.length&&<option value="">Add a prospect on the previous page first</option>}
   {accounts.map(a=><option key={a.id} value={a.id}>{a.name} ({a.domain})</option>)}
  </select></Field>
  <form className="stack-16" onSubmit={createOpportunity} style={{marginTop:16}}>
   <h3>1. New opportunity</h3>
   <div className="field-grid"><Field label="Opportunity title"><input value={opportunityTitle} required onChange={e=>setOpportunityTitle(e.target.value)}/></Field>
    <Field label="Service line"><input value={service} required onChange={e=>setService(e.target.value)}/></Field></div>
   <Button loading={busy} disabled={busy||!accountId||!opportunityTitle.trim()}>Create opportunity</Button>
  </form>
  <form className="stack-16" onSubmit={createContract} style={{marginTop:20}}>
   <h3>2. Draft contract</h3>
   <Field label="Opportunity for contract"><select value={chosen} onChange={e=>setOpportunityId(e.target.value)}>{!applicable.length&&<option value="">Create an opportunity first</option>}{applicable.map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select></Field>
   <div className="field-grid"><Field label="Contract title"><input required value={contractTitle} onChange={e=>setContractTitle(e.target.value)}/></Field>
    <Field label="Contract type"><select value={contractType} onChange={e=>setContractType(e.target.value)}><option>NDA</option><option>MSA</option><option>SOW</option><option>DPA</option><option value="PRODUCTION_OTHER">Other</option></select></Field></div>
   <Button variant="secondary" loading={busy} disabled={busy||!chosen||!contractTitle.trim()}>Create draft contract</Button>
   {createdContract&&<p className="muted small-text">Draft contract: {createdContract.title} ({createdContract.type}). It is not signed.</p>}
  </form>
  <form className="stack-16" onSubmit={createInvoice} style={{marginTop:20}}>
   <h3>3. Create invoice draft</h3>
   <p className="muted small-text">Start with one line item. Finance will apply an approved organization tax rule and lock the reviewed totals below.</p>
   <Field label="Contract (optional)"><select value={selectedContract} onChange={e=>setContractId(e.target.value)}><option value="">No contract linked yet</option>{relatedContracts.map(c=><option key={c.id} value={c.id}>{c.title} ({c.type})</option>)}</select></Field>
   <Field label="Invoice description"><input required value={description} onChange={e=>setDescription(e.target.value)}/></Field>
   <div className="field-grid">
    <Field label="Quantity"><input required type="number" min="1" max="1000000" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>
    <Field label="Unit price"><input required type="number" min="0.01" step="0.01" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)}/></Field>
    <Field label="Currency"><input required maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></Field>
    <Field label="Billing email"><input required type="email" value={billingEmail} onChange={e=>setBillingEmail(e.target.value)}/></Field>
    <Field label="Due date"><input required type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></Field>
   </div>
   <Button variant="secondary" loading={busy} disabled={busy||!accountId||!description.trim()||!billingEmail.trim()||!dueAt}>Create invoice draft</Button>
   {createdDraft&&<p className="muted small-text">Draft {createdDraft.number} created. Select it in Finance tax rules below to apply a rate.</p>}
  </form>
 </section>;
}
