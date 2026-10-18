'use client';
import { ReactNode,useEffect,useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {usePathname,useRouter} from 'next/navigation';
import { LayoutDashboard,KanbanSquare,Building2,ListTodo,Megaphone,Settings2,LogOut,Plus,Menu,X,Bell,ChevronDown,ChartNoAxesCombined,ContactRound,BriefcaseBusiness, FileSignature, LoaderCircle } from 'lucide-react';
import { useAuth,executive,mayEdit } from '../context/auth';
import {Button} from './ui';
export function Shell({children}:{children:ReactNode}){
  const {user,loading,logout}=useAuth(),router=useRouter(),path=usePathname(),[mobile,setMobile]=useState(false);
  useEffect(()=>{if(!loading&&!user)router.replace('/login');},[loading,user,router]);
  if(loading||!user)return <div className="app-loading" role="status" aria-live="polite"><LoaderCircle size={29} className="spin"/><span className="sr-only">Loading your workspace</span></div>;
  const nav=[{href:'/workspaces',name:'Company Workspaces',icon:Building2},{href:'/dashboard',name:'My Dashboard',icon:LayoutDashboard},{href:'/executive',name:'Executive Overview',icon:ChartNoAxesCombined,hide:!executive(user.role)},{href:'/pipeline',name:'Kanban Pipeline',icon:KanbanSquare},{href:'/prospects',name:'Prospects & Accounts',icon:Building2},{href:'/clients',name:'Client Management',icon:BriefcaseBusiness},{href:'/tasks',name:'Tasks & Follow-ups',icon:ListTodo},{href:'/campaigns',name:'Campaigns',icon:Megaphone},{href:'/settings',name:'Team & Settings',icon:Settings2,hide:user.role!=='SUPER_ADMIN'},{href:'/profile',name:'My Profile',icon:ContactRound,hide:true}];
  return <div className="app-shell"><aside className={`sidebar ${mobile?'sidebar-open':''}`}>
    <div className="sidebar-head"><Link href="/dashboard" className="wordmark" onClick={()=>setMobile(false)}><span className="sidebar-wordmark"><Image src="/seebot-logo.png" width={1174} height={328} alt="Seebot" priority/><small>SalesOS</small></span></Link><button className="icon-button mobile-close" onClick={()=>setMobile(false)}><X/></button></div>
    <div className="sidebar-subhead">WORKSPACE</div><nav className="nav-list" aria-label="Main navigation">{nav.filter(n=>!n.hide).map(n=><Link key={n.href} href={n.href} className={`nav-link ${path===n.href||path.startsWith(n.href+'/')?'active':''}`} onClick={()=>setMobile(false)}><n.icon size={19} strokeWidth={1.85}/>{n.name}</Link>)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-note"><span className="dot-live"/>Internal Sales Workspace<br/><small>Private · Seebot.ai</small></div><div className="profile-bar"><Link className="profile profile-link" href="/profile" onClick={()=>setMobile(false)} title="Manage your profile and password"><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><span className="profile-label"><strong>{user.name}</strong><small>{user.role.replaceAll('_',' ')}</small></span></Link><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={async()=>{await logout();router.replace('/login')}}><LogOut size={18}/></button></div></div>
  </aside>{mobile&&<div className="sidebar-curtain" onClick={()=>setMobile(false)}/>}
  <main className="main-shell"><header className="topbar"><button className="icon-button nav-mobile-trigger" onClick={()=>setMobile(true)} aria-label="Open menu"><Menu/></button><div className="topbar-crumb"><Link href="/dashboard" className="crumb-link">Workspace</Link><span className="slash">/</span><Link href={nav.find(n=>path.startsWith(n.href))?.href||'/pipeline'} className="crumb-link current">{nav.find(n=>path.startsWith(n.href))?.name||'Opportunity'}</Link></div><div className="topbar-right"><span className="topbar-role">{user.role.replaceAll('_',' ')}</span><span className="topbar-avatar">{user.name.slice(0,1).toUpperCase()}</span></div></header><div className="content route-enter" key={path}>{children}</div></main></div>;
}
