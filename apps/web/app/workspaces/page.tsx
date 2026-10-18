'use client';
import {useEffect,useState,FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {request,post,patch} from '@/lib/api';
import {Button,Field,ErrorMessage} from '@/components/ui';
type Workspace={id:string;name:string;slug:string;role:string;status:string;crmEnabled:boolean;tenantCrmEnabled?:boolean;logoUrl?:string};
type Profile={organization:Record<string,any>;settings?:{plan:string;setupComplete:boolean;targetIndustries:string[]};role:string;crmEnabled:boolean};
const basic={name:'',website:'',industry:'',description:'',services:'',idealCustomers:'',targetIndustries:'',country:'GB',timezone:'Europe/London',defaultCurrency:'GBP',logoUrl:'',legalName:'',billingAddress:''};
export default function WorkspacesPage(){
 const router=useRouter(),[items,setItems]=useState<Workspace[]>([]),[selected,setSelected]=useState<Workspace|null>(null),[profile,setProfile]=useState(basic),[members,setMembers]=useState<any[]>([]),[newMemberEmail,setNewMemberEmail]=useState(''),[newMemberName,setNewMemberName]=useState(''),[newMemberRole,setNewMemberRole]=useState('MEMBER'),[invitations,setInvitations]=useState<any[]>([]),[inviteUrl,setInviteUrl]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[createName,setCreateName]=useState(''),[createWebsite,setCreateWebsite]=useState('');
 async function list(){setItems(await request<Workspace[]>('/workspaces'));}
 useEffect(()=>{void list().catch(e=>{if(e.status===401)router.replace('/login');else setError(e.message);})},[]);
 useEffect(()=>{
  if(!items.length||selected)return;
  const requested=new URLSearchParams(window.location.search).get('manage');
  const found=items.find(w=>w.id===requested);
  if(found)void open(found);
 },[items,selected]);
 async function open(w:Workspace){setError('');try{await post(`/workspaces/${w.id}/select`,{});setSelected(w);const p=await request<Profile>(`/workspaces/${w.id}/profile`);setProfile({...basic,...p.organization,services:Array.isArray(p.organization.services)?p.organization.services.join(', '):'',targetIndustries:(p.settings?.targetIndustries||[]).join(', ')});if(['OWNER','ADMIN'].includes(w.role)){const [m,inv]=await Promise.all([request<any[]>(`/workspaces/${w.id}/members`),request<any[]>(`/workspace-invitations/organizations/${w.id}`)]);setMembers(m);setInvitations(inv);}else{setMembers([]);setInvitations([]);}}catch(e:any){setError(e.message)}}
 async function run(fn:()=>Promise<any>){setBusy(true);setError('');setNotice('');try{const result=await fn();setNotice(result?.notice||'Saved');await list();if(selected)await open(selected);}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function uploadLogo(file:File){if(!selected)return;setBusy(true);setError('');try{const body=new FormData();body.append('file',file);const base=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000';const res=await fetch(`${base}/api/workspaces/${selected.id}/logo`,{method:'POST',credentials:'include',body});if(!res.ok)throw Error('Logo upload failed.');setNotice('Organization logo uploaded securely.');}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');setNotice('');
  try{
   const result=await post<Workspace>('/workspaces',{name:createName,website:createWebsite});
   await post(`/workspaces/${result.id}/select`,{});
   setCreateName('');setCreateWebsite('');await list();
   await open({...result,role:'OWNER'});
   setNotice('Company workspace created. Complete the company profile and invite team members below.');
   router.replace(`/workspaces?manage=${encodeURIComponent(result.id)}`);
  }catch(e:any){setError(e.message||'Could not create workspace.');}finally{setBusy(false);}
 }
 async function choose(w:Workspace){
  setBusy(true);setError('');
  try{
   const result=await post<{crmEnabled:boolean;tenantCrmEnabled:boolean}>(`/workspaces/${w.id}/select`,{});
   if(result.crmEnabled)router.push('/dashboard');
   else if(result.tenantCrmEnabled)router.push(`/workspaces/${w.id}/accounts`);
   else{await open(w);router.replace(`/workspaces?manage=${encodeURIComponent(w.id)}`);setNotice('Workspace selected. Complete the company setup; CRM access is disabled for this deployment.');}
  }catch(e:any){setError(e.message||'Unable to select workspace.');}finally{setBusy(false);}
 }
 return <main style={{minHeight:'100vh',background:'#FAFAFB',padding:'32px 16px'}}><section style={{maxWidth:960,margin:'auto',background:'#fff',padding:24,borderRadius:18,border:'1px solid #e5e7eb'}}>
 <header><Link href="/entry">← Workspace entry</Link><h1>Company Workspaces</h1><p>Each company has its own profile and members. All current features are unlocked; subscription billing comes later. Team membership is checked whenever you select a workspace. New companies can complete their profiles and invite teammates. Live access requires separate deployment approval. The legacy Seebot CRM remains restricted to Seebot members.</p></header>
 <ErrorMessage message={error}/>{notice&&<div role="status" className="soft-callout">{notice}</div>}
 {!items.length&&<p className="muted">You do not belong to a workspace yet. Create your company workspace below, or accept a private invitation link from your team administrator.</p>}
 {items.map(w=><div key={w.id} className="record-row"><div style={{flex:1}}><strong>{w.name}</strong><p>{w.role} · {w.crmEnabled?'Legacy CRM available':w.tenantCrmEnabled?'Tenant business workspace':'Company setup only'} · {w.status}</p></div><Button variant="secondary" onClick={()=>void open(w)}>Manage</Button><Button loading={busy} onClick={()=>void choose(w)}>{w.crmEnabled?'Open CRM':w.tenantCrmEnabled?'Open workspace':'Select'}</Button></div>)}
 {selected&&<section className="panel" style={{padding:22,marginTop:20}}><h2>{selected.name} · Organization Profile</h2><p>Plan: All features unlocked · Billing: Coming later · CRM access: {selected.crmEnabled?'Seebot CRM and prospects':'Tenant-isolated business and finance workspace'}</p>
 <form className="stack-16" onSubmit={e=>{e.preventDefault();void run(()=>patch(`/workspaces/${selected.id}/profile`,{...profile,services:profile.services.split(',').map(x=>x.trim()).filter(Boolean),targetIndustries:profile.targetIndustries.split(',').map(x=>x.trim()).filter(Boolean)}))}}>
 {([['name','Company name'],['legalName','Legal entity'],['website','Website'],['logoUrl','Logo URL (HTTPS)'],['industry','Industry'],['services','Services (comma separated)'],['targetIndustries','Target industries'],['idealCustomers','Ideal customers'],['description','Company description'],['country','Country code'],['timezone','Time zone'],['defaultCurrency','Default currency'],['billingAddress','Invoice issuing address']] as const).map(([key,label])=><Field key={key} label={label}><input value={String(profile[key]||'')} disabled={!['OWNER','ADMIN'].includes(selected.role)} onChange={e=>setProfile(p=>({...p,[key]:e.target.value}))}/></Field>)}
 {['OWNER','ADMIN'].includes(selected.role)&&<Button loading={busy}>Save Company Setup</Button>}</form>
 {['OWNER','ADMIN'].includes(selected.role)&&<Field label="Upload company logo (PNG/JPEG, max 2 MB)"><input type="file" accept="image/png,image/jpeg" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadLogo(file)}}/></Field>}
 {['OWNER','ADMIN'].includes(selected.role)&&<div style={{marginTop:24}}><h3>Team members</h3>{members.map(m=><div className="record-row" key={m.userId}><div style={{flex:1}}><strong>{m.user.name}</strong><p>{m.user.email} · {m.role} · {m.status}</p></div>{m.role!=='OWNER'&&<Button variant="secondary" onClick={()=>void run(()=>patch(`/workspaces/${selected.id}/members/${m.userId}`,{role:m.role,status:m.status==='ACTIVE'?'DISABLED':'ACTIVE'}))}>{m.status==='ACTIVE'?'Deactivate':'Restore'}</Button>}</div>)}
 <h4>Invite a teammate</h4>
 <p className="muted small-text">Access is granted only after the invited person accepts their one-time link using the exact invited email. Gmail sends only when connected and enabled; otherwise you receive a link to share securely.</p>
 <div className="field-grid"><Field label="Team member name"><input value={newMemberName} onChange={e=>setNewMemberName(e.target.value)} /></Field><Field label="Invite email address"><input type="email" value={newMemberEmail} onChange={e=>setNewMemberEmail(e.target.value)}/></Field><Field label="Workspace role"><select value={newMemberRole} onChange={e=>setNewMemberRole(e.target.value)}><option>MEMBER</option><option>FINANCE</option><option>ADMIN</option></select></Field></div>
 <Button disabled={busy||newMemberName.trim().length<2||!newMemberEmail.trim()} onClick={()=>void run(async()=>{
  const result=await post<{notice:string;inviteUrl?:string}>(`/workspace-invitations/organizations/${selected.id}`,{email:newMemberEmail,name:newMemberName,role:newMemberRole});
  setInviteUrl(result.inviteUrl||'');setNewMemberEmail('');setNewMemberName('');return result;
 })}>Create team invitation</Button>
 {inviteUrl&&<div className="soft-callout"><p><strong>Invitation has not been emailed.</strong> Copy this private one-time URL and share it with the invited teammate. It expires in seven days.</p><input readOnly value={inviteUrl} aria-label="One-time invitation URL" onFocus={e=>e.currentTarget.select()}/><Button variant="secondary" type="button" onClick={()=>void navigator.clipboard.writeText(inviteUrl)}>Copy invitation link</Button></div>}
 {invitations.length>0&&<div><h4>Recent team invitations</h4>{invitations.map(inv=><div className="record-row" key={inv.id}><p className="muted small-text" style={{flex:1}}>{inv.email} · {inv.role} · {inv.status} · expires {new Date(inv.expiresAt).toLocaleDateString()}</p>{inv.status==='PENDING'&&<Button variant="secondary" disabled={busy} onClick={()=>void run(()=>post(`/workspace-invitations/organizations/${selected.id}/${inv.id}/revoke`,{}))}>Revoke invite</Button>}</div>)}</div>}</div>}
 </section>}
 <details open={items.length===0} style={{marginTop:24}}><summary>{items.length?"Create another company workspace":"Create your team workspace"}</summary><form className="stack-16" onSubmit={create}><Field label="Company name"><input required value={createName} onChange={e=>setCreateName(e.target.value)}/></Field><Field label="Website"><input type="url" placeholder="https://example.com" value={createWebsite} onChange={e=>setCreateWebsite(e.target.value)}/></Field><Button loading={busy}>Create workspace profile</Button></form></details></section></main>;
}
