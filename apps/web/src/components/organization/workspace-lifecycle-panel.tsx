'use client';
import {useState} from 'react';
import {post} from '@/lib/api';
import {Button,ErrorMessage,Field} from '@/components/ui';

export function WorkspaceLifecyclePanel({orgId,slug,suspended=false,onChanged}:{orgId:string;slug:string;suspended?:boolean;onChanged:()=>void}){
 const [confirmation,setConfirmation]=useState(''),[expanded,setExpanded]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function change(){
  setBusy(true);setError('');
  try{await post('/workspace-lifecycle/'+orgId+'/status',{status:suspended?'ACTIVE':'SUSPENDED',confirmation});onChanged();}
  catch(e){setError(e instanceof Error?e.message:'Unable to change organization access.');}finally{setBusy(false);}
 }
 return <section className="ws-team">
  <h3>{suspended?'Organization suspended':'Organization access'}</h3>
  <p>{suspended?'Business records are retained. Restore access to reopen the workspace.':'Suspending blocks team access, public links and future background preparation. Pending team invitations are revoked. Records are retained.'}</p>
  <Button type="button" variant="secondary" onClick={()=>setExpanded(v=>!v)}>{suspended?'Reactivate organization':'Suspend organization'}</Button>
  {expanded&&<div><p>Sign in within the last five minutes, then enter <strong>{slug}</strong> to confirm.</p><Field label="Organization identifier"><input value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></Field><Button type="button" loading={busy} disabled={confirmation!==slug} onClick={()=>void change()}>{suspended?'Confirm reactivation':'Confirm suspension'}</Button></div>}
  <ErrorMessage message={error}/>
 </section>;
}
