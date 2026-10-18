'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Receipt,RefreshCw} from 'lucide-react';
import {Button,ErrorMessage} from '@/components/ui';
import {post,request,fmtDate,currency} from '@/lib/api';
type Entry={invoiceId:string;invoiceNumber:string;accountId:string;clientName:string;isDemo:boolean;balance:number;currency:string;day:number;scheduledFor:string};
export function BillingAutomationPanel(){
 const [items,setItems]=useState<Entry[]>([]),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function refresh(){setError('');try{const result=await request<{proposals:Entry[]}>('/billing/automation/preview');setItems(result.proposals)}catch(e:any){setError(e.message)}}
 useEffect(()=>{void refresh()},[]);
 async function create(){setLoading(true);setError('');setMessage('');try{const result=await post<{created:number;skipped:number;emailsSent:number}>('/billing/automation/create-approval-tasks',{});setMessage(`${result.created} review records created; ${result.skipped} skipped. No emails sent.`);await refresh()}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 return <section className="panel" style={{padding:24}}>
   <header className="panel-head"><h3><Receipt size={18}/> Billing automation review</h3><Button variant="secondary" type="button" onClick={()=>void refresh()}><RefreshCw size={15}/> Refresh</Button></header>
   <p className="panel-subtitle">Local scheduling proposal for one-day and five-day overdue invoices. This creates approval tasks only; it never sends an email or records a payment.</p>
   {items.length?<><div className="stack-16">{items.slice(0,12).map((x,i)=><div className="record-row" key={`${x.invoiceId}-${x.day}-${i}`}><Receipt size={17}/><div style={{flex:1}}><strong>{x.clientName} — {x.invoiceNumber}</strong><p>Day {x.day} reminder · {fmtDate(x.scheduledFor)} · {currency(x.balance,x.currency)}{x.isDemo?' · FICTIONAL':''}</p></div><Link className="text-link" href={`/clients/${x.accountId}`}>Open</Link></div>)}</div><Button loading={loading} onClick={()=>void create()}>Create internal approval tasks</Button></>:<div className="soft-callout">No eligible reminders awaiting internal review.</div>}
   <ErrorMessage message={error}/>{message&&<p className="soft-callout" role="status">{message}</p>}
 </section>
}
