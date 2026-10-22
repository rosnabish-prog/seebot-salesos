'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {Badge,ErrorMessage,PageTop,Panel,Empty} from '@/components/ui';
import {request} from '@/lib/api';
import {WorkspaceCommercialCreationPanel} from '@/components/organization/workspace-commercial-creation-panel';
import {FinanceTaxRulesPanel} from '@/components/organization/tax-rules-panel';
import {TenantFinanceInvoicePanel} from '@/components/organization/tenant-finance-invoice-panel';
import {TenantAccountingPanel} from '@/components/organization/tenant-accounting-panel';
import {TenantFinanceAutomationPanel} from '@/components/organization/tenant-finance-automation-panel';
import {FileSignature,ReceiptText,ShieldCheck,WalletCards} from 'lucide-react';

type Opportunity={id:string;accountId:string;title:string;stage:string;status:string};
type Client={id:string;name:string;domain:string;relationshipStatus?:string};
type Contract={id:string;title:string;type:string;status:string;committedAmount?:string|null;currency?:string|null};
type Invoice={id:string;number:string;status:string;currency:string;total:string};
type Summary={accounts:number;clients:number;opportunities:number;contracts:number;invoices:number;mode:string;invoicedByCurrency:Record<string,number>};
const endpoint=(id:string,section:string)=>'/workspace-business/'+id+'/'+section;

export default function ContractsFinance(){
 const params=useParams(),orgId=String(params.id||'');
 const [summary,setSummary]=useState<Summary|null>(null),[opportunities,setOpportunities]=useState<Opportunity[]>([]),[clients,setClients]=useState<Client[]>([]),[contracts,setContracts]=useState<Contract[]>([]),[invoices,setInvoices]=useState<Invoice[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function refresh(){
  const [s,o,c,ct,i]=await Promise.all([
   request<Summary>(endpoint(orgId,'dashboard')),
   request<Opportunity[]>(endpoint(orgId,'opportunities')),
   request<Client[]>(endpoint(orgId,'clients')),
   request<Contract[]>(endpoint(orgId,'contracts')),
   request<Invoice[]>(endpoint(orgId,'invoices'))
  ]);
  setSummary(s);setOpportunities(o);setClients(c);setContracts(ct);setInvoices(i);
 }
 useEffect(()=>{let active=true;setLoading(true);void refresh().catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load contracts and finance.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[orgId]);
 return <section className="commercial-hub">
  <PageTop kicker="COMMERCIAL OPERATIONS" title="Contracts & Finance" description="Manage commercial agreements, invoices, tax review and payment records from the same customer relationship. Financial actions remain approval-based and auditable."/>
  <ErrorMessage message={error}/>
  {summary?.mode==='DEMO_ONLY'&&<div className="tenant-preview-message"><ShieldCheck size={17}/>Private development workspace · use fictional test records only.</div>}
  {loading?<div className="panel">Loading commercial workspace…</div>:<>
   <div className="metrics-grid">
    <div className="metric-card"><span className="metric-icon"><FileSignature size={20}/></span><small>Contracts</small><strong>{summary?.contracts||0}</strong><p>Across all customer relationships</p></div>
    <div className="metric-card"><span className="metric-icon"><ReceiptText size={20}/></span><small>Invoices</small><strong>{summary?.invoices||0}</strong><p>Draft, issued and paid records</p></div>
    <div className="metric-card"><span className="metric-icon"><WalletCards size={20}/></span><small>Client relationships</small><strong>{clients.length}</strong><p>Contracting and active clients</p></div>
    <div className="metric-card"><span className="metric-icon"><ShieldCheck size={20}/></span><small>Open opportunities</small><strong>{opportunities.filter(o=>o.status==='OPEN').length}</strong><p>Available for commercial actions</p></div>
   </div>
   <WorkspaceCommercialCreationPanel orgId={orgId} onChanged={refresh}/>
   <div className="tenant-dashboard-grid">
    <Panel title="Contracts">{contracts.length?<div className="stack-16">{contracts.slice(0,12).map(c=><Link href={'/workspaces/'+orgId+'/contracts/'+c.id} className="record-row" key={c.id}><div><strong>{c.title}</strong><p>{c.type}{c.committedAmount?' · '+(c.currency||'')+' '+c.committedAmount:''}</p></div><Badge tone={c.status==='SIGNED'?'green':'neutral'}>{c.status}</Badge></Link>)}</div>:<Empty title="No contracts yet" description="Create contracts from a qualified opportunity when commercial work begins."/>}</Panel>
    <Panel title="Invoice register">{invoices.length?<div className="stack-16">{invoices.slice(0,12).map(i=><div className="record-row" key={i.id}><div><strong>{i.number}</strong><p>{i.currency} {Number(i.total).toLocaleString()}</p></div><Badge>{i.status}</Badge></div>)}</div>:<Empty title="No invoices yet" description="Billing starts only when the relationship and commercial terms require it."/>}</Panel>
   </div>
   <TenantFinanceInvoicePanel orgId={orgId} invoices={invoices}/>
   <FinanceTaxRulesPanel organizationId={orgId} invoices={invoices}/>
   <TenantFinanceAutomationPanel orgId={orgId} onChanged={refresh}/>
   <TenantAccountingPanel orgId={orgId}/>
  </>}
 </section>;
}
