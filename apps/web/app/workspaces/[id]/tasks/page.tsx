'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {useParams} from 'next/navigation';
import {request,post,patch} from '@/lib/api';
import {Badge,Button,ErrorMessage,Field,PageTop,Panel,Empty} from '@/components/ui';
import {Plus,CheckCircle2} from 'lucide-react';
type Task={id:string;title:string;status:string;description:string|null;dueAt:string|null;assignee:{id:string;name:string};opportunity:{id:string;title:string}|null};
export default function TenantTasks(){
 const params=useParams(),id=String(params.id||'');
 const [items,setItems]=useState<Task[]>([]),[title,setTitle]=useState(''),[due,setDue]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setItems(await request<Task[]>('/workspace-business/'+id+'/tasks'))}
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Unable to load tasks.'));},[id]);
 async function add(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await post('/workspace-business/'+id+'/tasks',{title,dueAt:due||null});setTitle('');setDue('');setShow(false);await refresh();}catch(e){setError(e instanceof Error?e.message:'Cannot create task.')}finally{setBusy(false)}}
 async function complete(item:Task){setBusy(true);setError('');try{await patch('/workspace-business/'+id+'/tasks/'+item.id,{status:item.status==='DONE'?'OPEN':'DONE'});await refresh();}catch(e){setError(e instanceof Error?e.message:'Cannot update task.')}finally{setBusy(false)}}
 return <section><PageTop kicker="SALES EXECUTION" title="Tasks & Follow-ups" description="Task assignments from your company workspace. Stage requirements can also create tasks automatically." action={<Button onClick={()=>setShow(v=>!v)}><Plus size={16}/> New task</Button>}/>
 <ErrorMessage message={error}/>{show&&<Panel title="Create task"><form className="stack-16" onSubmit={add}><Field label="Task title"><input required minLength={2} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Follow up with customer"/></Field><Field label="Due date (optional)"><input type="date" value={due} onChange={e=>setDue(e.target.value)}/></Field><Button type="submit" loading={busy}>Save task</Button></form></Panel>}
 <Panel title={'Team tasks ('+items.length+')'}>{items.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>{items.map(task=><tr key={task.id}><td><strong>{task.title}</strong>{task.opportunity&&<p className="muted small-text">{task.opportunity.title}</p>}</td><td>{task.assignee.name}</td><td>{task.dueAt?new Date(task.dueAt).toLocaleDateString():'Not scheduled'}</td><td><Badge tone={task.status==='DONE'?'green':'neutral'}>{task.status}</Badge></td><td><Button variant="secondary" disabled={busy} onClick={()=>void complete(task)}><CheckCircle2 size={14}/>{task.status==='DONE'?'Reopen':'Complete'}</Button></td></tr>)}</tbody></table></div>:<Empty title="No tasks yet" description="Create a follow-up or start a sales opportunity."/ >}</Panel></section>;
}
