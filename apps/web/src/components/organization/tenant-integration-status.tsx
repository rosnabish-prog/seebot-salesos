'use client';
import {useEffect,useState} from 'react';
import {PlugZap,ShieldCheck} from 'lucide-react';
import {Badge,Button,ErrorMessage,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';
type Provider={mode:'DEMO'|'DISABLED'|'CONFIGURED_NOT_VERIFIED';configured:boolean;endpoint:string;notice:string};
type GmailStatus={configured:boolean;sendingEnabled:boolean;connection:{googleEmail:string;status:string;connectedAt:string}|null};
const labels:Record<string,string>={openai:'OpenAI sales intelligence',apollo:'Apollo enrichment',gmail:'Gmail sending',googleLogin:'Google sign-in',signing:'Electronic signing',surveys:'Client survey delivery'};
export function TenantIntegrationStatus({orgId}:{orgId:string}){
 const [data,setData]=useState<Record<string,Provider>|null>(null),[gmail,setGmail]=useState<GmailStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{void Promise.all([request<Record<string,Provider>>('/workspaces/'+orgId+'/integration-status'),request<GmailStatus>('/workspace-integrations/'+orgId+'/gmail/status')]).then(([providers,status])=>{setData(providers);setGmail(status)}).catch(e=>setError(e instanceof Error?e.message:'Unable to read integration readiness.'))},[orgId]);
 return <Panel title="Integrations & external services" actions={<PlugZap size={18}/>}>
  <p className="muted small-text">SalesOS separates “configured” from “verified working.” A credential by itself never makes a provider production-ready.</p>
  <ErrorMessage message={error}/>
  {gmail&&<div className="integration-gmail-control"><div><strong>Gmail sending connection</strong><p>{gmail.connection?'Connected as '+gmail.connection.googleEmail:gmail.configured?'OAuth is configured but this user has not connected Gmail.':'Google Gmail OAuth is not configured for this deployment.'}</p></div><div className="ws-nav-buttons">{gmail.connection?<><Badge tone={gmail.sendingEnabled?'green':'orange'}>{gmail.sendingEnabled?'Connected & sending enabled':'Connected · sending disabled'}</Badge><Button type="button" variant="secondary" loading={busy} onClick={async()=>{setBusy(true);setError('');try{await post('/workspace-integrations/'+orgId+'/gmail/disconnect',{});setGmail(await request<GmailStatus>('/workspace-integrations/'+orgId+'/gmail/status'));}catch(e){setError(e instanceof Error?e.message:'Unable to disconnect Gmail.')}finally{setBusy(false)}}}>Disconnect</Button></>:<Button type="button" disabled={!gmail.configured} loading={busy} onClick={async()=>{setBusy(true);setError('');try{const out=await post<{url:string}>('/workspace-integrations/'+orgId+'/gmail/connect',{});window.location.assign(out.url);}catch(e){setError(e instanceof Error?e.message:'Unable to start Gmail connection.');setBusy(false)}}}>Connect Gmail</Button>}</div></div>}
  <div className="integration-grid">{data&&Object.entries(data).map(([key,item])=><div className="integration-card" key={key}><div><strong>{labels[key]||key}</strong><p>{item.notice}</p></div><div className="integration-state"><Badge tone={item.mode==='DISABLED'?'neutral':item.mode==='DEMO'?'orange':'green'}>{item.mode.replaceAll('_',' ')}</Badge>{item.configured&&<span><ShieldCheck size={13}/>Configured</span>}</div></div>)}</div>
 </Panel>;
}
