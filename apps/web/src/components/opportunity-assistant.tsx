'use client';
import {useEffect,useState} from 'react';
import {STAGES,STAGE_FIELDS,StageId} from '@seebot/shared';
import {request,post,patch} from '@/lib/api';
import {Badge,Button} from '@/components/ui';
import {Sparkles,Save,RefreshCw,Check,Info,FileText,ChevronDown} from 'lucide-react';

type Suggestion={key:string;value:string;status:'INTERNAL_CONTEXT'|'RECOMMENDATION'|'NEEDS_EVIDENCE';reason:string};
type Draft={fields:Record<string,string>;notes:string;suggestions:Suggestion[];feedback:{instruction:string;at:string}[];updatedAt:string;version:number};
type Plan={id:string;payload:{warning:string;stages:{stage:string;title:string;position:number;complete:boolean;milestone:string;suggestions:Suggestion[]}[]};createdAt:string};
export type FieldAssistRequest={key:string;token:number}|null;
export function OpportunityAssistant({opportunityId,stage,editable,fields,onApply,requestField}:{opportunityId:string;stage:StageId;editable:boolean;fields:Record<string,string>;onApply:(next:Record<string,string>)=>void;requestField:FieldAssistRequest}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]),[savedDraft,setSavedDraft]=useState<Draft|null>(null);
  const [notes,setNotes]=useState(''),[instruction,setInstruction]=useState('');
  const [plan,setPlan]=useState<Plan|null>(null),[showPlan,setShowPlan]=useState(false),[showHistory,setShowHistory]=useState(false);
  const hasFields=(STAGE_FIELDS[stage]||[]).length>0;
  useEffect(()=>{let active=true;request<{draft:Draft|null;plans:Plan[]}>(`/opportunities/${opportunityId}/assistant`).then(d=>{
    if(!active)return;setSavedDraft(d.draft);setSuggestions(Array.isArray(d.draft?.suggestions)?d.draft.suggestions:[]);setNotes(d.draft?.notes||'');setPlan(d.plans?.[0]||null);
  }).catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[opportunityId,stage]);
  async function act<T>(fn:()=>Promise<T>,done:string,onDone?:(value:T)=>void){setBusy(true);setError('');setNotice('');try{const value=await fn();setNotice(done);onDone?.(value);}catch(e:any){setError(e.message||'Request failed.');}finally{setBusy(false)}}
  async function generate(fieldKey?:string,fictionalScenario=false){
    if(!editable)return;
    await act(()=>post<{suggestions:Suggestion[]}>(`/opportunities/${opportunityId}/assistant/generate`,{fieldKey,context:notes,fictionalScenario}),fictionalScenario?'Fictional sample data prepared; it cannot be validated as real evidence.':fieldKey?'Field-level demo suggestion prepared.':'Stage-wide demo suggestions prepared.',result=>{
      setSuggestions(previous=>fieldKey?[...previous.filter(s=>s.key!==fieldKey),...result.suggestions]:result.suggestions);
    });
  }
  useEffect(()=>{if(requestField?.key)void generate(requestField.key);},[requestField]);
  const applicable=suggestions.filter(s=>Boolean(s.value.trim()));
  function applyOne(s:Suggestion){onApply({...fields,[s.key]:s.value});setNotice(`${STAGE_FIELDS[stage].find(f=>f.key===s.key)?.label||s.key} inserted locally. Review and save when ready.`)}
  function applyEmpty(){const next={...fields};for(const s of applicable)if(!next[s.key]?.trim())next[s.key]=s.value;onApply(next);setNotice('Suggestions filled blank fields only. Existing manual entries were preserved.');}
  async function save(){await act(()=>patch<Draft>(`/opportunities/${opportunityId}/assistant/draft`,{stage,fields,notes}),'Draft saved privately. The Kanban stage has not advanced.',setSavedDraft)}
  async function revise(){if(!instruction.trim())return;
    await act(()=>post<{suggestedFields:Record<string,string>;changed:boolean;warning:string}>(`/opportunities/${opportunityId}/assistant/revise`,{stage,fields,instruction,notes}), 'Your feedback was recorded in the opportunity draft.',v=>{
      if(v.changed){setSuggestions(previous=>[...previous.filter(s=>!(s.key in v.suggestedFields)),...Object.entries(v.suggestedFields).filter(([k,value])=>value&&value!==fields[k]).map(([key,value])=>({key,value,status:'RECOMMENDATION' as const,reason:'Demo formatting revision. Review before applying.'}))]);}
      else setNotice(v.warning);
      request<{draft:Draft|null}>(`/opportunities/${opportunityId}/assistant`).then(next=>setSavedDraft(next.draft)).catch(()=>{});
    });
  }
  async function fullPlan(){await act(()=>post<Plan>(`/opportunities/${opportunityId}/assistant/plan`,{context:notes}),'Planning blueprint created. No stages were completed.',v=>{setPlan(v);setShowPlan(true)})}
  return <section className="opp-ai-assist" aria-label="AI-assisted stage drafting">
    <div className="opp-ai-title"><span><Sparkles size={17}/> AI Form Assistant <Badge tone="orange">Offline demo</Badge></span><small>Optional · All changes require review</small></div>
    <p className="opp-ai-subtitle">Fill everything manually, prepare a stage-wide draft, or request an individual field suggestion. Select Load fictional test data for realistic, clearly marked test scenarios with client change requests. Mock results otherwise use existing CRM information; employee notes are preserved, but detailed AI reasoning requires a live provider. No external research is performed.</p>
    <div className="opp-ai-buttons">
      <Button type="button" onClick={()=>generate()} loading={busy} disabled={!editable||!hasFields}><Sparkles size={15}/> Generate entire stage</Button>
      <Button type="button" variant="secondary" onClick={()=>generate(undefined,true)} disabled={!editable||busy||!hasFields}><Sparkles size={15}/> Load fictional test data</Button>
      <Button type="button" variant="secondary" onClick={fullPlan} disabled={!editable||busy}><FileText size={15}/> Build full opportunity plan</Button>
      <Button type="button" variant="secondary" onClick={save} disabled={!editable||busy}><Save size={15}/> Save draft</Button>
    </div>
    <label className="field"><span className="field-label">Your context or account-specific corrections (optional)</span><textarea value={notes} onChange={e=>setNotes(e.currentTarget.value)} rows={2} maxLength={4000} placeholder="What have you learned about this company? What should AI focus on or avoid assuming?"/></label>
    {error&&<p className="opp-ai-error" role="alert">{error}</p>}{notice&&<p className="opp-ai-status" role="status">{notice}</p>}
    {savedDraft&&<div className="opp-ai-draft-line"><span>Draft v{savedDraft.version} · saved {new Date(savedDraft.updatedAt).toLocaleString()}</span><Button type="button" variant="ghost" onClick={()=>{onApply({...fields,...savedDraft.fields});setNotice('Saved draft restored to the form. No official evidence changed.')}}>Restore saved draft</Button></div>}
    {suggestions.length>0&&<div className="opp-ai-suggestions">
      <div className="opp-ai-suggestion-head"><strong>Suggested field answers ({applicable.length} available)</strong><Button type="button" variant="secondary" disabled={!editable||!applicable.length} onClick={applyEmpty}><Check size={14}/> Fill empty fields</Button></div>
      {suggestions.map(s=><div className="opp-ai-suggestion" key={s.key}>
        <div className="opp-ai-suggestion-head"><strong>{STAGE_FIELDS[stage].find(f=>f.key===s.key)?.label||s.key}</strong><Badge tone={s.status==='NEEDS_EVIDENCE'?'neutral':'orange'}>{s.status==='NEEDS_EVIDENCE'?'Evidence required':s.status==='INTERNAL_CONTEXT'?'CRM context':'Suggestion'}</Badge></div>
        {s.value?<p>{s.value}</p>:<p className="muted">Leave blank until independently verified.</p>}
        <small>{s.reason}</small>{s.value&&editable&&<div className="opp-ai-suggestion-actions"><Button type="button" variant="ghost" onClick={()=>applyOne(s)}>{fields[s.key]?.trim()?'Replace this field':'Apply to field'}</Button></div>}
      </div>)}
    </div>}
    <div className="opp-ai-feedback">
      <label className="field"><span className="field-label">Tell AI what to change across this form</span><textarea value={instruction} onChange={e=>setInstruction(e.currentTarget.value)} rows={2} maxLength={2000} placeholder="Make it more technical, shorter, focus on multilingual evaluation, avoid assuming the client has confirmed a budget..."/></label>
      <Button type="button" variant="secondary" disabled={!editable||busy||!instruction.trim()} onClick={revise}><RefreshCw size={14}/> Request revision</Button>
      <small>Demo mode supports simple formatting revisions and saves your feedback. Natural-language reasoning will activate when OpenAI is connected.</small>
    </div>
    {plan&&<div className="opp-ai-plan"><button type="button" className="opp-ai-plan-toggle" onClick={()=>setShowPlan(v=>!v)} aria-expanded={showPlan}><span><FileText size={16}/> Full opportunity blueprint <Badge>Planning only</Badge></span><ChevronDown size={16}/></button>
      {showPlan&&<><p className="opp-ai-warning"><Info size={15}/> {plan.payload.warning}</p><div className="opp-ai-blueprint">{plan.payload.stages?.map((s,i)=><details key={s.stage} open={i===0}><summary><span>{String(i+1).padStart(2,'0')}. {s.title}</span><small>{i===0?'Research preparation':'Future evidence required'}</small></summary><p>{s.milestone}</p>{s.suggestions.filter(x=>x.value).map(x=><p key={x.key}><strong>{STAGE_FIELDS[s.stage as StageId]?.find(f=>f.key===x.key)?.label}: </strong>{x.value}</p>)}</details>)}</div></>}
    </div>}
    {!!savedDraft?.feedback?.length&&<div className="opp-ai-history"><button type="button" onClick={()=>setShowHistory(v=>!v)}>Feedback history ({savedDraft.feedback.length})</button>{showHistory&&savedDraft.feedback.slice(-5).map((f,i)=><p key={i}><small>{new Date(f.at).toLocaleString()}</small> {f.instruction}</p>)}</div>}
    <p className="opp-ai-footnote"><Info size={14}/> Generating, applying, or saving drafts never advances the Kanban. Only Save & Validate submits evidence to the stage validator.</p>
  </section>;
}
