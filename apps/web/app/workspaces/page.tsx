'use client';
import {useEffect,useState,FormEvent,KeyboardEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Building2,Check,ChevronLeft,ChevronRight,Mail,Plus,ShieldCheck,UsersRound,X} from 'lucide-react';
import {request,post,patch} from '@/lib/api';
import {Button,ErrorMessage,Field,BrandSelect} from '@/components/ui';

type Workspace={id:string;name:string;slug:string;role:string;isCreator?:boolean;status:string;crmEnabled:boolean;tenantCrmEnabled?:boolean;logoUrl?:string};
type Profile={organization:Record<string,any>;settings?:{plan:string;setupComplete:boolean;targetIndustries:string[]};role:string;crmEnabled:boolean};
type Invitation={id:string;email:string;role:string;status:string;expiresAt:string};
type SendResult={delivery:string;inviteUrl?:string;recipientEmail:string;notice:string};
const industries=['Technology & Software','AI & Data','Computer Vision','Sports & Entertainment','Media & Advertising','Professional Services','Manufacturing','Healthcare','Finance & Insurance','Retail & Commerce','Education','Other'];
const countries=[['GB','United Kingdom'],['NP','Nepal'],['US','United States'],['IN','India'],['CA','Canada'],['AU','Australia'],['DE','Germany'],['FR','France'],['SG','Singapore'],['AE','United Arab Emirates'],['IL','Israel']];
const currencies=['GBP','USD','NPR','INR','EUR','CAD','AUD','SGD','AED','ILS'];
const zones=['Europe/London','Asia/Kathmandu','America/New_York','America/Los_Angeles','Asia/Kolkata','Europe/Berlin','Asia/Singapore','Asia/Dubai','Australia/Sydney','UTC'];
const companyDefaults={name:'',website:'',industry:'Technology & Software',country:'GB',timezone:'Europe/London',defaultCurrency:'GBP',legalName:'',description:'',idealCustomers:'',services:'',targetIndustries:'',billingAddress:'',logoUrl:'',taxRegistrationNumber:''};
const emailPattern=/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
function EmailChips({emails,setEmails,disabled=false}:{emails:string[];setEmails:(xs:string[])=>void;disabled?:boolean}){
 const [draft,setDraft]=useState(''),[error,setError]=useState('');
 function commit(text:string){
  const parts=text.split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!parts.length)return;
  const invalid=parts.find(x=>!emailPattern.test(x));
  if(invalid){setError('Check the email address: '+invalid);return;}
  if(emails.length+parts.filter(x=>!emails.includes(x)).length>25){setError('Invite up to 25 teammates at a time.');return;}
  setEmails([...new Set([...emails,...parts])]);setDraft('');setError('');
 }
 function key(e:KeyboardEvent<HTMLInputElement>){
  if(e.key==='Enter'||e.key===','||e.key===';'){e.preventDefault();commit(draft);}
  if(e.key==='Backspace'&&!draft&&emails.length)setEmails(emails.slice(0,-1));
 }
 return <div className="ws-chip-section">
  <div className="ws-chip-input" onClick={e=>{(e.currentTarget.querySelector('input') as HTMLInputElement|null)?.focus()}}>
   {emails.map(email=><span key={email} className="ws-chip">{email}<button type="button" aria-label={'Remove '+email} disabled={disabled} onClick={e=>{e.stopPropagation();setEmails(emails.filter(x=>x!==email));}}><X size={13}/></button></span>)}
   <input aria-label="Invite team email addresses" type="text" inputMode="email" value={draft} disabled={disabled}
    placeholder={emails.length?'Add another email':'name@company.com, teammate@company.com'}
    onChange={e=>{const value=e.target.value;if(/[,;\n]/.test(value)){commit(value);}else{setDraft(value);setError('');}}}
    onKeyDown={key} onBlur={()=>{if(draft.trim())commit(draft)}}/>
  </div>
  <p className="ws-field-note">Separate emails with commas, or press Enter to create a chip. Remove an address with ×.</p>
  {error&&<p className="ws-inline-error" role="alert">{error}</p>}
 </div>;
}
function SelectField({label,value,onChange,options,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];disabled?:boolean}){
 return <Field label={label}><div className={disabled?'ws-select-disabled':''}><BrandSelect value={value} onValueChange={v=>{if(!disabled)onChange(v)}} ariaLabel={label}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</BrandSelect></div></Field>;
}
const optionize=(list:string[])=>list.map(value=>({value,label:value}));
export default function WorkspacesPage(){
 const router=useRouter();
 const [items,setItems]=useState<Workspace[]>([]),[loaded,setLoaded]=useState(false),[selected,setSelected]=useState<Workspace|null>(null);
 const [profile,setProfile]=useState(companyDefaults),[createForm,setCreateForm]=useState(companyDefaults),[stage,setStage]=useState<'company'|'invite'|'complete'>('company');
 const [emails,setEmails]=useState<string[]>([]),[inviteRole,setInviteRole]=useState('MEMBER'),[results,setResults]=useState<SendResult[]>([]),[members,setMembers]=useState<any[]>([]),[invitations,setInvitations]=useState<Invitation[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[teamExpanded,setTeamExpanded]=useState(false);
 async function list(){const workspaces=await request<Workspace[]>('/workspaces');setItems(workspaces);setLoaded(true);return workspaces;}
 useEffect(()=>{void list().then(workspaces=>{
   const manage=new URLSearchParams(window.location.search).get('manage');const requested=workspaces.find(w=>w.id===manage);
   if(requested)void open(requested);
 }).catch(e=>{if(e.status===401)router.replace('/login');else setError(e.message);setLoaded(true);});},[]);
 async function open(workspace:Workspace){
  setError('');try{
   await post('/workspaces/'+workspace.id+'/select',{});
   setSelected(workspace);setStage('complete');setResults([]);
   const p=await request<Profile>('/workspaces/'+workspace.id+'/profile');
   setProfile({...companyDefaults,...p.organization,services:Array.isArray(p.organization.services)?p.organization.services.join(', '):'',targetIndustries:(p.settings?.targetIndustries||[]).join(', ')});
   if(['OWNER','ADMIN'].includes(workspace.role)){const [m,inv]=await Promise.all([request<any[]>('/workspaces/'+workspace.id+'/members'),request<Invitation[]>('/workspace-invitations/organizations/'+workspace.id)]);setMembers(m);setInvitations(inv);}
   else{setMembers([]);setInvitations([]);}
  }catch(e){setError(e instanceof Error?e.message:'Could not open the workspace.');}
 }
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   const w=await post<Workspace>('/workspaces',{
    name:createForm.name.trim(),website:createForm.website.trim(),industry:createForm.industry,
    country:createForm.country,timezone:createForm.timezone,defaultCurrency:createForm.defaultCurrency
   });
   await post('/workspaces/'+w.id+'/select',{});
   setItems([w]);setSelected(w);setProfile({...companyDefaults,...createForm});setStage('invite');
   router.replace('/workspaces?manage='+encodeURIComponent(w.id));
  }catch(e){setError(e instanceof Error?e.message:'Company setup failed.');}finally{setBusy(false);}
 }
 async function sendInvitations(){
  if(!selected)return;
  setBusy(true);setError('');setNotice('');
  const sent:SendResult[]=[];const errors:string[]=[];
  for(const email of emails){
   try{
    const localName=email.split('@')[0].replace(/[._-]+/g,' ').trim();
    const reply=await post<SendResult>('/workspace-invitations/organizations/'+selected.id,{name:localName.length>=2?localName:'Team member',email,role:inviteRole});
    sent.push(reply);
   }catch(e){errors.push(email+': '+(e instanceof Error?e.message:'Unable to invite'));}
  }
  setResults(prev=>[...prev,...sent]);setEmails(errors.map(x=>x.split(': ')[0]));
  if(sent.length)setNotice(sent.length+' invitation'+(sent.length===1?'':'s')+' created. See delivery details below.');
  if(errors.length)setError(errors.join(' · '));
  setBusy(false);
  const inv=await request<Invitation[]>('/workspace-invitations/organizations/'+selected.id).catch(()=>[]);setInvitations(inv);
 }
 async function save(e:FormEvent){
  e.preventDefault();if(!selected)return;setBusy(true);setError('');setNotice('');
  try{
   await patch('/workspaces/'+selected.id+'/profile',{
    ...profile,services:profile.services.split(',').map(x=>x.trim()).filter(Boolean),
    targetIndustries:profile.targetIndustries.split(',').map(x=>x.trim()).filter(Boolean)
   });
   setNotice('Company settings saved successfully.');
  }catch(e){setError(e instanceof Error?e.message:'Could not save company settings.');}
  finally{setBusy(false);}
 }
 async function choose(w:Workspace){
  setBusy(true);setError('');
  try{
   const selection=await post<{crmEnabled:boolean;tenantCrmEnabled:boolean}>('/workspaces/'+w.id+'/select',{});
   if(selection.crmEnabled)router.push('/dashboard');
   else if(selection.tenantCrmEnabled)router.push('/workspaces/'+w.id+'/accounts');
   else await open(w);
  }catch(e){setError(e instanceof Error?e.message:'Could not select the workspace.');}
  finally{setBusy(false);}
 }
 async function uploadLogo(file:File){
  if(!selected)return;setBusy(true);setError('');
  try{
   const data=new FormData();data.append('file',file);
   const base=process.env.NEXT_PUBLIC_API_URL??'';
   const response=await fetch(base+'/api/workspaces/'+selected.id+'/logo',{method:'POST',credentials:'include',body:data});
   if(!response.ok)throw Error('Unable to upload company logo.');
   setNotice('Company logo saved.');
  }catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setBusy(false);}
 }
 function change(key:keyof typeof companyDefaults,value:string,mode:'create'|'profile'){
  if(mode==='create')setCreateForm(prev=>({...prev,[key]:value}));
  else setProfile(prev=>({...prev,[key]:value}));
 }
 function fieldGroup(form:typeof companyDefaults,mode:'create'|'profile',disabled=false){
  const set=(key:keyof typeof companyDefaults)=>(value:string)=>change(key,value,mode);
  return <div className="ws-form-fields">
   <div className="ws-two"><Field label="Company name *"><input required disabled={disabled} value={form.name} onChange={e=>set('name')(e.target.value)} maxLength={160} placeholder="Acme Technologies"/></Field>
    <Field label="Company website"><input type="url" disabled={disabled} value={form.website} onChange={e=>set('website')(e.target.value)} placeholder="https://company.com"/></Field></div>
   <div className="ws-two">
    <SelectField label="Industry" value={form.industry} onChange={set('industry')} options={optionize(industries)} disabled={disabled}/>
    <SelectField label="Country" value={form.country} onChange={set('country')} options={countries.map(([value,label])=>({value,label}))} disabled={disabled}/>
   </div>
   <div className="ws-two">
    <SelectField label="Currency" value={form.defaultCurrency} onChange={set('defaultCurrency')} options={optionize(currencies)} disabled={disabled}/>
    <SelectField label="Time zone" value={form.timezone} onChange={set('timezone')} options={optionize(zones)} disabled={disabled}/>
   </div>
  </div>;
 }
 const admin=selected&&['ADMIN','OWNER'].includes(selected.role);
 return <main className="ws-page"><div className="ws-container">
  <header className="ws-top"><Link href="/entry" className="ws-back"><ChevronLeft size={16}/> Workspace entry</Link><span className="ws-kicker"><ShieldCheck size={14}/> PRIVATE COMPANY WORKSPACES</span></header>
  <ErrorMessage message={error}/>{notice&&<div role="status" className="ws-notice"><Check size={16}/>{notice}</div>}
  {!loaded?<div className="ws-card ws-centered"><h2>Loading company workspace…</h2></div>:!items.length&&!selected?
  <section className="ws-card ws-centered">
   <div className="ws-emblem"><Building2 size={24}/></div>
   <span className="ws-step-label">STEP 01 / 02 — COMPANY SETUP</span><h1>Create your company workspace</h1>
   <p className="ws-intro">Set up the workspace for your team. Your work email must use a company domain, and the company website must match that domain.</p>
   <form onSubmit={create} className="ws-form">
    {fieldGroup(createForm,'create')}
    <p className="ws-field-note">You will be assigned the <strong>Administrator</strong> role. Each account may create only one company workspace.</p>
    <Button className="full-width ws-main-cta" type="submit" loading={busy}>Create workspace <ChevronRight size={17}/></Button>
   </form>
  </section>:stage==='invite'&&selected?
  <section className="ws-card ws-centered">
   <div className="ws-emblem"><UsersRound size={24}/></div>
   <span className="ws-step-label">STEP 02 / 02 — INVITE YOUR TEAM</span><h1>Bring your team to {selected.name}</h1>
   <p className="ws-intro">You're the workspace Administrator. Add teammates now or invite them later from Settings.</p>
   <Field label="Team email addresses"><EmailChips emails={emails} setEmails={setEmails} disabled={busy}/></Field>
   <SelectField label="Invited teammates' role" value={inviteRole} onChange={setInviteRole} options={[{value:'MEMBER',label:'Member'},{value:'ADMIN',label:'Administrator'},{value:'FINANCE',label:'Finance'}]}/>
   <div className="ws-actions"><Button className="full-width ws-main-cta" type="button" onClick={()=>void sendInvitations()} disabled={!emails.length} loading={busy}><Mail size={17}/> Send team invitations</Button>
    <Button variant="secondary" className="full-width" type="button" onClick={()=>void open(selected)}>Continue to workspace settings <ChevronRight size={16}/></Button></div>
   <p className="ws-field-note">Emails are sent through the connected provider. In a private Codespace, test emails go to the private inbox on port 8025. Unsent invitations have a secure manual link below.</p>
   {results.map((r,i)=><div className="ws-delivery" key={r.recipientEmail+'-'+i}><strong>{r.recipientEmail}</strong><small>{r.delivery==='SENT'?'Sent by email':r.delivery==='SENT_PREVIEW'?'Delivered to private test inbox':'Not emailed'}</small>{r.inviteUrl&&<div className="ws-copy-row"><input value={r.inviteUrl} readOnly aria-label={'Invite link '+r.recipientEmail}/><Button variant="secondary" type="button" onClick={()=>void navigator.clipboard.writeText(r.inviteUrl!)}>Copy link</Button></div>}</div>)}
  </section>:selected?
  <section className="ws-card ws-manager">
   <div className="ws-heading"><div><span className="ws-step-label">COMPANY SETTINGS</span><h1>{selected.name}</h1><p className="ws-intro">Manage your business identity, members and workspace configuration.</p></div><span className="ws-role-badge"><ShieldCheck size={15}/> {selected.role==='OWNER'?'Administrator (Owner)':selected.role==='ADMIN'?'Administrator':selected.role}</span></div>
   <div className="ws-section-heading"><Building2 size={18}/><h2>Business profile</h2></div>
   <form onSubmit={save} className="ws-form">{fieldGroup(profile,'profile',!admin)}
    <div className="ws-two"><Field label="Registered legal name"><input disabled={!admin} value={profile.legalName} onChange={e=>change('legalName',e.target.value,'profile')}/></Field>
      <Field label="Company logo URL (HTTPS)"><input type="url" disabled={!admin} value={profile.logoUrl} onChange={e=>change('logoUrl',e.target.value,'profile')}/></Field></div>
    <div className="ws-two"><Field label="Services (comma separated)"><input disabled={!admin} value={profile.services} onChange={e=>change('services',e.target.value,'profile')} placeholder="Data annotation, AI services"/></Field>
      <Field label="Target industries (comma separated)"><input disabled={!admin} value={profile.targetIndustries} onChange={e=>change('targetIndustries',e.target.value,'profile')}/></Field></div>
    <Field label="Company description"><textarea rows={3} disabled={!admin} value={profile.description} onChange={e=>change('description',e.target.value,'profile')}/></Field>
    <Field label="Ideal customers"><textarea rows={2} disabled={!admin} value={profile.idealCustomers} onChange={e=>change('idealCustomers',e.target.value,'profile')}/></Field>
    <Field label="Invoice issuing address"><textarea rows={2} disabled={!admin} value={profile.billingAddress} onChange={e=>change('billingAddress',e.target.value,'profile')}/></Field>
    <div className="ws-two"><Field label="Tax registration ID"><input disabled={!admin} value={profile.taxRegistrationNumber} onChange={e=>change('taxRegistrationNumber',e.target.value,'profile')}/></Field>{admin&&<Field label="Upload logo (PNG or JPEG)"><input type="file" accept="image/png,image/jpeg" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadLogo(file)}}/></Field>}</div>
    {admin&&<div className="ws-form-actions"><Button type="submit" loading={busy}>Save company settings <Check size={16}/></Button></div>}
   </form>
   {admin&&<div className="ws-team"><div className="ws-section-heading"><UsersRound size={18}/><h2>Team access</h2></div>
    <div className="ws-members">{members.map(m=><div className="ws-member-row" key={m.userId}><span><strong>{m.user.name}</strong><small>{m.user.email}</small></span><span className="ws-role-badge">{m.role==='OWNER'?'Administrator (Owner)':m.role==='ADMIN'?'Administrator':m.role}</span>
     <span className="ws-status">{m.status}</span>
    </div>)}</div>
    <button type="button" className="ws-disclosure" aria-expanded={teamExpanded} onClick={()=>setTeamExpanded(x=>!x)}><Plus size={17}/> {teamExpanded?'Close invitations':'Invite more teammates'}</button>
    {teamExpanded&&<div className="ws-invite-inline"><Field label="Invite emails"><EmailChips emails={emails} setEmails={setEmails} disabled={busy}/></Field><SelectField label="Workspace role" value={inviteRole} onChange={setInviteRole} options={[{value:'MEMBER',label:'Member'},{value:'ADMIN',label:'Administrator'},{value:'FINANCE',label:'Finance'}]}/><Button disabled={emails.length===0} loading={busy} type="button" onClick={()=>void sendInvitations()}><Mail size={16}/> Send invitations</Button>
    {results.map((r,i)=><div key={r.recipientEmail+i} className="ws-delivery"><strong>{r.recipientEmail}</strong><small>{r.delivery==='SENT'?'Email sent':r.delivery==='SENT_PREVIEW'?'Private test inbox':'Not sent — share link privately'}</small>{r.inviteUrl&&<div className="ws-copy-row"><input readOnly value={r.inviteUrl} aria-label={'Invite link '+r.recipientEmail}/><Button variant="secondary" type="button" onClick={()=>void navigator.clipboard.writeText(r.inviteUrl!)}>Copy link</Button></div>}</div>)}</div>}
    {invitations.length>0&&<div className="ws-invite-history"><h3>Invitation history</h3>{invitations.map(inv=><div key={inv.id} className="ws-member-row"><span>{inv.email} <small>· {inv.role}</small></span><span className="ws-status">{inv.status}</span>{inv.status==='PENDING'&&<Button variant="secondary" type="button" onClick={async()=>{try{await post('/workspace-invitations/organizations/'+selected.id+'/'+inv.id+'/revoke',{});setInvitations(items=>items.map(i=>i.id===inv.id?{...i,status:'REVOKED'}:i));}catch(e){setError(e instanceof Error?e.message:'Could not revoke invitation.');}}}>Revoke</Button>}</div>)}</div>}
   </div>}
   <div className="ws-settings-footer"><ShieldCheck size={16}/> An account may belong to multiple invited teams, but cannot create a second company workspace.</div>
   {selected.tenantCrmEnabled&&<Button type="button" className="ws-main-cta" onClick={()=>void choose(selected)}>Open company CRM <ChevronRight size={16}/></Button>}
  </section>:<section className="ws-card ws-centered"><h1>Company workspaces</h1><p className="ws-intro">Select a workspace to continue. Creating another company is not available.</p><div className="ws-workspace-list">{items.map(w=><div key={w.id} className="ws-choice"><div><strong>{w.name}</strong><small>{w.role==='OWNER'?'Administrator (Owner)':w.role==='ADMIN'?'Administrator':w.role}</small></div><Button variant="secondary" onClick={()=>void open(w)}>Manage</Button><Button onClick={()=>void choose(w)}>Open</Button></div>)}</div></section>}
 </div></main>;
}
