'use client';
import { useEffect,useState } from 'react';
import { Panel,Badge } from '@/components/ui';
import { request } from '@/lib/api';
type Provider={mode:string;configured:boolean;endpoint:string;notice:string};
export function IntegrationStatusPanel(){
 const [data,setData]=useState<Record<string,Provider>|null>(null),[error,setError]=useState('');
 useEffect(()=>{request<Record<string,Provider>>('/integration-status').then(setData).catch(e=>setError(e.message))},[]);
 const names:Record<string,string>={openai:'OpenAI research',apollo:'Apollo prospect search',gmail:'Gmail sending',googleLogin:'Google sign-in',signing:'Google-verified document signing',surveys:'Client surveys'};
 return <Panel title="API & Integration Readiness" actions={<Badge>{data?'6 providers':'Checking'}</Badge>}>
  <p className="muted small-text">Integration routes remain available while demonstration providers are enabled. A configured key is not proof that an integration has passed a live connection test.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="stack-16">{data&&Object.entries(data).map(([key,item])=><div className="record-row" key={key}><div style={{flex:1}}><strong>{names[key]||key}</strong><p>{item.notice}</p><code>{item.endpoint}</code></div><Badge tone={item.mode==='DEMO'?'orange':'neutral'}>{item.mode.replaceAll('_',' ')}</Badge></div>)}</div>
 </Panel>;
}
