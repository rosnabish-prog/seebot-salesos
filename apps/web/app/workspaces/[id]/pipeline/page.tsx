'use client';
import {useEffect,useState,type DragEvent} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {STAGES,STAGE_FIELDS,type StageId} from '@seebot/shared';
import {Plus,Search,KanbanSquare,Rows3,Clock3,UserRound,GripVertical,ArrowUpRight,ShieldCheck} from 'lucide-react';
import {post,request,ageDays} from '@/lib/api';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Modal,PageTop} from '@/components/ui';
import {StageIcon} from '@/components/stage-icon';

type Deal={id:string;accountId:string;title:string;stage:StageId;status:string;updatedAt:string;owner:{name:string};account:{name:string;industry:string;priority:string};stageVisits:{stage:string;evidence:Record<string,string>}[]};
type Profile={role:string};
export default function CompanyKanban(){
 const params=useParams(),orgId=String(params.id||'');
 const [deals,setDeals]=useState<Deal[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[search,setSearch]=useState(''),[filter,setFilter]=useState('OPEN'),[mode,setMode]=useState<'board'|'table'>('board');
 const [dragged,setDragged]=useState<string|null>(null),[move,setMove]=useState<{deal:Deal;stage:StageId}|null>(null),[reason,setReason]=useState(''),[override,setOverride]=useState(false),[busy,setBusy]=useState(false),[role,setRole]=useState('MEMBER');
 const home='/workspaces/'+orgId;
 async function refresh(){const rows=await request<Deal[]>('/workspace-business/'+orgId+'/opportunities');setDeals(rows);setLoading(false);}
 useEffect(()=>{let active=true;setLoading(true);setError('');void Promise.all([request<Deal[]>('/workspace-business/'+orgId+'/opportunities'),request<Profile>('/workspaces/'+orgId+'/profile')]).then(([rows,p])=>{if(active){setDeals(rows);setRole(p.role);setLoading(false);}}).catch(e=>{if(active){setError(e instanceof Error?e.message:'Could not load pipeline.');setLoading(false);}});return()=>{active=false;};},[orgId]);
 const shown=deals.filter(d=>(filter==='ALL'||d.status===filter)&&(`${d.account.name} ${d.title} ${d.account.industry}`).toLowerCase().includes(search.toLowerCase()));
 const canMove=['OWNER','ADMIN','MEMBER'].includes(role),canOverride=['OWNER','ADMIN'].includes(role);
 function drop(e:DragEvent,stage:StageId){e.preventDefault();const deal=deals.find(d=>d.id===dragged);setDragged(null);if(deal&&deal.stage!==stage&&canMove&&deal.status==='OPEN'){setMove({deal,stage});setReason('');setOverride(false);}}
 async function confirm(){
  if(!move)return;setBusy(true);setError('');
  try{await post('/workspace-business/'+orgId+'/opportunities/'+move.deal.id+'/transition',{targetStage:move.stage,reason,override});setMove(null);await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Unable to move opportunity.');}finally{setBusy(false);}
 }
 return <section className="tenant-kanban">
  <PageTop kicker="DEAL EXECUTION" title="Kanban Pipeline" description="Company-specific opportunities follow the same stage gates as the original Seebot pipeline. Drag a card to propose a transition." action={<Link href={home+'/accounts'} className="btn btn-primary"><Plus size={16}/> Create New</Link>}/>
  <div className="toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.currentTarget.value)} placeholder="Find an opportunity"/></div>
   <BrandSelect className="compact-select" value={filter} onValueChange={setFilter} ariaLabel="Opportunity status"><option value="OPEN">Open</option><option value="NURTURE">Nurture</option><option value="CLOSED_WON">Closed Won</option><option value="CLOSED_LOST">Closed Lost</option><option value="ALL">All statuses</option></BrandSelect>
   <div className="switch-view"><button aria-label="Kanban view" className={mode==='board'?'selected':''} onClick={()=>setMode('board')}><KanbanSquare size={18}/></button><button aria-label="Table view" className={mode==='table'?'selected':''} onClick={()=>setMode('table')}><Rows3 size={18}/></button></div>
   <span className="muted small-text">{shown.length} opportunities</span>
  </div>
  <ErrorMessage message={error}/>
  {loading?<div className="panel">Loading pipeline…</div>:mode==='board'?
   <div className="kanban-scroll" aria-label="Company opportunity pipeline Kanban"><div className="kanban-board">{STAGES.map(s=>{
    const cards=shown.filter(d=>d.stage===s.id);
    return <section key={s.id} className={'kanban-column '+(dragged?'drag-mode':'')} onDragOver={e=>{if(canMove)e.preventDefault();}} onDrop={e=>drop(e,s.id)}>
     <div className="kanban-column-title"><span className="kanban-step-index"><StageIcon stage={s.id} size={16}/></span><strong>{s.label}</strong><span className="kanban-counter">{cards.length}</span></div>
     <div className="kanban-cards">{cards.map(d=>{
      const required=STAGE_FIELDS[d.stage]?.filter(field=>field.required)||[];
      const evidence=d.stageVisits?.[0]?.evidence||{};
      const completed=required.filter(f=>String(evidence[f.key]||'').trim()).length;
      return <div key={d.id} className="deal-card" draggable={canMove&&d.status==='OPEN'} onDragStart={e=>{setDragged(d.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDragged(null)}>
       <div className="deal-head"><Badge tone={d.account.priority==='HIGH'?'orange':'neutral'}>{d.account.priority||'NORMAL'}</Badge><GripVertical size={16} className="muted"/></div>
       <Link href={home+'/opportunities/'+d.id} className="deal-title">{d.account.name}<ArrowUpRight size={15}/></Link><div className="deal-subtitle">{d.title}</div><div className="deal-sector">{d.account.industry}</div>
       {required.length>0&&<div className="kanban-progress"><div className="kanban-progress-top"><span>Evidence checklist</span><strong>{completed}/{required.length}</strong></div><div className="kanban-progress-track"><div style={{width:`${Math.round(100*completed/required.length)}%`}}/></div></div>}
       <div className="deal-foot"><span><UserRound size={14}/>{d.owner.name}</span><span><Clock3 size={14}/>{ageDays(d.updatedAt)}d</span></div>
      </div>;
     })}{!cards.length&&<div className="kanban-empty">Drop opportunities here</div>}</div>
    </section>;
   })}</div></div>:
   <div className="panel table-scroll"><table className="data-table"><thead><tr><th>Company</th><th>Opportunity</th><th>Stage</th><th>Owner</th><th>Status</th></tr></thead><tbody>{shown.map(d=><tr key={d.id}><td><Link href={home+'/opportunities/'+d.id} className="text-link">{d.account.name}</Link></td><td>{d.title}</td><td>{STAGES.find(s=>s.id===d.stage)?.label||d.stage}</td><td>{d.owner.name}</td><td><Badge>{d.status.replaceAll('_',' ')}</Badge></td></tr>)}</tbody></table></div>}
  {move&&<Modal title="Review stage transition" onClose={()=>setMove(null)}><div className="stack-16">
   <div className="soft-callout"><ShieldCheck size={18}/><span><strong>{move.deal.account.name}</strong> · {STAGES.find(s=>s.id===move.deal.stage)?.label} → {STAGES.find(s=>s.id===move.stage)?.label}</span></div>
   <p className="muted small-text">The API checks evidence and stage sequence. Only workspace administrators can authorize justified overrides. Closed Won always requires a signed production contract.</p>
   {canOverride&&<label className="checkbox-line"><input type="checkbox" checked={override} onChange={e=>setOverride(e.target.checked)}/>Administrator override (if evidence is incomplete)</label>}
   {override&&<Field label="Reason for exception"><textarea value={reason} onChange={e=>setReason(e.target.value)} required rows={2} placeholder="Describe why an override is appropriate"/></Field>}
   <ErrorMessage message={error}/><div className="modal-actions"><Button type="button" variant="secondary" onClick={()=>setMove(null)}>Cancel</Button><Button type="button" loading={busy} onClick={()=>void confirm()} disabled={override&&!reason.trim()}>Move opportunity</Button></div>
  </div></Modal>}
 </section>;
}
