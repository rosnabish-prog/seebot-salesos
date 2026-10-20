import {PipelineSettingsPanel} from '@/components/organization/pipeline-settings-panel';
'use client';
import { ReportTemplatesPanel } from '@/components/client/report-templates-panel';
import { IntegrationStatusPanel } from '@/components/organization/integration-status-panel';

import { CompanyProfilePanel } from '@/components/organization/company-profile-panel';
import { InvitationsPanel } from '@/components/organization/invitations-panel';
 
import {useEffect,useState,FormEvent} from 'react';
import {Plus,UsersRound,ShieldCheck,UserRoundCog,Layers3,Archive,CheckCircle2} from 'lucide-react';
import {useAuth} from '@/context/auth';import {request,post,patch} from '@/lib/api';
import {useIndustries} from '@/lib/use-industries';
import {Badge,PageTop,Panel,Button,Field,ErrorMessage,BrandSelect} from '@/components/ui';
type User={id:string;name:string;email:string;role:string};
const policies=[
 {role:'SUPER_ADMIN',overview:'All records',prospects:'All',tasks:'All',settings:'Manage'},
 {role:'CEO',overview:'Company-wide',prospects:'Read all',tasks:'Read all',settings:'No'},
 {role:'DIRECTOR',overview:'Company-wide*',prospects:'Read all*',tasks:'Read all*',settings:'No'},
 {role:'SALES_MANAGER',overview:'Company-wide',prospects:'Edit all',tasks:'Manage team',settings:'No'},
 {role:'SALES_REP',overview:'Assigned',prospects:'Edit assigned',tasks:'Own',settings:'No'},
 {role:'TECHNICAL_REVIEWER',overview:'Assigned',prospects:'Read assigned',tasks:'Read assigned',settings:'No'}
];
export default function Settings(){const{user}=useAuth();const[items,setItems]=useState<User[]>([]),[show,setShow]=useState(false),[form,setForm]=useState({name:'',email:'',password:'',role:'SALES_REP'}),[error,setError]=useState(''),[saving,setSaving]=useState(false);const {industries,reload}=useIndustries();const [newIndustry,setNewIndustry]=useState('');const[currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState('');
 useEffect(()=>{if(user?.role==='SUPER_ADMIN')request<User[]>('/users').then(setItems).catch(e=>setError(e.message))},[user]);
 async function updatePassword(e:FormEvent){e.preventDefault();setSaving(true);setError('');try{await patch('/auth/password',{currentPassword,newPassword});setCurrentPassword('');setNewPassword('');window.location.assign('/login');}catch(e:any){setError(e.message)}finally{setSaving(false)}}
 async function addIndustry(e:FormEvent){e.preventDefault();setSaving(true);setError('');try{await post('/industries',{name:newIndustry});await reload();setNewIndustry('')}catch(e:any){setError(e.message)}finally{setSaving(false)}}
 async function toggleIndustry(id:string,active:boolean){setError('');try{await patch(`/industries/${id}`,{active:!active});await reload();}catch(e:any){setError(e.message)}}
 if(user?.role!=='SUPER_ADMIN')return <ErrorMessage message="Only a Super Administrator may manage the workspace."/>;
 return <><PageTop kicker="WORKSPACE ADMINISTRATION" title="Team & Settings" description="Manage your team, industry taxonomy, and role access policies." action={<a className="btn btn-primary" href="#team-invitations"><Plus size={16}/>Invite employee</a>}/><ErrorMessage message={error}/>
 <CompanyProfilePanel/><PipelineSettingsPanel/><ReportTemplatesPanel/><div id="team-invitations"><InvitationsPanel/></div><IntegrationStatusPanel/>
<Panel title="Plan & Feature Access"><p className="muted small-text">Premium features and subscription billing are planned for a later release. All currently available features are unlocked for Seebot during preview. External organization signup is disabled until independent-workspace security is complete.</p></Panel>
 <Panel title="Team Members" actions={<Badge>{items.length} users</Badge>}><div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{items.map(u=><tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td>{u.role.replaceAll('_',' ')}</td><td><Badge tone="green">Active</Badge></td></tr>)}</tbody></table></div></Panel>
 <Panel title="Industry Management" actions={<Layers3 size={19} color="#C2410C"/>}><p className="muted small-text">New industries become available in prospect and campaign forms. Archived industries remain in historical reports.</p><div className="industry-list">{industries.map(ind=><div className="industry-row" key={ind.id}><span><Layers3 size={17}/>{ind.name}</span><div className="industry-actions"><Badge tone={ind.active?'green':'neutral'}>{ind.active?'Active':'Archived'}</Badge>{!ind.id.startsWith('default-')&&!ind.id.startsWith('fallback-')&&<Button variant="secondary" onClick={()=>toggleIndustry(ind.id,ind.active)}>{ind.active?<Archive size={14}/>:<CheckCircle2 size={14}/>} {ind.active?'Archive':'Restore'}</Button>}</div></div>)}</div><form className="industry-create" onSubmit={addIndustry}><input placeholder="New industry name" aria-label="New industry name" required minLength={2} maxLength={80} value={newIndustry} onChange={e=>setNewIndustry(e.currentTarget.value)}/><Button type="submit" loading={saving}><Plus size={16}/>Add Industry</Button></form></Panel>
 <Panel title="Roles & Permissions" actions={<ShieldCheck size={19} color="#C2410C"/>}><p className="muted small-text">System-defined roles. Backend permissions govern actual access; this screen is a reference, not a role editor.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>Role</th><th>Dashboard</th><th>Prospects / Deals</th><th>Tasks</th><th>Admin settings</th></tr></thead><tbody>{policies.map(row=><tr key={row.role}><td><strong>{row.role.replaceAll('_',' ')}</strong></td><td>{row.overview}</td><td>{row.prospects}</td><td>{row.tasks}</td><td>{row.settings}</td></tr>)}</tbody></table></div><p className="muted small-text">* Director department-level scoping is not yet implemented: current development build offers broader read access. Restrict director accounts until implemented and reviewed.</p></Panel>
 <Panel title="Change Administrator Password"><p className="muted small-text">Use this to rotate a password that was shared or exposed. Changing your password signs out existing sessions.</p><form className="industry-create" onSubmit={updatePassword}><input type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" value={currentPassword} onChange={e=>setCurrentPassword(e.currentTarget.value)} required/><input type="password" autoComplete="new-password" placeholder="New password (12+ characters)" aria-label="New password" value={newPassword} onChange={e=>setNewPassword(e.currentTarget.value)} required minLength={12}/><Button type="submit" loading={saving}>Update Password</Button></form></Panel>
 <Panel title="Security baseline"><div className="soft-callout"><ShieldCheck size={20}/>Passwords use Argon2id. Authentication uses HttpOnly cookies and backend authorization checks.</div><p className="muted small-text top-gap">Employee accounts are directly provisioned in this development release. Mandatory MFA enrollment and verified staff invitations are implemented but require staging validation and secure provider configuration. Self-service password recovery and granular workspace roles remain pending.</p></Panel>
 </>;
}