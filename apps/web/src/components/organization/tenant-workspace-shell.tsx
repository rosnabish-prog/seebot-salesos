'use client';
import {ReactNode,useEffect,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {useParams,usePathname,useRouter} from 'next/navigation';
import {LayoutDashboard,ChartNoAxesCombined,KanbanSquare,Building2,BriefcaseBusiness,FileSignature,Settings2,LogOut,Menu,X,LoaderCircle,UsersRound,ListTodo,Megaphone} from 'lucide-react';
import {request} from '@/lib/api';
import {useAuth} from '@/context/auth';

type Selected={selected:string|null;legacyAllowed:boolean};
type Profile={organization:{name:string;slug:string};role:string;tenantCrmEnabled:boolean};
export function TenantWorkspaceShell({children}:{children:ReactNode}){
 const params=useParams(),orgId=String(params.id||''),path=usePathname(),router=useRouter();
 const {user,loading,logout}=useAuth(),[ready,setReady]=useState(false),[profile,setProfile]=useState<Profile|null>(null),[mobile,setMobile]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(loading)return;
  if(!user){router.replace('/login');return;}
  let active=true;setReady(false);setError('');
  void Promise.all([request<Selected>('/workspaces/selected'),request<Profile>('/workspaces/'+orgId+'/profile')]).then(([selection,company])=>{
   if(!active)return;
   if(selection.selected!==orgId){router.replace('/entry');return;}
   setProfile(company);setReady(true);
  }).catch(e=>{if(active){setError(e instanceof Error?e.message:'Workspace authorization failed.');setReady(false);}});
  return()=>{active=false;};
 },[loading,user?.id,orgId,router]);
 if(loading||!user||!ready)return <div className="app-loading" role="status"><LoaderCircle className="spin" size={27}/><span>{error||'Opening your company workspace…'}</span>{error&&<Link href="/workspaces" className="btn btn-secondary">Choose workspace</Link>}</div>;
 const root='/workspaces/'+orgId;
 const canLead=['ADMIN','OWNER'].includes(profile?.role||'');
 const nav=[
  {href:root,name:'My Dashboard',icon:LayoutDashboard,exact:true},
  ...(canLead?[{href:root+'/executive',name:'Executive Overview',icon:ChartNoAxesCombined}]:[]),
  {href:root+'/pipeline',name:'Kanban Pipeline',icon:KanbanSquare},
  {href:root+'/accounts',name:'Prospects & Accounts',icon:Building2},
  {href:root+'/clients',name:'Client Management',icon:BriefcaseBusiness},
  {href:root+'/tasks',name:'Tasks & Follow-ups',icon:ListTodo},
  {href:root+'/campaigns',name:'Campaigns',icon:Megaphone},
  {href:root+'/business',name:'Contracts & Finance',icon:FileSignature},
  {href:'/workspaces?manage='+encodeURIComponent(orgId),name:'Team & Settings',icon:Settings2}
 ];
 const activeName=nav.find(n=>n.exact?path===n.href:path===n.href||path.startsWith(n.href+'/'))?.name||'Company workspace';
 return <div className="app-shell tenant-app-shell">
  <aside className={'sidebar '+(mobile?'sidebar-open':'')}>
   <div className="sidebar-head"><Link href={root} className="wordmark" onClick={()=>setMobile(false)}><span className="sidebar-wordmark"><Image src="/seebot-logo.png" width={1174} height={328} priority alt="Seebot"/><small>SalesOS</small></span></Link><button className="icon-button mobile-close" aria-label="Close menu" onClick={()=>setMobile(false)}><X size={18}/></button></div>
   <div className="sidebar-subhead">COMPANY WORKSPACE</div>
   <div className="tenant-shell-company"><Building2 size={17}/><div><strong>{profile?.organization.name||'Company'}</strong><small>{profile?.role==='ADMIN'||profile?.role==='OWNER'?'Administrator':profile?.role||'Member'} · {profile?.tenantCrmEnabled?'Development preview':'Setup mode'}</small></div></div>
   <nav className="nav-list" aria-label="Company navigation">{nav.map(n=><Link key={n.href} href={n.href} className={'nav-link '+((n.exact?path===n.href:path===n.href||path.startsWith(n.href+'/'))?'active':'')} onClick={()=>setMobile(false)}><n.icon size={19} strokeWidth={1.85}/>{n.name}</Link>)}</nav>
   <div className="sidebar-bottom"><div className="sidebar-note"><Link href="/workspaces" className="tenant-switch-link"><UsersRound size={15}/> Switch workspace</Link><small>Workspace records are private to your company</small></div>
    <div className="profile-bar"><div className="profile"><span className="avatar">{user.name[0]?.toUpperCase()}</span><span className="profile-label"><strong>{user.name}</strong><small>{user.email}</small></span></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={async()=>{await logout();router.replace('/login');}}><LogOut size={18}/></button></div>
   </div>
  </aside>
  {mobile&&<div className="sidebar-curtain" onClick={()=>setMobile(false)}/>}
  <main className="main-shell"><header className="topbar"><button className="icon-button nav-mobile-trigger" aria-label="Open menu" onClick={()=>setMobile(true)}><Menu size={19}/></button><div className="topbar-crumb"><Link href={root} className="crumb-link">{profile?.organization.name}</Link><span className="slash">/</span><span className="crumb-link current">{activeName}</span></div><div className="topbar-right"><span className="topbar-role">{profile?.role==='ADMIN'?'Administrator':profile?.role}</span><span className="topbar-avatar">{user.name[0]?.toUpperCase()}</span></div></header>
   <div className="content route-enter tenant-page-content" key={path}>{children}</div>
  </main>
 </div>;
}
