'use client';
import {useEffect,useState} from 'react';
import {PlugZap,ShieldCheck} from 'lucide-react';
import {Badge,Panel} from '@/components/ui';
import {request} from '@/lib/api';
type Provider={mode:'DEMO'|'DISABLED'|'CONFIGURED_NOT_VERIFIED';configured:boolean;endpoint:string;notice:string};
const labels:Record<string,string>={openai:'OpenAI sales intelligence',apollo:'Apollo enrichment',gmail:'Gmail sending',googleLogin:'Google sign-in',signing:'Electronic signing',surveys:'Client survey delivery'};
export function TenantIntegrationStatus({orgId}:{orgId:string}){
 const [data,setData]=useState<Record<string,Provider>|null>(null),[error,setError]=useState('');
 useEffect(()=>{void request<Record<string,Provider>>('/workspaces/'+orgId+'/integration-status').then(setData).catch(e=>setError(e instanceof Error?e.message:'Unable to read integration readiness.'))},[orgId]);
 return <Panel title="Integrations & external services" actions={<PlugZap size={18}/>}>
  <p className="muted small-text">SalesOS separates “configured” from “verified working.” A credential by itself never makes a provider production-ready.</p>
  {error&&<div className="error-banner">{error}</div>}
  <div className="integration-grid">{data&&Object.entries(data).map(([key,item])=><div className="integration-card" key={key}><div><strong>{labels[key]||key}</strong><p>{item.notice}</p></div><div className="integration-state"><Badge tone={item.mode==='DISABLED'?'neutral':item.mode==='DEMO'?'orange':'green'}>{item.mode.replaceAll('_',' ')}</Badge>{item.configured&&<span><ShieldCheck size={13}/>Configured</span>}</div></div>)}</div>
 </Panel>;
}
