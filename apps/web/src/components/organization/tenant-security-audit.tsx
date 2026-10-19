'use client';
import {useEffect,useMemo,useState} from 'react';
import {Clock3,KeyRound,LockKeyhole,Search,ShieldCheck} from 'lucide-react';
import {Badge,ErrorMessage,Panel} from '@/components/ui';
import {request} from '@/lib/api';

type EventRow={id:string;action:string;entityType:string;entityId:string;detail:any;createdAt:string;actor?:{id:string;name:string;email:string}};
type Data={policy:{mfaRequiredEverySignIn:boolean;mfaMethod:string;sessionMaxAgeDays:number;otpExpiresMinutes:number;maxOtpAttempts:number};workspaceEvents:EventRow[];mySecurityEvents:EventRow[];notice:string};
export function TenantSecurityAudit({orgId}:{orgId:string}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[query,setQuery]=useState('');
 useEffect(()=>{void request<Data>('/workspaces/'+orgId+'/security-audit').then(setData).catch(e=>{if((e as any)?.status!==403)setError(e instanceof Error?e.message:'Unable to load security audit.');})},[orgId]);
 const rows=useMemo(()=>{const q=query.trim().toLowerCase();return (data?.workspaceEvents||[]).filter(row=>!q||[row.action,row.entityType,row.actor?.name,row.actor?.email].some(v=>String(v||'').toLowerCase().includes(q)))},[data,query]);
 if(!data&&!error)return null;
 return <Panel title="Security & audit" actions={<ShieldCheck size={18}/>}>
  <ErrorMessage message={error}/>
  {data&&<>
   <div className="security-policy-grid">
    <div><LockKeyhole size={18}/><span><small>Two-factor authentication</small><strong>{data.policy.mfaRequiredEverySignIn?'Every sign-in':'Not required'}</strong></span></div>
    <div><Clock3 size={18}/><span><small>Session lifetime</small><strong>{data.policy.sessionMaxAgeDays} days maximum</strong></span></div>
    <div><KeyRound size={18}/><span><small>Verification code</small><strong>{data.policy.otpExpiresMinutes} min · {data.policy.maxOtpAttempts} attempts</strong></span></div>
   </div>
   <p className="muted small-text">{data.notice}</p>
   <div className="audit-toolbar"><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search workspace audit"/></div><Badge>{rows.length} events</Badge></div>
   <div className="audit-event-list">{rows.slice(0,100).map(row=><details className="audit-event" key={row.id}><summary><div><strong>{row.action.replaceAll('_',' ')}</strong><p>{row.entityType} · {row.actor?.name||'System'} · {new Date(row.createdAt).toLocaleString()}</p></div><Badge>{row.actor?.email||'System'}</Badge></summary><pre>{JSON.stringify(row.detail||{},null,2)}</pre></details>)}{!rows.length&&<p className="muted small-text">No matching company audit events.</p>}</div>
   <div className="personal-security-events"><h3>Your recent sign-in security events</h3>{data.mySecurityEvents.slice(0,10).map(row=><div className="record-row" key={row.id}><div><strong>{row.action.replaceAll('_',' ')}</strong><p>{new Date(row.createdAt).toLocaleString()}</p></div><Badge tone="green">Verified</Badge></div>)}{!data.mySecurityEvents.length&&<p className="muted small-text">No recent authentication events are available.</p>}</div>
  </>}
 </Panel>;
}
