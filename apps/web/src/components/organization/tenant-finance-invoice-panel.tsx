'use client';
import {useEffect,useState} from 'react';
import {Button,ErrorMessage,Field} from '@/components/ui';
import {post,request} from '@/lib/api';
type Invoice={id:string;number:string;status:string;currency:string;total:string};
type History={status:string;amountRemainingMinor:number;payments:{id:string;amount:string;reference:string;paidAt:string}[]};
export function TenantFinanceInvoicePanel({orgId,invoices}:{orgId:string;invoices:Invoice[]}){
 const [rows,setRows]=useState(invoices),[id,setId]=useState(''),[amount,setAmount]=useState(''),[paidAt,setPaidAt]=useState(new Date().toISOString().slice(0,10)),[reference,setReference]=useState('');
 const [history,setHistory]=useState<History|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setRows(invoices);},[invoices]);
 const selected=rows.find(i=>i.id===id);
 const root=`/workspace-finance/${orgId}/invoices/${id}`;
 async function refresh(){
  setRows(await request<Invoice[]>(`/workspace-business/${orgId}/invoices`));
  if(id)try{setHistory(await request<History>(root+'/payment-history'));}catch{setHistory(null);}
 }
 async function run(fn:()=>Promise<any>){
  setBusy(true);setError('');setMessage('');
  try{const result=await fn();setMessage(result?.note||result?.notice||result?.status||'Finance record saved.');await refresh();}
  catch(e:any){setError(e.message||'Finance operation failed.');}finally{setBusy(false);}
 }
 async function download(){
  setBusy(true);setError('');
  try{const api=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000';
   const res=await fetch(`${api}/api${root}/pdf`,{credentials:'include'});
   if(!res.ok)throw Error('Issued invoice PDF is unavailable.');
   const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');
   a.href=url;a.download=(selected?.number||'invoice')+'.pdf';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="panel" style={{padding:22,marginTop:18}}>
  <h2>Invoice approval, delivery & payments</h2>
  <p className="muted small-text">Finance confirms tax treatment before approval. Issuing creates an archived PDF and balanced journal. Email requires a connected Gmail account. Payments are entered manually with date, amount and reference; bank feeds are not required.</p>
  <ErrorMessage message={error}/>{message&&<p role="status">{message}</p>}
  <Field label="Invoice"><select value={id} onChange={e=>{setId(e.target.value);setHistory(null)}}><option value="">Choose invoice</option>{rows.map(row=><option key={row.id} value={row.id}>{row.number} · {row.status} · {row.currency} {row.total}</option>)}</select></Field>
  {selected&&<div className="stack-16">
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {selected.status==='DRAFT'&&<Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post(root+'/approve',{}))}>Approve reviewed draft</Button>}
    {selected.status==='APPROVED'&&<Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post(root+'/issue',{}))}>Generate issued PDF</Button>}
    {['APPROVED','SENT','PARTIALLY_PAID','PAID'].includes(selected.status)&&<Button variant="secondary" disabled={busy} onClick={()=>void download()}>Download issued PDF</Button>}
    {selected.status==='APPROVED'&&<Button disabled={busy} onClick={()=>void run(()=>post(root+'/email',{}))}>Send invoice through Gmail</Button>}
   </div>
   {selected.status==='APPROVED'&&<div className="field-grid">
    <Field label="External sending reference"><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Recorded proof of manual sending"/></Field>
    <Button variant="secondary" disabled={busy||reference.trim().length<5} onClick={()=>void run(()=>post(root+'/record-external-send',{reference}))}>Confirm actually sent outside SalesOS</Button>
   </div>}
   {['SENT','PARTIALLY_PAID'].includes(selected.status)&&<div className="field-grid">
    <Field label="Received payment amount"><input type="number" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></Field>
    <Field label="Payment date"><input type="date" value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></Field>
    <Field label="Verified payment reference"><input value={reference} onChange={e=>setReference(e.target.value)}/></Field>
    <Button disabled={busy||!(Number(amount)>0)||reference.trim().length<3} onClick={()=>void run(()=>post(root+'/payments',{amount,paidAt,reference}))}>Record verified payment</Button>
   </div>}
   <Button variant="ghost" type="button" disabled={busy} onClick={()=>void run(async()=>{setHistory(await request<History>(root+'/payment-history'));return {notice:'Payment history refreshed.'}})}>Refresh payment history</Button>
   {history&&<div className="soft-callout"><strong>Outstanding: {selected.currency} {(history.amountRemainingMinor/100).toFixed(2)}</strong>{history.payments.map(p=><p key={p.id}>{p.paidAt.slice(0,10)} · {selected.currency} {p.amount} · {p.reference}</p>)}</div>}
  </div>}
 </section>;
}
