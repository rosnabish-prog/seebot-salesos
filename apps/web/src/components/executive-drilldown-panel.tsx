'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Button,Panel,ErrorMessage} from './ui';
import {request,fmtDate,currency} from '@/lib/api';
const metrics=[['overdue-invoices','Overdue invoices'],['contract-expiry','Contract renewals'],['client-risks','At-risk clients']] as const;
export function ExecutiveDrilldownPanel({demo}:{demo:boolean}){
 const [metric,setMetric]=useState<string>('overdue-invoices'),[results,setResults]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(m=metric){setMetric(m);setBusy(true);setError('');try{const data=await request<any>(`/executive/drilldown/${m}?demo=${demo}`);setResults(data.records||[])}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <Panel title="Executive Record Explorer" actions={<Button variant="secondary" loading={busy} onClick={()=>void load()}>Refresh records</Button>}><p className="panel-subtitle">Inspect the records behind commercial risks; values are not aggregated across currencies. The selected demo mode remains separate.</p><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{metrics.map(([key,label])=><Button key={key} variant={key===metric?'primary':'secondary'} onClick={()=>void load(key)}>{label}</Button>)}</div><ErrorMessage message={error}/>{results.map((r,i)=><Link key={r.id||i} className="record-row" href={`/clients/${r.accountId}`}><div style={{flex:1}}><strong>{r.account} · {r.number||r.title||r.type}</strong><p>{r.balance!==undefined?`${currency(r.balance,r.currency)} unpaid · Due ${fmtDate(r.dueAt)}`:r.expiresAt?`Expires ${fmtDate(r.expiresAt)}`:r.score!==undefined?`NPS ${r.score}/10`:r.severity||'Review client details'}</p></div></Link>)}{!results.length&&!busy&&<p className="muted small-text">Select a metric above to load its underlying records.</p>}</Panel>;
}
