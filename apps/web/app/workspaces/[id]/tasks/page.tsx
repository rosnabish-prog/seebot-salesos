'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {useParams} from 'next/navigation';
import {request,post,patch} from '@/lib/api';
import {Badge,BrandSelect,Button,ErrorMessage,Field,PageTop,Panel,Empty} from '@/components/ui';
import {Plus,CheckCircle2,Search,Clock3,AlertTriangle} from 'lucide-react';

type Task={id:string;title:string;status:string;description:string|null;dueAt:string|null;assignee:{id:string;name:string};opportunity:{id:string;title:string}|null};
type Member={role:string;user:{id:string;name:string}};
type Opportunity={id:string;title:string;status:string;account:{name:string}};
export default function TenantTasks(){
 const params=useParams(),id=String(params.id||'');
 const [items,setItems]=useState<Task[]>([]),[members,setMembers]=useState<Member[]>([]),[opportunities,setOpportunities]=useState<Opportunity[]>([]);
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[due,setDue]=useState(''),[assigneeId,setAssigneeId]=useState(''),[opportunityId,setOpportunityId]=useState('');
 const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState<'OPEN'|'OVERDUE'|'SOON'|'DONE'|'ALL'>('OPEN');
 async function refresh(){
  const [tasks,team,deals]=await Promise.all([
   request<Task[]>('/workspace-business/'+id+'/tasks'),
   request<Member[]>('/workspaces/'+id+'/member-options'),
   request<Opportunity[]>('/workspace-business/'+id+'/opportunities')
  ]);
  setItems(tasks);setMembers(team);setOpportunities(deals.filter(d=>d.status==='OPEN'));if(!assigneeId&&team[0]?.user.id)setAssigneeId(team[0].user.id);
 }
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Unable to load tasks.'));},[id]);
 async function add(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await post('/workspace-business/'+id+'/tasks',{title,description:description||undefined,dueAt:due||null,assigneeId:assigneeId||undefined,opportunityId:opportunityId||undefined});setTitle('');setDescription('');setDue('');setOpportunityId('');setShow(false);setNotice('Task created.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Cannot create task.')}finally{setBusy(false)}}
 async function complete(item:Task){setBusy(true);setError('');setNotice('');try{await patch('/workspace-business/'+id+'/tasks/'+item.id,{status:item.status==='DONE'?'OPEN':'DONE'});setNotice(item.status==='DONE'?'Task reopened.':'Task completed.');await refresh();}catch(e){setError(e instanceof Error?e.message:'Cannot update task.')}finally{setBusy(false)}}
 const now=Date.now(),soon=now+3*86400000;
 const counts=useMemo(()=>({
  open:items.filter(t=>t.status==='OPEN').length,
  overdue:items.filter(t=>t.status==='OPEN'&&t.dueAt&&new Date(t.dueAt).getTime()<now).length,
  soon:items.filter(t=>t.status==='OPEN'&&t.dueAt&&new Date(t.dueAt).getTime()>=now&&new Date(t.dueAt).getTime()<=soon).length,
  done:items.filter(t=>t.status==='DONE').length
 }),[items,now,soon]);
 const shown=useMemo(()=>items.filter(task=>{
  const q=query.trim().toLowerCase(),dueAt=task.dueAt?new Date(task.dueAt).getTime():null;
  if(q&&![task.title,task.description,task.assignee.name,task.opportunity?.title].some(v=>String(v||'').toLowerCase().includes(q)))return false;
  if(filter==='OPEN'&&task.status!=='OPEN')return false;
  if(filter==='DONE'&&task.status!=='DONE')return false;
  if(filter==='OVERDUE'&&!(task.status==='OPEN'&&dueAt!==null&&dueAt<now))return false;
  if(filter==='SOON'&&!(task.status==='OPEN'&&dueAt!==null&&dueAt>=now&&dueAt<=soon))return false;
  return true;
 }).sort((a,b)=>{const ad=a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER,bd=b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER;return ad-bd;}),[items,query,filter,now,soon]);
 return <section className="tenant-tasks">
  <PageTop kicker="SALES EXECUTION" title="Tasks & Follow-ups" description="One execution queue for manual follow-ups, pipeline-generated actions, finance reviews and renewals." action={<Button onClick={()=>setShow(v=>!v)}><Plus size={16}/>{show?'Close form':'New task'}</Button>}/>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner" role="status">{notice}</div>}
  <div className="task-summary-grid"><button type="button" className={filter==='OPEN'?'active':''} onClick={()=>setFilter('OPEN')}><CheckCircle2 size={17}/><span><small>Open</small><strong>{counts.open}</strong></span></button><button type="button" className={filter==='OVERDUE'?'active':''} onClick={()=>setFilter('OVERDUE')}><AlertTriangle size={17}/><span><small>Overdue</small><strong>{counts.overdue}</strong></span></button><button type="button" className={filter==='SOON'?'active':''} onClick={()=>setFilter('SOON')}><Clock3 size={17}/><span><small>Due in 3 days</small><strong>{counts.soon}</strong></span></button><button type="button" className={filter==='DONE'?'active':''} onClick={()=>setFilter('DONE')}><CheckCircle2 size={17}/><span><small>Completed</small><strong>{counts.done}</strong></span></button></div>
  {show&&<Panel title="Create task"><form className="stack-16" onSubmit={add}><div className="field-grid"><Field label="Task title"><input required minLength={2} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Follow up with client"/></Field><Field label="Assigned to"><BrandSelect value={assigneeId} onValueChange={setAssigneeId} ariaLabel="Task assignee">{members.map(m=><option key={m.user.id} value={m.user.id}>{m.user.name} · {m.role}</option>)}</BrandSelect></Field></div><Field label="Description (optional)"><textarea rows={3} maxLength={1500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Context, expected outcome, or evidence to collect"/></Field><div className="field-grid"><Field label="Due date (optional)"><input type="date" value={due} onChange={e=>setDue(e.target.value)}/></Field><Field label="Opportunity (optional)"><BrandSelect value={opportunityId} onValueChange={setOpportunityId} ariaLabel="Task opportunity"><option value="">No linked opportunity</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.account.name} · {o.title}</option>)}</BrandSelect></Field></div><Button type="submit" loading={busy}>Save task</Button></form></Panel>}
  <Panel title={'Team tasks ('+shown.length+')'} actions={<div className="task-toolbar"><div className="search-box compact-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tasks"/></div><BrandSelect value={filter} onValueChange={value=>setFilter(value as typeof filter)} ariaLabel="Task status filter"><option value="OPEN">Open</option><option value="OVERDUE">Overdue</option><option value="SOON">Due in 3 days</option><option value="DONE">Completed</option><option value="ALL">All tasks</option></BrandSelect></div>}>
   {shown.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>{shown.map(task=>{const overdue=task.status==='OPEN'&&task.dueAt&&new Date(task.dueAt).getTime()<now;return <tr key={task.id}><td><strong>{task.title}</strong>{task.description&&<p className="muted small-text">{task.description}</p>}{task.opportunity&&<p className="muted small-text">{task.opportunity.title}</p>}</td><td>{task.assignee.name}</td><td>{task.dueAt?<span className={overdue?'task-overdue':''}>{new Date(task.dueAt).toLocaleDateString()}</span>:'Not scheduled'}</td><td><Badge tone={task.status==='DONE'?'green':overdue?'red':'neutral'}>{task.status==='DONE'?'DONE':overdue?'OVERDUE':'OPEN'}</Badge></td><td><Button variant="secondary" disabled={busy} onClick={()=>void complete(task)}><CheckCircle2 size={14}/>{task.status==='DONE'?'Reopen':'Complete'}</Button></td></tr>})}</tbody></table></div>:<Empty title="No matching tasks" description={items.length?'Change the filter or search term.':'Create a follow-up or start a sales opportunity.'}/>}
  </Panel>
 </section>;
}
