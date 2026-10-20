'use client';
import {useEffect,useMemo,useState} from 'react';
import {STAGES,STAGE_FIELDS,StageId,StageField} from '@seebot/shared';
import {request,patch} from '@/lib/api';
import {Panel,Button,Field,ErrorMessage,SuccessMessage,BrandSelect,Badge} from '@/components/ui';
import {Plus,Trash2,Settings2,ArrowRightLeft} from 'lucide-react';
type Extra=StageField&{key:string};
type Config={extraFields:Partial<Record<StageId,Extra[]>>;mappings:Partial<Record<StageId,Record<string,string>>>};
type Payload={config:Config;version:number};
const empty=():Config=>({extraFields:{},mappings:{}});
const fixed=['account.name','account.domain','account.industry','account.hypothesis','opportunity.title','opportunity.serviceLine'];
export function PipelineSettingsPanel(){
 const[config,setConfig]=useState<Config>(empty),[version,setVersion]=useState(1),[stage,setStage]=useState<StageId>('ACCOUNT_RESEARCHED');
 const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const[draft,setDraft]=useState({key:'',label:'',type:'text',required:true,options:''});
 useEffect(()=>{request<Payload>('/pipeline-settings').then(data=>{setConfig(data.config);setVersion(data.version)}).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 const selected=STAGES.find(s=>s.id===stage)!;
 const fields=[...STAGE_FIELDS[stage],...(config.extraFields[stage]||[])];
 const prior=STAGES.slice(0,STAGES.findIndex(s=>s.id===stage)).flatMap(s=>[...STAGE_FIELDS[s.id],...(config.extraFields[s.id]||[])]);
 const sources=[...fixed,...Array.from(new Set(prior.map(f=>f.key))).map(key=>'evidence.'+key)];
 function setMapping(target:string,source:string){
   setConfig(old=>{const map={...(old.mappings[stage]||{})};if(source)map[target]=source;else delete map[target];return {...old,mappings:{...old.mappings,[stage]:map}};});
 }
 function addField(){
   setError('');
   const key='custom_'+draft.key.trim().toLowerCase().replace(/^custom_/,'').replace(/[^a-z0-9_]/g,'_');
   if(!/^custom_[a-z][a-z0-9_]{1,30}$/.test(key)||draft.label.trim().length<3){setError('Use a field key beginning with a letter (2–31 characters) and a descriptive label.');return;}
   if(fields.some(f=>f.key===key)){setError('That field key already exists.');return;}
   if((config.extraFields[stage]||[]).length>=8){setError('Maximum eight custom fields per stage.');return;}
   const options=draft.options.split(',').map(x=>x.trim()).filter(Boolean);
   if(draft.type==='select'&&(options.length<2||options.length>20)){setError('Select fields need 2–20 comma-separated choices.');return;}
   const field:Extra={key,label:draft.label.trim(),type:draft.type as Extra['type'],required:draft.required,...(draft.type==='select'?{options}:{})};
   setConfig(old=>({...old,extraFields:{...old.extraFields,[stage]:[...(old.extraFields[stage]||[]),field]}}));
   setDraft({key:'',label:'',type:'text',required:true,options:''});
 }
 function removeField(key:string){
   setConfig(old=>{
     const map={...(old.mappings[stage]||{})};delete map[key];
     return {...old,mappings:{...old.mappings,[stage]:map},extraFields:{...old.extraFields,[stage]:(old.extraFields[stage]||[]).filter(f=>f.key!==key)}};
   });
 }
 async function save(){
   setSaving(true);setError('');setSuccess('');
   try{const r=await patch<Payload>('/pipeline-settings',{config,version});setConfig(r.config);setVersion(r.version);setSuccess('Workflow configuration saved and audited.')}catch(e:any){setError(e.message)}finally{setSaving(false)}
 }
 return <Panel title="Sales Workflow Configuration" actions={<Badge>11 governed stages</Badge>}>
  <p className="muted small-text">Manage additional evidence fields and automatic data reuse. Mandatory company research, verified contacts, actual proposals, approvals and signed production agreements cannot be removed or bypassed. Changes apply to the Seebot workspace.</p>
  <ErrorMessage message={error}/><SuccessMessage text={success}/>
  {loading?<p role="status">Loading pipeline settings…</p>:<>
    <div className="toolbar"><Field label="Configure stage"><BrandSelect value={stage} onValueChange={v=>{setStage(v as StageId);setError('');setSuccess('')}}>{STAGES.map((s,i)=><option key={s.id} value={s.id}>{i+1}. {s.label}</option>)}</BrandSelect></Field></div>
    <div className="soft-callout"><Settings2 size={18}/><span><strong>{selected.label}</strong> · {fields.length} evidence fields · {STAGE_FIELDS[stage].length} system-defined (locked).</span></div>
    <div className="stack-16" style={{marginTop:17}}>
      {fields.map(f=><div key={f.key} className="panel" style={{padding:15,margin:0}}>
        <div className="row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><div><strong>{f.label}</strong><div className="tiny-note">{f.key} · {f.type} · {f.required?'Required':'Optional'}</div></div>
          {f.key.startsWith('custom_')?<Button type="button" variant="secondary" onClick={()=>removeField(f.key)}><Trash2 size={14}/>Remove</Button>:<Badge>System field</Badge>}
        </div>
        {stage!=='ACCOUNT_RESEARCHED'&&<div style={{marginTop:12}}><Field label="Prefill from an earlier stage or account field (optional)"><BrandSelect value={config.mappings[stage]?.[f.key]||''} onValueChange={v=>setMapping(f.key,v)}><option value="">Do not prefill</option>{sources.map(src=><option key={src} value={src}>{src}</option>)}</BrandSelect></Field></div>}
      </div>)}
    </div>
    {stage!=='CLOSED_WON'&&<div className="panel" style={{marginTop:17,padding:17}}>
      <h3>Add a stage evidence field</h3>
      <div className="field-grid">
        <Field label="Unique field key"><input placeholder="e.g. client_priority" value={draft.key} onChange={e=>setDraft(v=>({...v,key:e.target.value}))}/></Field>
        <Field label="Field label"><input placeholder="e.g. Client priority" value={draft.label} onChange={e=>setDraft(v=>({...v,label:e.target.value}))}/></Field>
        <Field label="Field type"><BrandSelect value={draft.type} onValueChange={type=>setDraft(v=>({...v,type}))}>{['text','textarea','date','select'].map(type=><option key={type} value={type}>{type}</option>)}</BrandSelect></Field>
        <Field label="Validation"><BrandSelect value={draft.required?'required':'optional'} onValueChange={v=>setDraft(d=>({...d,required:v==='required'}))}><option value="required">Required</option><option value="optional">Optional</option></BrandSelect></Field>
      </div>
      {draft.type==='select'&&<Field label="Options (comma-separated)"><input value={draft.options} onChange={e=>setDraft(v=>({...v,options:e.target.value}))} placeholder="High, Medium, Low"/></Field>}
      <div className="page-actions" style={{marginTop:13}}><Button type="button" variant="secondary" onClick={addField}><Plus size={15}/>Add field</Button></div>
    </div>}
    <div className="page-actions" style={{marginTop:16}}><Button type="button" loading={saving} onClick={()=>void save()}><ArrowRightLeft size={15}/>Save workflow settings</Button></div>
    <p className="tiny-note">Stored evidence remains attached to each historical stage visit. A new required field may prevent future advancement until its value is entered. Automatic copying never counts as contract signature or buyer authorization.</p>
  </>}
 </Panel>;
}
