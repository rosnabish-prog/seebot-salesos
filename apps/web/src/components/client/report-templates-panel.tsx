'use client';
import {useEffect,useState} from 'react';
import {Button,Field,ErrorMessage} from '@/components/ui';
import {request,post} from '@/lib/api';
export function ReportTemplatesPanel(){
 const [templates,setTemplates]=useState<any[]>([]),[name,setName]=useState(''),[type,setType]=useState('MBR'),[sections,setSections]=useState('Executive Summary\nDelivery Performance\nClient Feedback\nRisks & Actions'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){setTemplates(await request<any[]>('/report-templates'))};useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 async function add(){setError('');try{await post('/report-templates',{name,type,sections:sections.split('\n').map(x=>x.trim()).filter(Boolean)});await load();setNotice('Template stored for this workspace.')}catch(e:any){setError(e.message)}}
 return <section className="panel" style={{padding:22}}><h3>Reusable MBR / QBR Layouts</h3>{templates.map(t=><div key={t.id} className="record-row"><strong>{t.name}</strong><p>{t.type} · {(t.sections||[]).length} sections · v{t.version}</p></div>)}<details><summary>Create report layout</summary><div className="stack-16"><Field label="Layout name"><input value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Review type"><select value={type} onChange={e=>setType(e.target.value)}><option>MBR</option><option>QBR</option></select></Field><Field label="Headings (one per line)"><textarea rows={5} value={sections} onChange={e=>setSections(e.target.value)}/></Field><Button disabled={!name.trim()} onClick={()=>void add()}>Save template</Button></div></details><ErrorMessage message={error}/>{notice&&<p role="status">{notice}</p>}</section>;
}
