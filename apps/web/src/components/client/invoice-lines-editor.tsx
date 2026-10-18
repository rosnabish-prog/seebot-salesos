'use client';
import {useEffect,useState} from 'react';
import {Button,Field} from '@/components/ui';
import {request} from '@/lib/api';

type Line={description:string;quantity:string;unitPrice:string};
type Rate={id:string;serviceName:string;model:string;unit:string|null;rate:string|number;currency:string};
const clean=()=>({description:'',quantity:'1',unitPrice:''});
export function InvoiceLinesEditor({contractId,currency,lines,onChange}:{contractId:string;currency:string;lines:Line[];onChange:(v:Line[])=>void}){
 const [rates,setRates]=useState<Rate[]>([]),[error,setError]=useState('');
 useEffect(()=>{setRates([]);setError('');if(!contractId)return;request<Rate[]>(`/contracts/${contractId}/pricing`).then(setRates).catch(e=>setError(e.message))},[contractId]);
 const set=(index:number,key:keyof Line,value:string)=>onChange(lines.map((l,i)=>index===i?{...l,[key]:value}:l));
 const subtotal=lines.reduce((sum,l)=>sum+(Number(l.quantity)||0)*(Number(l.unitPrice)||0),0);
 return <div className="stack-16">
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><strong>Invoice line items</strong><Button variant="secondary" type="button" onClick={()=>onChange([...lines,clean()])}>+ Add line</Button></div>
  {!!rates.length&&<Field label="Use a contracted rate"><select defaultValue="" onChange={e=>{const r=rates.find(x=>x.id===e.target.value);if(!r)return;if(r.currency!==currency){setError(`Contract rate is ${r.currency}; choose a matching invoice currency.`);return;}onChange([...lines.filter(l=>l.description.trim()),{description:`${r.serviceName} (${r.model}${r.unit?`, ${r.unit}`:''})`,quantity:'1',unitPrice:String(r.rate)}]);e.target.value=''}}><option value="">Choose a service to add from contract</option>{rates.map(r=><option value={r.id} key={r.id}>{r.serviceName} · {r.currency} {Number(r.rate).toFixed(2)} · {r.model}</option>)}</select></Field>}
  {lines.map((l,i)=><div key={i} className="soft-callout"><div className="field-grid"><Field label={`Service ${i+1}`}><input required maxLength={300} value={l.description} onChange={e=>set(i,'description',e.target.value)} placeholder="Service / use case"/></Field><Field label="Quantity"><input type="number" required min="0.001" max="100000" step="0.001" value={l.quantity} onChange={e=>set(i,'quantity',e.target.value)}/></Field><Field label="Rate"><input type="number" required min="0" step="0.01" value={l.unitPrice} onChange={e=>set(i,'unitPrice',e.target.value)}/></Field></div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>{currency} {((Number(l.quantity)||0)*(Number(l.unitPrice)||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>{lines.length>1&&<Button variant="secondary" type="button" onClick={()=>onChange(lines.filter((_,j)=>j!==i))}>Remove</Button>}</div></div>)}
  <div><strong>Subtotal: {currency} {subtotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><p className="muted small-text">Only draft estimates; the backend recalculates totals on save. Issued invoices are immutable.</p></div>
  {error&&<p className="muted small-text" role="alert">{error}</p>}
 </div>;
}
