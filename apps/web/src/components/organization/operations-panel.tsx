'use client';
import {useEffect,useState} from 'react';
import {request,patch,post} from '@/lib/api';
import {Button,ErrorMessage,Field} from '@/components/ui';

type Status={settings:{billingDrafts:boolean;reminderTasks:boolean};failed:number;jobs:{id:string;kind:string;status:string;attempts:number;lastError?:string;createdAt:string}[];notice:string};
type ExportPage={data:unknown[];next:string|null;[key:string]:unknown};
export function OperationsPanel({orgId}:{orgId:string}){
 const [status,setStatus]=useState<Status|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [resources,setResources]=useState<string[]>([]),[resource,setResource]=useState('accounts'),[cursor,setCursor]=useState<string|null>(null),[page,setPage]=useState(1);
 async function load(){setStatus(await request<Status>('/workspace-operations/'+orgId));}
 useEffect(()=>{void Promise.all([load(),request<{resources:string[]}>('/workspace-exports/'+orgId).then(x=>setResources(x.resources))]).catch(e=>setError(e.message));},[orgId]);
 async function save(){if(!status)return;setBusy(true);setError('');try{await patch('/workspace-operations/'+orgId,status.settings);setNotice('Preparation settings saved. A worker must be running to process jobs.');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false);}}
 async function download(){
  setBusy(true);setError('');try{
   const data=await request<ExportPage>('/workspace-exports/'+orgId+'/'+resource+(cursor?'?after='+encodeURIComponent(cursor):''));
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   const anchor=document.createElement('a');anchor.href=url;anchor.download='salesos-'+resource+'-page-'+page+'.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setCursor(data.next);setPage(data.next?page+1:1);setNotice(data.next?'Page downloaded. Download the next page to continue.':'Final page downloaded. The next download starts from the beginning.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to export records.');}finally{setBusy(false);}
 }
 return <section className="ws-card">
  <h2>Operations & data</h2><ErrorMessage message={error}/>{notice&&<p role="status">{notice}</p>}
  <h3>Hourly preparation</h3><p>Prepare billing drafts from signed agreements and payment reminder review tasks. Your team reviews and explicitly issues or sends them.</p>
  {status&&<><Field label="Prepare billing drafts"><input type="checkbox" checked={status.settings.billingDrafts} onChange={e=>setStatus({...status,settings:{...status.settings,billingDrafts:e.target.checked}})}/></Field><Field label="Prepare reminder review tasks"><input type="checkbox" checked={status.settings.reminderTasks} onChange={e=>setStatus({...status,settings:{...status.settings,reminderTasks:e.target.checked}})}/></Field><Button type="button" loading={busy} onClick={()=>void save()}>Save preparation settings</Button>
   <p>{status.failed} failed jobs. {status.notice}</p><Button type="button" variant="secondary" onClick={()=>void load().catch(e=>setError(e.message))}>Refresh jobs</Button>
   <div style={{overflowX:'auto'}}><table><thead><tr><th>Job</th><th>Status</th><th>Attempts</th><th>Created</th><th>Action</th></tr></thead><tbody>{status.jobs.map(job=><tr key={job.id}><td>{job.kind}</td><td>{job.status}{job.lastError?' · '+job.lastError:''}</td><td>{job.attempts}</td><td>{new Date(job.createdAt).toLocaleString()}</td><td>{job.status==='FAILED'&&<Button type="button" variant="secondary" onClick={()=>{void post('/workspace-operations/'+orgId+'/jobs/'+job.id+'/retry',{}).then(load).catch(e=>setError(e.message));}}>Retry</Button>}</td></tr>)}</tbody></table></div>
  </>}
  <h3>Business record export</h3><p>Download JSON pages of up to 100 records. Document files and provider/security credentials are excluded. Use database backups for a full restore.</p>
  <Field label="Record type"><select value={resource} onChange={e=>{setResource(e.target.value);setCursor(null);setPage(1);}}>{resources.map(r=><option key={r} value={r}>{r}</option>)}</select></Field>
  <Button type="button" loading={busy} onClick={()=>void download()}>Download {resource} · page {page}</Button>{cursor&&<Button type="button" variant="secondary" onClick={()=>{setCursor(null);setPage(1);}}>Start again</Button>}
 </section>;
}
