'use client';
import {useEffect,useState} from 'react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';

type Invoice={id:string;number:string;status:string;currency:string;total:string};
type History={status:string;amountRemainingMinor:number;payments:{id:string;amount:string;reference:string;paidAt:string}[]};
export function TenantFinanceInvoicePanel({orgId,invoices}:{orgId:string;invoices:Invoice[]}){
 const [rows,setRows]=useState(invoices),[id,setId]=useState(''),[amount,setAmount]=useState(''),[paidAt,setPaidAt]=useState(new Date().toISOString().slice(0,10)),[reference,setReference]=useState('');
 const [history,setHistory]=useState<History|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setRows(invoices);},[invoices]);
 const selected=rows.find(i=>i.id===id),root='/workspace-finance/'+orgId+'/invoices/'+id;
 async function refresh(){setRows(await request<Invoice[]>('/workspace-business/'+orgId+'/invoices'));if(id)try{setHistory(await request<History>(root+'/payment-history'));}catch{setHistory(null);}}
 async function run(fn:()=>Promise<any>){setBusy(true);setError('');setMessage('');try{const result=await fn();setMessage(result?.note||result?.notice||result?.status||'Finance record saved.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Finance operation failed.');}finally{setBusy(false)}}
 async function download(){setBusy(true);setError('');try{const api=process.env.NEXT_PUBLIC_API_URL||'';const res=await fetch(api+'/api'+root+'/pdf',{credentials:'include'});if(!res.ok)throw Error('Issued invoice PDF is unavailable.');const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download=(selected?.number||'invoice')+'.pdf';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){setError(e instanceof Error?e.message:'Download failed.')}finally{setBusy(false)}}
 return <Panel title="Invoice approval, delivery & payments" actions={selected&&<Badge>{selected.status}</Badge>}>
  <p className="muted small-text">Finance confirms tax treatment before approval. Issuing creates the invoice document. Payments are recorded only after verification and are posted to the workspace ledger.</p>
  <ErrorMessage message={error}/>{message&&<div className="success-banner" role="status">{message}</div>}
  <Field label="Invoice"><BrandSelect value={id} onValueChange={v=>{setId(v);setHistory(null);setReference('');setAmount('')}} ariaLabel="Finance invoice"><option value="">Choose invoice</option>{rows.map(row=><option key={row.id} value={row.id}>{row.number} · {row.status} · {row.currency} {row.total}</option>)}</BrandSelect></Field>
  {selected&&<div className="finance-action-stack">
   <div className="ws-nav-buttons">
    {selected.status==='DRAFT'&&<Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post(root+'/approve',{}))}>Approve reviewed draft</Button>}
    {selected.status==='APPROVED'&&<Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post(root+'/issue',{}))}>Issue invoice PDF</Button>}
    {['APPROVED','SENT','PARTIALLY_PAID','PAID'].includes(selected.status)&&<Button variant="secondary" disabled={busy} onClick={()=>void download()}>Download PDF</Button>}
    {selected.status==='APPROVED'&&<Button disabled={busy} onClick={()=>void run(()=>post(root+'/email',{}))}>Send through Gmail</Button>}
   </div>
   {selected.status==='APPROVED'&&<div className="finance-inline-action"><Field label="External sending reference"><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Provider/message reference"/></Field><Button variant="secondary" disabled={busy||reference.trim().length<5} onClick={()=>void run(()=>post(root+'/record-external-send',{reference}))}>Record external send</Button></div>}
   {['SENT','PARTIALLY_PAID'].includes(selected.status)&&<div className="finance-inline-action finance-payment-grid"><Field label="Received amount"><input type="number" step="0.01" min="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></Field><Field label="Payment date"><input type="date" value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></Field><Field label="Verified payment reference"><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Bank/provider reference"/></Field><Button disabled={busy||!(Number(amount)>0)||reference.trim().length<3} onClick={()=>void run(()=>post(root+'/payments',{amount,paidAt,reference}))}>Record payment</Button></div>}
   <button className="text-link finance-history-toggle" type="button" disabled={busy} onClick={async()=>{setError('');try{setHistory(await request<History>(root+'/payment-history'));}catch(e){setError(e instanceof Error?e.message:'Unable to load payment history.')}}}>View payment history</button>
   {history&&<div className="finance-history"><div className="finance-history-total"><span>Outstanding</span><strong>{selected.currency} {(history.amountRemainingMinor/100).toFixed(2)}</strong></div>{history.payments.map(p=><div className="record-row" key={p.id}><div><strong>{selected.currency} {p.amount}</strong><p>{p.paidAt.slice(0,10)}</p></div><span>{p.reference}</span></div>)}</div>}
  </div>}
 </Panel>;
}
