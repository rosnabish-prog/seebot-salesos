'use client';
import {useEffect,useState,FormEvent} from 'react';
import {request,post} from '@/lib/api';
import {Badge,Button,BrandSelect,ErrorMessage,Field} from '@/components/ui';
import {Plus} from 'lucide-react';

type PricingLine={id:string;serviceName:string;model:string;rate:string;currency:string;unit:string|null;billingFrequency:string|null;notes:string|null};
const types=['FIXED','HOURLY','UNIT','MONTHLY_RETAINER','FTE','MILESTONE','OUTCOME'];
export function ContractPricingPanel({contractId,status,currency,canEdit}:{contractId:string;status:string;currency:string;canEdit:boolean}){
  const [rows,setRows]=useState<PricingLine[]>([]),[edit,setEdit]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const [form,setForm]=useState({serviceName:'',model:'HOURLY',rate:'',currency,unit:'',billingFrequency:'Monthly',notes:''});
  const reload=()=>request<PricingLine[]>(`/contracts/${contractId}/pricing`).then(setRows).catch(e=>setError(e.message));
  useEffect(()=>{void reload()},[contractId]);
  async function save(e:FormEvent){e.preventDefault();setSaving(true);setError('');try{await post(`/contracts/${contractId}/pricing`,form);await reload();setEdit(false);setForm({serviceName:'',model:'HOURLY',rate:'',currency,unit:'',billingFrequency:'Monthly',notes:''});}catch(e){setError(e instanceof Error?e.message:'Failed to save pricing.');}finally{setSaving(false);}}
  return <div className="pricing-schedule">
    <div className="client-list-head"><strong>Pricing Schedule</strong>{canEdit&&status==='DRAFT'&&<Button type="button" variant="secondary" onClick={()=>setEdit(!edit)}><Plus size={14}/>Add use case</Button>}</div>
    {rows.map(row=><div className="record-row" key={row.id}><div><strong>{row.serviceName}</strong><p>{row.model.replaceAll('_',' ')}{row.unit?` · Per ${row.unit}`:''}{row.billingFrequency?` · ${row.billingFrequency}`:''}</p>{row.notes&&<small>{row.notes}</small>}</div><Badge>{row.currency} {row.rate}</Badge></div>)}
    {!rows.length&&<p className="muted small-text">No pricing lines yet. Each use case can have a separate rate and billing model.</p>}
    {edit&&status==='DRAFT'&&<form onSubmit={save} className="stack-16">
      <div className="field-grid"><Field label="Use case / service"><input required value={form.serviceName} onChange={e=>setForm({...form,serviceName:e.target.value})}/></Field><Field label="Pricing type"><BrandSelect value={form.model} onValueChange={v=>setForm({...form,model:v})}>{types.map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</BrandSelect></Field></div>
      <div className="field-grid"><Field label="Rate"><input type="number" min="0.000001" step="0.000001" required value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></Field><Field label="Measurement unit"><input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} placeholder="task, hour, page, image" required={form.model==='UNIT'}/></Field></div>
      <Field label="Billing frequency"><input value={form.billingFrequency} onChange={e=>setForm({...form,billingFrequency:e.target.value})}/></Field>
      <Field label="Commercial notes"><textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field>
      <Button type="submit" loading={saving}>Save Pricing Line</Button>
    </form>}
    <ErrorMessage message={error}/>
  </div>;
}
