'use client';
import {FormEvent,useEffect,useState} from 'react';
import {ClipboardList,Plus,RotateCcw,Trash2} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {patch,post,request} from '@/lib/api';

type Question={id:string;label:string;type:'RATING'|'TEXT'|'SINGLE'|'MULTI'|'YES_NO';required:boolean;min?:number;max?:number;options?:string[];metric?:'NPS'|'CSAT'|'NONE';help?:string};
type Template={id:string;name:string;description?:string|null;type:string;questions:Question[];active:boolean};
const initialQuestion=():Question=>({id:'overall_rating',label:'How would you rate your overall experience?',type:'RATING',required:true,min:1,max:5,metric:'NONE'});
export function SurveyTemplateManager({orgId}:{orgId:string}){
 const [templates,setTemplates]=useState<Template[]>([]),[editing,setEditing]=useState<string|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),[questions,setQuestions]=useState<Question[]>([initialQuestion()]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){const t=await request<{builtIns:Template[];custom:Template[]}>(`/workspace-surveys/${orgId}/templates`);setTemplates(t.custom);}
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load questionnaires.'))},[orgId]);
 function reset(){setEditing(null);setName('');setDescription('');setQuestions([initialQuestion()]);setError('');}
 function edit(t:Template){setEditing(t.id);setName(t.name);setDescription(t.description||'');setQuestions(t.questions.map(q=>({...q,options:q.options?[...q.options]:undefined})));setNotice('');setError('');}
 function update(index:number,data:Partial<Question>){setQuestions(rows=>rows.map((q,i)=>i===index?{...q,...data}:q))}
 function add(){let n=questions.length+1,id='question_'+n;const used=new Set(questions.map(q=>q.id));while(used.has(id))id='question_'+(++n);setQuestions(rows=>[...rows,{id,label:'',type:'TEXT',required:false,metric:'NONE'}])}
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');
  try{if(editing)await patch(`/workspace-surveys/${orgId}/templates/${editing}`,{name,description,questions});else await post(`/workspace-surveys/${orgId}/templates`,{name,description,questions});await load();setNotice(editing?'Questionnaire updated.':'Questionnaire created.');reset();}
  catch(e){setError(e instanceof Error?e.message:'Unable to save questionnaire.')}finally{setBusy(false)}
 }
 return <Panel title="Questionnaire templates" actions={<Badge>{templates.filter(t=>t.active).length} active</Badge>}>
  <p className="muted small-text">Create reusable client questionnaires. Ratings, written answers, single choice, multiple choice and Yes/No questions are supported. Built-in NPS and CSAT remain available automatically.</p>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner">{notice}</div>}
  <form className="survey-template-builder" onSubmit={save}>
   <div className="field-grid"><Field label="Questionnaire name"><input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Quarterly delivery review"/></Field><Field label="Description (optional)"><input maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What this questionnaire measures"/></Field></div>
   <div className="survey-builder-list">{questions.map((q,index)=><div className="survey-builder-question" key={q.id+'-'+index}>
    <div className="survey-builder-head"><strong>Question {index+1}</strong>{questions.length>1&&<button type="button" className="icon-button" aria-label={'Remove question '+(index+1)} onClick={()=>setQuestions(rows=>rows.filter((_,i)=>i!==index))}><Trash2 size={15}/></button>}</div>
    <div className="field-grid"><Field label="Question"><input required maxLength={300} value={q.label} onChange={e=>update(index,{label:e.target.value})}/></Field><Field label="Answer type"><BrandSelect value={q.type} onValueChange={value=>update(index,{type:value as Question['type'],...(value==='RATING'?{min:1,max:5}:{}),...((value==='SINGLE'||value==='MULTI')&&!q.options?{options:['Option 1','Option 2']}: {})})} ariaLabel={'Question '+(index+1)+' answer type'}><option value="RATING">Rating scale</option><option value="TEXT">Written response</option><option value="SINGLE">Single choice</option><option value="MULTI">Multiple choice</option><option value="YES_NO">Yes / No</option></BrandSelect></Field></div>
    {q.type==='RATING'&&<div className="field-grid"><Field label="Minimum"><input type="number" min={0} max={9} value={q.min??1} onChange={e=>update(index,{min:Number(e.target.value)})}/></Field><Field label="Maximum"><input type="number" min={1} max={10} value={q.max??5} onChange={e=>update(index,{max:Number(e.target.value)})}/></Field></div>}
    {(q.type==='SINGLE'||q.type==='MULTI')&&<Field label="Options"><input value={(q.options||[]).join(', ')} onChange={e=>update(index,{options:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)})} placeholder="Excellent, Good, Fair, Poor"/></Field>}
    <Field label="Help text (optional)"><input maxLength={500} value={q.help||''} onChange={e=>update(index,{help:e.target.value})}/></Field>
    <label className="checkbox-line"><input type="checkbox" checked={q.required} onChange={e=>update(index,{required:e.target.checked})}/>Required question</label>
   </div>)}</div>
   <div className="ws-nav-buttons"><Button type="button" variant="secondary" onClick={add}><Plus size={15}/> Add question</Button><Button type="submit" loading={busy}><ClipboardList size={15}/>{editing?'Save changes':'Create questionnaire'}</Button>{editing&&<Button type="button" variant="ghost" onClick={reset}><RotateCcw size={15}/>Cancel edit</Button>}</div>
  </form>
  <div className="survey-template-list">{templates.map(t=><div className="record-row" key={t.id}><div><strong>{t.name}</strong><p>{t.questions.length} questions · {t.description||'No description'}</p></div><div className="ws-nav-buttons"><Badge tone={t.active?'green':'neutral'}>{t.active?'Active':'Archived'}</Badge><Button type="button" variant="secondary" onClick={()=>edit(t)}>Edit</Button><Button type="button" variant="secondary" onClick={async()=>{setBusy(true);setError('');try{await patch(`/workspace-surveys/${orgId}/templates/${t.id}`,{active:!t.active});await load();}catch(e){setError(e instanceof Error?e.message:'Unable to update questionnaire.')}finally{setBusy(false)}}}>{t.active?'Archive':'Restore'}</Button></div></div>)}{!templates.length&&<p className="muted small-text">No custom questionnaires yet.</p>}</div>
 </Panel>;
}
