'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {FileBarChart2,Plus} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';
type Template={id:string;name:string;type:'MBR'|'QBR';sections:string[];version:number;active:boolean};
const defaultSections='Executive Summary\nDelivery Performance\nCommercial Overview\nClient Feedback\nRisks & Issues\nDecisions & Next Actions';
export function TenantReportTemplates({orgId}:{orgId:string}){
 const [templates,setTemplates]=useState<Template[]>([]),[name,setName]=useState(''),[type,setType]=useState<'MBR'|'QBR'>('MBR'),[sections,setSections]=useState(defaultSections),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){setTemplates(await request<Template[]>('/workspace-client-success/'+orgId+'/templates'))}
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load report layouts.'))},[orgId]);
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await post('/workspace-client-success/'+orgId+'/templates',{name,type,sections:sections.split('\n').map(x=>x.trim()).filter(Boolean)});setName('');setSections(defaultSections);setOpen(false);setNotice('Business-review layout created.');await load();}catch(e){setError(e instanceof Error?e.message:'Unable to create report layout.')}finally{setBusy(false)}}
 return <Panel title="MBR / QBR layouts" actions={<FileBarChart2 size={18}/>}>
  <p className="muted small-text">Reusable section structures for client business reviews. They determine report organization, not fabricated content; report values always come from recorded client data.</p>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner">{notice}</div>}
  <div className="stack-16">{templates.map(t=><div className="record-row" key={t.id}><div><strong>{t.name}</strong><p>{t.type} · {(t.sections||[]).length} sections · version {t.version}</p></div><Badge tone={t.active?'green':'neutral'}>{t.active?'Active':'Archived'}</Badge></div>)}{!templates.length&&<p className="muted small-text">No custom report layouts. Standard MBR/QBR structure remains available.</p>}</div>
  <Button variant="secondary" type="button" onClick={()=>setOpen(v=>!v)}><Plus size={15}/>{open?'Close':'New report layout'}</Button>
  {open&&<form className="commercial-action-form" onSubmit={save}><div className="field-grid"><Field label="Layout name"><input required minLength={3} maxLength={150} value={name} onChange={e=>setName(e.target.value)} placeholder="Enterprise QBR"/></Field><Field label="Review type"><BrandSelect value={type} onValueChange={v=>setType(v as 'MBR'|'QBR')}><option value="MBR">Monthly Business Review</option><option value="QBR">Quarterly Business Review</option></BrandSelect></Field></div><Field label="Sections (one per line)"><textarea required rows={6} value={sections} onChange={e=>setSections(e.target.value)}/></Field><Button loading={busy}>Save layout</Button></form>}
 </Panel>;
}
