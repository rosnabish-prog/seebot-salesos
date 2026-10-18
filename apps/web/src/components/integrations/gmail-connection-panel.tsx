'use client';
import {useEffect,useState} from 'react';
import {Mail,Link2Off} from 'lucide-react';
import {post,request} from '@/lib/api';
import {Panel,Button,Badge,ErrorMessage} from '@/components/ui';

type Status={configured:boolean;sendingEnabled:boolean;connection:{googleEmail:string;status:string;connectedAt:string}|null};
export function GmailConnectionPanel(){
 const[status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=()=>request<Status>('/integrations/gmail/status').then(setStatus).catch(e=>setError(e.message));
 useEffect(()=>{void refresh()},[]);
 async function connect(){setBusy(true);setError('');try{const{url}=await post<{url:string}>('/integrations/gmail/connect',{});if(!/^https:\/\/accounts\.google\.com\//.test(url))throw Error('Invalid authorization destination.');window.location.assign(url);}catch(e){setError(e instanceof Error?e.message:'Connection failed.');setBusy(false);}}
 async function disconnect(){setBusy(true);setError('');try{await post('/integrations/gmail/disconnect',{});await refresh();}catch(e){setError(e instanceof Error?e.message:'Disconnect failed.');}finally{setBusy(false);}}
 return <Panel title="Gmail Outbound Integration" actions={<Mail size={18} color="#FF7A3D"/>}>
   <p className="muted small-text">Optional mailbox connection for approved invitation and invoice delivery. Google login does not grant Gmail access. Reply synchronization will be introduced separately.</p>
   <div className="gmail-connection-actions"><Badge tone={status?.connection?.status==='CONNECTED'?'green':'neutral'}>{status?.connection?.status==='CONNECTED'?'Connected':'Not connected'}</Badge><span>{status?.connection?.googleEmail||'No employee mailbox authorized'}</span></div>
   <p className="muted small-text">Provider setup: {status?.configured?'Configured':'Missing credentials'} · Live sending: {status?.sendingEnabled?'Enabled':'Disabled by administrator'}</p>
   <ErrorMessage message={error}/>
   <div className="gmail-connection-actions">
     {!status?.connection?<Button disabled={busy||!status?.configured} onClick={connect}>Connect Gmail</Button>:<Button disabled={busy} variant="secondary" onClick={disconnect}><Link2Off size={16}/>Disconnect Gmail</Button>}
   </div>
 </Panel>;
}
