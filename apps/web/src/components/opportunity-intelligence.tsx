'use client';
import {useEffect,useState} from 'react';
import {post,patch,request} from '@/lib/api';
import {Badge,Button,BrandSelect,Panel} from '@/components/ui';
import {Sparkles,Search,Users,Mail,RefreshCw,Send,Info,Copy} from 'lucide-react';

type Run={id:string;kind:string;payload:any;createdAt:string};
type Contact={id:string;name:string;title:string;email:string|null;optedOut:boolean;verified:boolean};
type Draft={id:string;subject:string;body:string;status:string;contactId:string|null;contact?:Contact;version:number;revisions:{id:string;instruction:string;createdAt:string}[]};
type Message={id:string;direction:string;mode:string;body:string;subject:string;analysis?:any;createdAt:string};
type Overview={account:{id:string;name:string};contacts:Contact[];runs:Run[];drafts:Draft[];messages:Message[];mode:string};
type GmailStatus={configured:boolean;sendingEnabled:boolean;connection:{googleEmail:string;status:string}|null};
export function OpportunityIntelligence({accountId,section,editable,orgId,opportunityId,onChanged}:{accountId:string;section:'research'|'contacts'|'outreach';editable:boolean;orgId?:string;opportunityId?:string;onChanged?:()=>Promise<void>}){
  const accountBase=orgId?'/workspace-intelligence/'+orgId+'/accounts/'+accountId:'/intelligence/accounts/'+accountId;
  const draftBase=(draftId:string)=>orgId?'/workspace-intelligence/'+orgId+'/drafts/'+draftId:'/intelligence/drafts/'+draftId;
  const [data,setData]=useState<Overview|null>(null),[gmail,setGmail]=useState<GmailStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [recipient,setRecipient]=useState(''),[selectedDraft,setSelectedDraft]=useState(''),[subject,setSubject]=useState(''),[emailBody,setEmailBody]=useState(''),[revise,setRevise]=useState(''),[reply,setReply]=useState('');
  const load=async()=>{const d=await request<Overview>(accountBase);setData(d);return d};
  useEffect(()=>{load().catch(e=>setError(e.message));if(orgId)request<GmailStatus>('/workspace-integrations/'+orgId+'/gmail/status').then(setGmail).catch(()=>setGmail(null));},[accountId,orgId]);
  async function perform<T>(fn:()=>Promise<T>,success:string,after?:(result:T)=>void){setBusy(true);setNotice('');setError('');try{const result=await fn();await load();after?.(result);setNotice(success)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const latest=(kind:string)=>data?.runs.find(r=>r.kind===kind);
  const active=data?.drafts.find(d=>d.id===selectedDraft);
  function choose(d:Draft){setSelectedDraft(d.id);setSubject(d.subject);setEmailBody(d.body);setRevise('')}
  if(!data)return <div className="opp-inline-ai"><p>{error||'Loading integrated intelligence…'}</p></div>;
  return <section className="opp-inline-ai" aria-label={`${section} AI assistance`}>
    <div className="opp-ai-title"><span><Sparkles size={17}/> {section==='research'?'Company Research & Similar Companies':section==='contacts'?'Contact Intelligence':'Email & Conversation Intelligence'} <Badge tone="orange">Offline demo</Badge></span></div>
    <p className="opp-ai-subtitle">These tools work with the same company account as this opportunity. No external research, Apollo lookup or Gmail connection is performed in this preview.</p>
    {error&&<p className="opp-ai-error" role="alert">{error}</p>}{notice&&<p className="opp-ai-status" role="status">{notice}</p>}
    {section==='research'&&<>
      <div className="opp-ai-buttons"><Button type="button" disabled={!editable||busy} loading={busy} onClick={()=>perform(()=>post(accountBase+'/research',{}),'CRM-based research outline saved.')}><Search size={15}/> Prepare company research</Button><Button type="button" variant="secondary" disabled={!editable||busy} onClick={()=>perform(()=>post(accountBase+'/discover',{}),'Fictional example lookalikes generated.')}><Sparkles size={15}/> Discover similar companies</Button></div>
      {latest('RESEARCH')&&<div className="opp-ai-suggestion"><strong>{latest('RESEARCH')!.payload.title}</strong><p>{latest('RESEARCH')!.payload.summary}</p><p>{latest('RESEARCH')!.payload.fitHypothesis}</p><small>{latest('RESEARCH')!.payload.warning}</small></div>}
      {latest('LOOKALIKES')&&<div className="opp-ai-suggestions"><strong>Example similar companies — not real leads</strong>{(latest('LOOKALIKES')!.payload.companies||[]).map((c:any)=><div key={c.domain} className="opp-ai-suggestion"><strong>{c.name}</strong><p>{c.similarity}</p><small>{c.fit}</small></div>)}<p className="opp-ai-warning">{latest('LOOKALIKES')!.payload.warning}</p></div>}
    </>}
    {section==='contacts'&&<>
      <Button type="button" disabled={!editable||busy||!data.contacts.length} onClick={()=>perform(()=>post(accountBase+'/rank',{}),'Saved contact-role ranking generated.')}><Users size={15}/> Rank existing contacts</Button>
      <p className="opp-ai-subtitle">Apollo isn't connected. Rankings use only job titles and contacts already entered manually.</p>
      {latest('CONTACT_RANKING')&&(latest('CONTACT_RANKING')!.payload.rankings||[]).map((c:any)=><div className="opp-ai-ranking" key={c.contactId}><div><strong>{c.name}</strong><small>{c.title}</small><p>{c.reason}</p></div><Badge tone={c.canContact?'green':'neutral'}>{c.score}/100</Badge></div>)}
      {latest('CONTACT_RANKING')&&<p className="opp-ai-warning">{latest('CONTACT_RANKING')!.payload.warning}</p>}
    </>}
    {section==='outreach'&&<>
      <div className="opp-ai-conversation-grid"><div className="opp-ai-conversation-col">
        <label className="field"><span className="field-label">Recipient</span><BrandSelect value={recipient} onValueChange={setRecipient} ariaLabel="Choose email recipient"><option value="">Choose an existing contact</option>{data.contacts.filter(c=>c.email&&!c.optedOut).map(c=><option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}</BrandSelect></label>
        <Button type="button" disabled={!editable||busy||!recipient} onClick={()=>perform(()=>post<Draft>(accountBase+'/drafts',{contactId:recipient,...(opportunityId?{opportunityId}:{})}),'Editable demo email draft created.',choose)}><Sparkles size={15}/> Generate email draft</Button>
        <div className="opp-ai-suggestions"><strong>Saved drafts</strong>{data.drafts.map(d=><button type="button" key={d.id} className={`opp-ai-draft-pick ${selectedDraft===d.id?'selected':''}`} onClick={()=>choose(d)}><span>{d.subject}</span><small>{d.status==='DRAFT'?'Editable':'Simulated sent'} · v{d.version}</small></button>)}{!data.drafts.length&&<p className="muted">No drafts generated for this company.</p>}</div>
      </div><div className="opp-ai-conversation-col">
        {active?<><div className="opp-ai-title"><span><Mail size={16}/> Email editor</span><Badge>{active.status}</Badge></div><label className="field"><span className="field-label">Subject</span><input value={subject} onChange={e=>setSubject(e.currentTarget.value)} disabled={active.status!=='DRAFT'}/></label><label className="field"><span className="field-label">Email body</span><textarea rows={9} value={emailBody} onChange={e=>setEmailBody(e.currentTarget.value)} disabled={active.status!=='DRAFT'}/></label>
        {active.status==='DRAFT'&&<><div className="opp-ai-buttons"><Button type="button" variant="secondary" disabled={!editable||busy} onClick={()=>perform(()=>patch(draftBase(active.id),{subject,body:emailBody}),'Manual email edits saved with version history.')} >Save email edits</Button><Button type="button" variant="ghost" onClick={()=>navigator.clipboard.writeText(`Subject: ${subject}\n\n${emailBody}`).then(()=>setNotice('Copied draft.'))}><Copy size={14}/> Copy</Button></div><label className="field"><span className="field-label">Ask AI to revise this email</span><textarea rows={2} value={revise} onChange={e=>setRevise(e.currentTarget.value)} placeholder="Make it shorter, more technical, or more natural..."/></label><Button type="button" variant="secondary" disabled={!editable||busy||!revise.trim()} onClick={()=>perform(async()=>{await patch(draftBase(active.id),{subject,body:emailBody});return post<Draft>(draftBase(active.id)+'/revise',{instruction:revise})},'Demo email revision saved. Review the new draft.',choose)}><RefreshCw size={14}/> Revise email</Button><div className="opp-ai-buttons">{orgId&&gmail?.connection&&gmail.sendingEnabled&&<Button type="button" disabled={!editable||busy} onClick={()=>perform(async()=>{const result=await post(draftBase(active.id)+'/send',{});await onChanged?.();return result;},'Email sent through your connected Gmail.',()=>{})}><Send size={14}/> Send through Gmail</Button>}<Button type="button" variant={orgId&&gmail?.connection&&gmail.sendingEnabled?'secondary':'primary'} disabled={!editable||busy} onClick={()=>perform(()=>post(draftBase(active.id)+'/simulate-send',{}),'Simulated send only. No external email was sent.')}><Send size={14}/> Simulate sending</Button></div>{orgId&&<small className="muted">{gmail?.connection?(gmail.sendingEnabled?'Connected Gmail: '+gmail.connection.googleEmail:'Gmail connected, but live sending is disabled by deployment policy.'):'Connect Gmail in Team & Settings to enable reviewed live outreach.'}</small>}</>}
        {active.status==='SIMULATED_SENT'&&<><label className="field"><span className="field-label">Simulated client reply (fictional only)</span><textarea rows={3} value={reply} onChange={e=>setReply(e.currentTarget.value)} placeholder="Enter a fictional reply for testing..."/></label><Button type="button" disabled={!editable||busy||!reply.trim()} onClick={()=>perform(()=>post(draftBase(active.id)+'/simulate-reply',{reply}),'Simulated reply classified; no CRM stage was changed.',()=>setReply(''))}>Analyze demo reply</Button></>}
        {!!active.revisions?.length&&<details><summary>Revision history ({active.revisions.length})</summary>{active.revisions.map(r=><p key={r.id}><small>{new Date(r.createdAt).toLocaleString()}</small> {r.instruction}</p>)}</details>}</>:<div className="opp-ai-empty">Choose or generate a draft to edit the email here.</div>}
      </div></div>
      <div className="opp-ai-suggestions"><strong>Conversation timeline</strong>{data.messages.map(m=><div className="opp-ai-message" key={m.id}><div className="opp-ai-suggestion-head"><strong>{m.direction==='INBOUND'?'Fictional client reply':m.mode==='GMAIL'?'Gmail outreach':'Simulated outgoing email'}</strong><small>{new Date(m.createdAt).toLocaleString()}</small></div><p>{m.body}</p>{m.analysis&&<div><Badge tone="orange">{m.analysis.classification}</Badge><p>{m.analysis.nextAction}</p></div>}</div>)}{!data.messages.length&&<p className="muted">No demo messages for this account yet.</p>}</div>
    </>}
    <p className="opp-ai-footnote"><Info size={14}/> These intelligence records are linked to the account. Actual outreach must still be logged through verified SalesOS activities until Gmail is implemented.</p>
  </section>;
}
