'use client';
import {FormEvent,useEffect,useMemo,useState} from 'react';
import {BookOpenCheck,Landmark,RefreshCw,ShieldCheck} from 'lucide-react';
import {Badge,BrandSelect,Button,ErrorMessage,Field,Modal,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';

type Journal={id:string;sourceType:string;sourceId:string;currency:string;memo:string;postedAt:string;postings:{id:string;accountCode:string;side:string;amountMinor:string}[]};
type Verify={checked:number;balanced:boolean;failures:string[];truncated:boolean};
type Coverage={complete:boolean;missing:{invoices:string[];payments:string[];credits:string[]};notice:string};
type Row={id:string;bankAccountReference:string;statementReference:string;currency:string;amountMinor:string;valueDate:string;paymentRecordId:string|null;matchedAt:string|null};
type Payment={id:string;reference:string;amount:string;paidAt:string;matched:boolean;invoice:{id:string;number:string;currency:string;account:{name:string}}};
type Reconciliation={rows:Row[];payments:Payment[]};
type Profile={role:string};

export function TenantAccountingPanel({orgId}:{orgId:string}){
 const [role,setRole]=useState(''),[journals,setJournals]=useState<Journal[]>([]),[verify,setVerify]=useState<Verify|null>(null),[coverage,setCoverage]=useState<Coverage|null>(null),[recon,setRecon]=useState<Reconciliation|null>(null);
 const [showImport,setShowImport]=useState(false),[bank,setBank]=useState({bankAccountReference:'',statementReference:'',amount:'',currency:'USD',valueDate:new Date().toISOString().slice(0,10)}),[matches,setMatches]=useState<Record<string,string>>({});
 const [reverseId,setReverseId]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const canFinance=['OWNER','ADMIN','FINANCE'].includes(role),canReverse=['OWNER','ADMIN'].includes(role);
 async function load(){
  const profile=await request<Profile>('/workspaces/'+orgId+'/profile');setRole(profile.role);
  if(!['OWNER','ADMIN','FINANCE'].includes(profile.role))return;
  const [j,v,c,r]=await Promise.all([request<Journal[]>('/workspace-accounting/'+orgId+'/journals'),request<Verify>('/workspace-accounting/'+orgId+'/verify'),request<Coverage>('/workspace-accounting/'+orgId+'/coverage'),request<Reconciliation>('/workspace-accounting/'+orgId+'/reconciliation')]);
  setJournals(j);setVerify(v);setCoverage(c);setRecon(r);
 }
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Unable to load accounting controls.'))},[orgId]);
 async function run(fn:()=>Promise<unknown>,message:string){setBusy(true);setError('');setNotice('');try{await fn();await load();setNotice(message);}catch(e){setError(e instanceof Error?e.message:'Accounting operation failed.')}finally{setBusy(false)}}
 async function importRow(e:FormEvent){e.preventDefault();await run(()=>post('/workspace-accounting/'+orgId+'/bank-rows',bank),'Bank statement row recorded for reconciliation.');setShowImport(false);setBank({...bank,statementReference:'',amount:''});}
 const unmatched=useMemo(()=>recon?.rows.filter(r=>!r.paymentRecordId)||[],[recon]);
 if(role&&!canFinance)return null;
 return <Panel title="Accounting ledger & reconciliation" actions={<BookOpenCheck size={18}/>}>
  <p className="muted small-text">SalesOS posts issued invoices, verified payments and approved credits as append-only journals. Reversals create new entries; original journals are never edited.</p>
  <ErrorMessage message={error}/>{notice&&<div className="success-banner">{notice}</div>}
  {canFinance&&<><div className="accounting-health-grid">
   <div><span>Journal integrity</span><strong>{verify?.balanced?'Balanced':'Review'}</strong><Badge tone={verify?.balanced?'green':'red'}>{verify?.checked||0} entries checked</Badge></div>
   <div><span>Posting coverage</span><strong>{coverage?.complete?'Complete':'Gaps found'}</strong><Badge tone={coverage?.complete?'green':'orange'}>{coverage?coverage.missing.invoices.length+coverage.missing.payments.length+coverage.missing.credits.length:0} missing</Badge></div>
   <div><span>Bank rows</span><strong>{recon?.rows.length||0}</strong><Badge>{unmatched.length} unmatched</Badge></div>
   <div><span>Payment records</span><strong>{recon?.payments.length||0}</strong><Badge>{recon?.payments.filter(p=>p.matched).length||0} matched</Badge></div>
  </div>
  {coverage&&!coverage.complete&&<div className="soft-callout"><ShieldCheck size={17}/><span>{coverage.notice}</span></div>}
  <div className="ws-nav-buttons"><Button variant="secondary" onClick={()=>setShowImport(v=>!v)}><Landmark size={15}/>{showImport?'Close bank entry':'Add bank statement row'}</Button><Button variant="secondary" disabled={busy} onClick={()=>void run(async()=>{},'Ledger checks refreshed.')}><RefreshCw size={15}/>Refresh controls</Button></div>
  {showImport&&<form className="commercial-action-form" onSubmit={importRow}><div className="field-grid"><Field label="Bank account reference"><input required maxLength={100} value={bank.bankAccountReference} onChange={e=>setBank({...bank,bankAccountReference:e.target.value})}/></Field><Field label="Statement reference"><input required maxLength={150} value={bank.statementReference} onChange={e=>setBank({...bank,statementReference:e.target.value})}/></Field></div><div className="field-grid"><Field label="Amount"><input required type="number" min="0.01" step="0.01" value={bank.amount} onChange={e=>setBank({...bank,amount:e.target.value})}/></Field><Field label="Currency"><input required maxLength={3} value={bank.currency} onChange={e=>setBank({...bank,currency:e.target.value.toUpperCase()})}/></Field><Field label="Value date"><input required type="date" value={bank.valueDate} onChange={e=>setBank({...bank,valueDate:e.target.value})}/></Field></div><Button loading={busy}>Record statement row</Button></form>}
  {!!unmatched.length&&<div className="accounting-reconciliation"><h3>Unmatched statement rows</h3>{unmatched.map(row=>{const candidates=(recon?.payments||[]).filter(p=>!p.matched&&p.invoice.currency===row.currency&&Math.round(Number(p.amount)*100)===Number(row.amountMinor));return <div className="record-row accounting-match-row" key={row.id}><div><strong>{row.currency} {(Number(row.amountMinor)/100).toFixed(2)}</strong><p>{row.statementReference} · {new Date(row.valueDate).toLocaleDateString()}</p></div><div className="ws-nav-buttons"><BrandSelect value={matches[row.id]||''} onValueChange={v=>setMatches(x=>({...x,[row.id]:v}))} ariaLabel={'Payment match '+row.statementReference}><option value="">Choose matching payment</option>{candidates.map(p=><option key={p.id} value={p.id}>{p.invoice.number} · {p.invoice.account.name} · {p.reference}</option>)}</BrandSelect><Button variant="secondary" disabled={busy||!matches[row.id]} onClick={()=>void run(()=>post('/workspace-accounting/'+orgId+'/bank-rows/'+row.id+'/match',{paymentId:matches[row.id]}),'Bank row matched to verified payment.')}>Match</Button></div></div>})}</div>}
  <div className="accounting-journal-list"><h3>Recent journals</h3>{journals.slice(0,30).map(j=><details className="survey-history-item" key={j.id}><summary className="record-row"><div><strong>{j.sourceType}</strong><p>{j.memo} · {new Date(j.postedAt).toLocaleString()}</p></div><div className="ws-nav-buttons"><Badge>{j.currency}</Badge>{canReverse&&j.sourceType!=='REVERSAL'&&<Button type="button" variant="ghost" onClick={e=>{e.preventDefault();setReverseId(j.id);setReason('')}}>Reverse</Button>}</div></summary><div className="survey-answer-grid">{j.postings.map(p=><div key={p.id}><span>{p.accountCode} · {p.side}</span><strong>{j.currency} {(Number(p.amountMinor)/100).toFixed(2)}</strong></div>)}</div></details>)}</div>
  </>}
  {reverseId&&<Modal title="Post reversing journal" onClose={()=>setReverseId('')}><div className="stack-16"><p className="muted small-text">The original entry remains immutable. SalesOS will create an equal and opposite journal and record your reason in the audit trail.</p><Field label="Reason for reversal"><textarea rows={3} minLength={15} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></Field><div className="modal-actions"><Button variant="secondary" onClick={()=>setReverseId('')}>Cancel</Button><Button variant="danger" disabled={reason.trim().length<15} loading={busy} onClick={()=>void run(()=>post('/workspace-accounting/'+orgId+'/journals/'+reverseId+'/reverse',{reason}),'Reversing journal posted.').then(()=>setReverseId(''))}>Post reversal</Button></div></div></Modal>}
 </Panel>;
}
