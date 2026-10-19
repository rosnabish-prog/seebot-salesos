'use client';
import {useEffect,useMemo,useState} from 'react';
import {RotateCcw,SlidersHorizontal,Plus,Trash2,DatabaseZap} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {patch,request} from '@/lib/api';

type FieldType='text'|'textarea'|'date'|'select'|'checkbox';
type FieldConfig={key:string;label:string;type:FieldType;required?:boolean;options?:string[];help?:string;autoFill?:string};
type Stage={id:string;label:string;short:string;fields:FieldConfig[]};
type Config={version:1;stages:Stage[]};
const autofill=[
 ['','No automatic pull'],
 ['account.name','Company name'],['account.website','Company website'],['account.industry','Company industry'],['account.country','Company country'],['account.hypothesis','Account hypothesis'],
 ['opportunity.title','Opportunity title'],['opportunity.serviceLine','Opportunity service line'],['opportunity.currency','Opportunity currency'],
 ['primaryContact.name','Primary contact name'],['primaryContact.email','Primary contact email'],['primaryContact.title','Primary contact job title'],
 ['latestContract.title','Latest contract title'],['latestContract.status','Latest contract status']
];
const makeKey=(label:string)=>label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,50)||'custom_field';
export function PipelineSettingsPanel({orgId}:{orgId:string}){
 const [config,setConfig]=useState<Config|null>(null),[selected,setSelected]=useState('ACCOUNT_RESEARCHED'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{void request<Config>('/workspace-pipeline/'+orgId).then(c=>{setConfig(c);setSelected(c.stages[0]?.id||'ACCOUNT_RESEARCHED')}).catch(e=>setError(e instanceof Error?e.message:'Unable to load pipeline settings.'))},[orgId]);
 const stage=useMemo(()=>config?.stages.find(s=>s.id===selected)||null,[config,selected]);
 const autoFillOptions=useMemo(()=>{
  const base=[...autofill] as [string,string][];
  if(!config)return base;
  const target=config.stages.findIndex(s=>s.id===selected);
  for(const source of config.stages.slice(0,Math.max(0,target))){
   for(const field of source.fields)base.push([`stage.${source.id}.${field.key}`,`${source.label} → ${field.label}`]);
  }
  return base;
 },[config,selected]);
 function updateStage(patchData:Partial<Stage>){setConfig(prev=>prev?{...prev,stages:prev.stages.map(s=>s.id===selected?{...s,...patchData}:s)}:prev)}
 function updateField(index:number,patchData:Partial<FieldConfig>){if(!stage)return;updateStage({fields:stage.fields.map((f,i)=>i===index?{...f,...patchData}:f)})}
 function addField(){if(!stage)return;let key='custom_field_'+(stage.fields.length+1);const used=new Set(stage.fields.map(f=>f.key));while(used.has(key))key+='_x';updateStage({fields:[...stage.fields,{key,label:'New field',type:'text',required:false}]})}
 async function save(){if(!config)return;setBusy(true);setError('');setNotice('');try{const saved=await patch<Config>('/workspace-pipeline/'+orgId,config);setConfig(saved);setNotice('Pipeline settings saved. New and existing opportunities use these labels and evidence fields.')}catch(e){setError(e instanceof Error?e.message:'Unable to save pipeline settings.')}finally{setBusy(false)}}
 async function reset(){if(!confirm('Reset all 11 stage labels and evidence fields to SalesOS defaults?'))return;setBusy(true);setError('');setNotice('');try{const saved=await request<Config>('/workspace-pipeline/'+orgId,{method:'DELETE'});setConfig(saved);setSelected(saved.stages[0]?.id||'ACCOUNT_RESEARCHED');setNotice('Pipeline reset to the SalesOS defaults.')}catch(e){setError(e instanceof Error?e.message:'Unable to reset pipeline.')}finally{setBusy(false)}}
 return <Panel title="Pipeline configuration" actions={<Badge>11 canonical stages</Badge>}>
  <div className="pipeline-settings-intro"><SlidersHorizontal size={19}/><div><strong>Customize the workflow without breaking reporting or automation.</strong><p>Stage IDs and ordering remain stable. You can rename stages, change evidence fields, and prefill fields from existing CRM data. System gates such as verified contacts, logged outreach and signed production contracts remain enforced.</p></div></div>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner">{notice}</div>}
  {config&&stage&&<div className="pipeline-settings-grid"><aside className="pipeline-stage-list">{config.stages.map((s,index)=><button type="button" key={s.id} className={s.id===selected?'active':''} onClick={()=>setSelected(s.id)}><span>{String(index+1).padStart(2,'0')}</span><strong>{s.label}</strong><small>{s.fields.length} fields</small></button>)}</aside>
   <div className="pipeline-stage-editor"><div className="field-grid"><Field label="Stage name"><input value={stage.label} maxLength={80} onChange={e=>updateStage({label:e.target.value})}/></Field><Field label="Short label"><input value={stage.short} maxLength={40} onChange={e=>updateStage({short:e.target.value})}/></Field></div>
    <div className="pipeline-field-head"><div><strong>Evidence fields</strong><p className="muted small-text">Auto-filled values are suggestions until a user saves the stage evidence.</p></div><Button variant="secondary" type="button" onClick={addField}><Plus size={15}/> Add field</Button></div>
    <div className="pipeline-field-list">{stage.fields.map((field,index)=><div className="pipeline-field-card" key={field.key+'-'+index}><div className="pipeline-field-card-head"><Badge>{field.key}</Badge><button type="button" className="icon-button" onClick={()=>updateStage({fields:stage.fields.filter((_,i)=>i!==index)})} aria-label={'Remove '+field.label}><Trash2 size={15}/></button></div>
     <div className="field-grid"><Field label="Field label"><input value={field.label} onChange={e=>{const label=e.target.value;updateField(index,{label,...(!field.key||field.key.startsWith('custom_field_')?{key:makeKey(label)}:{})})}}/></Field><Field label="Field type"><BrandSelect value={field.type} onValueChange={v=>updateField(index,{type:v as FieldType,...(v==='select'&&!field.options?{options:['Option 1','Option 2']}: {})})} ariaLabel="Field type"><option value="text">Short text</option><option value="textarea">Long text</option><option value="date">Date</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></BrandSelect></Field></div>
     <div className="field-grid"><Field label="Auto-pull from existing data"><BrandSelect value={field.autoFill||''} onValueChange={v=>updateField(index,{autoFill:v||undefined})} ariaLabel="Auto-fill source">{autoFillOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</BrandSelect></Field><Field label="Help text (optional)"><input value={field.help||''} maxLength={500} onChange={e=>updateField(index,{help:e.target.value})}/></Field></div>
     {field.type==='select'&&<Field label="Dropdown options"><input value={(field.options||[]).join(', ')} onChange={e=>updateField(index,{options:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)})} placeholder="Option A, Option B"/></Field>}
     <label className="checkbox-line"><input type="checkbox" checked={Boolean(field.required)} onChange={e=>updateField(index,{required:e.target.checked})}/>Required before automatic stage progression</label>
    </div>)}{stage.fields.length===0&&<div className="soft-callout"><DatabaseZap size={18}/>This stage has no custom evidence fields. Any built-in system gate still applies.</div>}</div>
    <div className="ws-nav-buttons"><Button type="button" loading={busy} onClick={()=>void save()}>Save pipeline settings</Button><Button variant="secondary" type="button" disabled={busy} onClick={()=>void reset()}><RotateCcw size={15}/> Reset defaults</Button></div>
   </div></div>}
 </Panel>;
}
