'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {BarChart3,MessageSquareText,Star,UsersRound} from 'lucide-react';
import {Badge,Empty,ErrorMessage,PageTop,Panel} from '@/components/ui';
import {fmtDate,request} from '@/lib/api';
import {SurveyTemplateManager} from '@/components/client/survey-template-manager';

type Overview={
 summary:{sent:number;responses:number;responseRate:number|null;nps:number|null;csat:number|null;activeTemplates:number};
 ratings:{label:string;average:number;responses:number;min:number;max:number}[];
 clients:{accountId:string;name:string;responses:number;nps:number|null;csat:number|null;lastResponseAt:string|null}[];
 recent:{id:string;title:string;status:string;score:number|null;feedback:string|null;createdAt:string;respondedAt:string|null;recipientEmail:string;account:{id:string;name:string}}[];
};
export default function ClientSatisfaction(){
 const params=useParams(),orgId=String(params.id||'');
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 useEffect(()=>{let active=true;setBusy(true);void request<Overview>('/workspace-surveys/'+orgId+'/overview').then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load client satisfaction.')}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[orgId]);
 return <section className="tenant-satisfaction">
  <PageTop kicker="CLIENT SUCCESS" title="Client Satisfaction" description="Measure relationship health with NPS, CSAT, custom ratings and reusable questionnaires. Responses stay attached to the same client account used throughout SalesOS." action={<Link href={'/workspaces/'+orgId+'/clients'} className="btn btn-secondary"><UsersRound size={16}/> Client Management</Link>}/>
  <ErrorMessage message={error}/>
  {busy?<div className="panel">Loading satisfaction analytics…</div>:data&&<>
   <div className="metrics-grid satisfaction-metrics">
    <div className="metric-card"><span className="metric-icon"><MessageSquareText size={20}/></span><small>Responses</small><strong>{data.summary.responses}</strong><p>{data.summary.sent} invitations</p></div>
    <div className="metric-card"><span className="metric-icon"><BarChart3 size={20}/></span><small>Response rate</small><strong>{data.summary.responseRate==null?'—':data.summary.responseRate+'%'}</strong><p>Submitted / active invitations</p></div>
    <div className="metric-card"><span className="metric-icon"><Star size={20}/></span><small>NPS</small><strong>{data.summary.nps??'—'}</strong><p>Promoters minus detractors</p></div>
    <div className="metric-card"><span className="metric-icon"><Star size={20}/></span><small>CSAT</small><strong>{data.summary.csat==null?'—':data.summary.csat+'%'}</strong><p>Scores 4–5 on the standard scale</p></div>
   </div>
   <div className="tenant-dashboard-grid">
    <Panel title="Rating questions">{data.ratings.length?<div className="satisfaction-rating-list">{data.ratings.map(r=><div className="record-row" key={r.label}><div><strong>{r.label}</strong><p>{r.responses} response{r.responses===1?'':'s'} · scale {r.min}–{r.max}</p></div><span className="satisfaction-average">{r.average}/{r.max}</span></div>)}</div>:<Empty title="No rating responses yet" description="Send an NPS, CSAT or custom questionnaire to begin measuring client satisfaction."/>}</Panel>
    <Panel title="Client satisfaction by relationship">{data.clients.length?<div className="satisfaction-client-list">{data.clients.map(c=><Link href={'/workspaces/'+orgId+'/clients/'+c.accountId} className="record-row" key={c.accountId}><div><strong>{c.name}</strong><p>{c.responses} responses · last {c.lastResponseAt?fmtDate(c.lastResponseAt):'—'}</p></div><div className="satisfaction-client-scores"><Badge>NPS {c.nps??'—'}</Badge><Badge>CSAT {c.csat??'—'}</Badge></div></Link>)}</div>:<Empty title="No completed client questionnaires" description="Client-level satisfaction appears after the first response."/>}</Panel>
   </div>
   <Panel title="Recent survey activity">{data.recent.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Client</th><th>Questionnaire</th><th>Recipient</th><th>Status</th><th>Score</th><th>Response</th></tr></thead><tbody>{data.recent.map(row=><tr key={row.id}><td><Link className="text-link" href={'/workspaces/'+orgId+'/clients/'+row.account.id}>{row.account.name}</Link></td><td>{row.title}</td><td>{row.recipientEmail}</td><td><Badge tone={row.status==='ANSWERED'?'green':'neutral'}>{row.status}</Badge></td><td>{row.score??'—'}</td><td>{row.respondedAt?fmtDate(row.respondedAt):'—'}</td></tr>)}</tbody></table></div>:<Empty title="No survey activity yet" description="Use a client record to send the first satisfaction survey."/>}</Panel>
   <SurveyTemplateManager orgId={orgId}/>
  </>}
 </section>;
}
