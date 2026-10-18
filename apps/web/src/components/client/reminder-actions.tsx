'use client';
import { useState } from 'react';
import { Button,ErrorMessage } from '@/components/ui';
import { request,post } from '@/lib/api';
interface Reminder {id:string;status:string;scheduledFor:string}
interface Preview {subject:string;body:string;recipient?:string;to?:string}
export function InvoiceReminderActions({invoiceId,reminders,isDemo,canManage,onChanged}:{invoiceId:string;reminders:Reminder[];isDemo:boolean;canManage:boolean;onChanged:()=>Promise<any>}){
 const [preview,setPreview]=useState<Preview|null>(null),[outgoingId,setOutgoingId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function action(fn:()=>Promise<any>){setBusy(true);setError('');try{const r=await fn();await onChanged();return r;}catch(e:any){setError(e.message);return null}finally{setBusy(false)}}
 const pending=reminders.find(r=>r.status==='PENDING_APPROVAL'&&new Date(r.scheduledFor)<=new Date());
 const approved=reminders.find(r=>r.status==='APPROVED');
 if(!isDemo&&!canManage)return null;
 return <div className="stack-16" style={{paddingTop:10}}>
  <div className="client-document-actions">
   {isDemo&&<Button variant="secondary" disabled={busy} onClick={()=>void action(async()=>{const p=await request<any>(`/billing/reminders/${invoiceId}/demo-preview`);setPreview(p);return p})}>Preview fictional reminder</Button>}
   {!isDemo&&pending&&canManage&&<Button variant="secondary" disabled={busy} onClick={()=>void action(()=>post(`/billing/reminders/${invoiceId}/approve/${pending.id}`,{}))}>Approve overdue reminder</Button>}
   {!isDemo&&approved&&canManage&&<Button variant="secondary" disabled={busy} onClick={()=>void action(async()=>{const r=await post<any>(`/billing/reminders/${invoiceId}/prepare`,{});setOutgoingId(r.outgoingMessageId);setPreview({...r.preview,recipient:r.preview?.to});return r;})}>Review email draft</Button>}
  </div>
  {preview&&<section className="soft-callout" aria-label="Reminder draft preview"><strong>{preview.subject}</strong><p>To: {preview.recipient||preview.to}</p><p style={{whiteSpace:'pre-wrap'}}>{preview.body}</p>{outgoingId&&canManage&&!isDemo&&<Button disabled={busy} onClick={()=>{if(window.confirm('Send this approved reminder now through your connected Gmail mailbox?'))void action(()=>post(`/communications/messages/${outgoingId}/send`,{})).then(r=>{if(r){setPreview(null);setOutgoingId('');}})}}>Send approved reminder</Button>}{isDemo&&<small>DEMO ONLY — no message sent.</small>}</section>}
  <ErrorMessage message={error}/>
 </div>;
}
