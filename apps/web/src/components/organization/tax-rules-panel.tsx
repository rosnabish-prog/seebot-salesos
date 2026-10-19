'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,patch,request} from '@/lib/api';

type TaxRule={id:string;code:string;name:string;jurisdiction:string;treatment:string;ratePercent:string;status:string;invoiceNote:string|null;approvedAt:string|null};
type Invoice={id:string;number:string;status:string;currency:string;subtotal?:string;total:string};
const treatments=['STANDARD','REDUCED','ZERO','EXEMPT','OUT_OF_SCOPE','REVERSE_CHARGE','OTHER_MANUAL'];
const empty={code:'',name:'',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'',invoiceNote:''};
const apiRoot=(id:string)=>`/workspace-tax/${id}`;
export function FinanceTaxRulesPanel({organizationId,invoices}:{organizationId:string;invoices:Invoice[]}){
 const [rules,setRules]=useState<TaxRule[]>([]);
 const [form,setForm]=useState(empty),[selected,setSelected]=useState(''),[invoiceId,setInvoiceId]=useState(''),[rationale,setRationale]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){setRules(await request<TaxRule[]>(`${apiRoot(organizationId)}/rules`));}
 useEffect(()=>{if(organizationId)void refresh().catch(e=>setError(e.message));},[organizationId]);
 const set=(field:keyof typeof empty,value:string)=>setForm(f=>({...f,[field]:value}));
 async function execute(fn:()=>Promise<any>){setBusy(true);setError('');setMessage('');try{const data=await fn();await refresh();setMessage(data?.reviewId?'Tax review saved to invoice with locked rate and total.':'Finance record saved.');}catch(e:any){setError(e.message||'Request failed.');}finally{setBusy(false);}}
 async function downloadCsv(){setBusy(true);setError('');try{
  const host=process.env.NEXT_PUBLIC_API_URL||'';
  const response=await fetch(`${host}/api${apiRoot(organizationId)}/rules.csv`,{credentials:'include'});
  if(!response.ok)throw Error('CSV export failed.');
  const blob=new Blob([await response.text()],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='salesos-tax-rules.csv';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),5000);
 }catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <Panel title="Finance tax rules" actions={<Button variant="secondary" type="button" disabled={busy} onClick={()=>void downloadCsv()}>Export CSV</Button>}>
  <p className="muted small-text">Tax treatment is chosen by Finance, not by AI. Drafts require approval before use. Approved rules are locked; create a new code for any updated rate. This panel is scoped to the selected organization.</p>
  <ErrorMessage message={error}/>{message&&<div className="success-banner" role="status">{message}</div>}
  <details><summary>Import edited CSV as draft rules</summary>
   <p className="muted small-text">Download the current CSV, add new rate/version codes, enter rates confirmed by Finance, then upload the edited CSV. Existing codes cannot be replaced. All imported rules require approval.</p>
   <Field label="CSV file"><input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>65000){setError('CSV must be under 65 KB.');return;}
    void file.text().then(csv=>execute(()=>post(`${apiRoot(organizationId)}/rules/import-csv`,{csv}))).catch(err=>setError(err.message));
    e.target.value='';
   }}/></Field>
  </details>
  <details open><summary>Tax catalog ({rules.length})</summary>
   <div className="table-scroll"><table className="data-table"><thead><tr><th>Code</th><th>Jurisdiction</th><th>Treatment</th><th>Rate</th><th>State</th><th>Finance action</th></tr></thead><tbody>{rules.map(rule=><tr key={rule.id}><td>{rule.code}<div className="muted small-text">{rule.name}</div></td><td>{rule.jurisdiction}</td><td>{rule.treatment}</td><td>{rule.ratePercent}%</td><td>{rule.status}</td><td>{rule.status==='DRAFT'?<Button variant="secondary" disabled={busy} onClick={()=>void execute(()=>post(`${apiRoot(organizationId)}/rules/${rule.id}/approve`,{}))}>Approve</Button>:rule.status==='APPROVED'?<Button variant="secondary" disabled={busy} onClick={()=>void execute(()=>post(`${apiRoot(organizationId)}/rules/${rule.id}/archive`,{}))}>Archive</Button>:null}</td></tr>)}</tbody></table></div>
   {!rules.length&&<p className="muted">No rules yet. Create a draft below; no tax rates are applied automatically.</p>}
  </details>
  <details style={{marginTop:16}}><summary>Create a finance tax rule</summary>
   <form className="stack-16" onSubmit={(e:FormEvent)=>{e.preventDefault();void execute(async()=>{const result=await post(`${apiRoot(organizationId)}/rules`,form);setForm(empty);return result;});}}>
    <div className="field-grid"><Field label="Unique rate/version code"><input required value={form.code} onChange={e=>set('code',e.target.value.toUpperCase())} placeholder="GB_STANDARD_2026"/></Field><Field label="Rule name"><input required value={form.name} onChange={e=>set('name',e.target.value)}/></Field></div>
    <div className="field-grid"><Field label="Country code"><input required maxLength={2} value={form.jurisdiction} onChange={e=>set('jurisdiction',e.target.value.toUpperCase())}/></Field><Field label="Treatment"><BrandSelect value={form.treatment} onValueChange={v=>set('treatment',v)} ariaLabel="Tax treatment">{treatments.map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</BrandSelect></Field><Field label="Finance-confirmed rate %"><input required type="number" min="0" max="100" step=".0001" value={form.ratePercent} onChange={e=>set('ratePercent',e.target.value)}/></Field></div>
    <Field label="Invoice wording (optional)"><textarea rows={2} maxLength={1000} value={form.invoiceNote} onChange={e=>set('invoiceNote',e.target.value)}/></Field>
    <Button disabled={busy||!form.code||!form.ratePercent&&form.ratePercent!=='0'}>Save rule draft</Button>
   </form>
  </details>
  <details style={{marginTop:16}}><summary>Apply an approved rule to an invoice draft</summary>
   <div className="stack-16">
    <Field label="Invoice draft"><BrandSelect value={invoiceId} onValueChange={setInvoiceId} ariaLabel="Invoice draft"><option value="">Choose a draft</option>{invoices.filter(i=>i.status==='DRAFT').map(i=><option key={i.id} value={i.id}>{i.number} · {i.currency} {i.total}</option>)}</BrandSelect></Field>
    <Field label="Finance-approved tax rule"><BrandSelect value={selected} onValueChange={setSelected} ariaLabel="Finance-approved tax rule"><option value="">Choose a rule</option>{rules.filter(r=>r.status==='APPROVED').map(r=><option key={r.id} value={r.id}>{r.code} — {r.ratePercent}% ({r.jurisdiction})</option>)}</BrandSelect></Field>
    <Field label="Document the tax basis"><textarea rows={2} minLength={15} value={rationale} onChange={e=>setRationale(e.target.value)} placeholder="Describe the confirmed supply and tax treatment."/></Field>
    <Button disabled={busy||!invoiceId||!selected||rationale.trim().length<15} onClick={()=>void execute(()=>post(`${apiRoot(organizationId)}/invoices/${invoiceId}/apply-rule`,{ruleId:selected,rationale}))}>Approve invoice tax calculation</Button>
   </div>
  </details>
 </Panel>;
}
