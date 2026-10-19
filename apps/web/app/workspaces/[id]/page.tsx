'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams,useRouter} from 'next/navigation';
import {Building2,UsersRound,Target,FileText,ArrowRight,Settings2,LogOut} from 'lucide-react';
import {request} from '@/lib/api';
import {useAuth} from '@/context/auth';
import {Button,ErrorMessage} from '@/components/ui';

type Summary={accounts:number;clients:number;opportunities:number;contracts:number;invoices:number};
type Profile={organization:{id:string;name:string;industry?:string;description?:string;website?:string};role:string;tenantCrmEnabled:boolean};
export default function CompanyHome(){
 const params=useParams(),id=String(params.id||''),router=useRouter(),{user,loading,logout}=useAuth();
 const [profile,setProfile]=useState<Profile|null>(null),[summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  if(loading)return;if(!user){router.replace('/login');return;}
  let active=true;
  void request<Profile>('/workspaces/'+id+'/profile').then(p=>{
   if(!active)return;setProfile(p);
   if(p.tenantCrmEnabled)return request<Summary>('/workspace-business/'+id+'/dashboard').then(v=>{if(active)setSummary(v);});
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load company workspace.');});
  return()=>{active=false;};
 },[id,loading,user,router]);
 return <main className="ws-page"><div className="ws-container">
  <header className="ws-top"><Link href="/workspaces" className="ws-back"><Building2 size={17}/> Workspaces</Link><Button variant="secondary" type="button" onClick={async()=>{await logout();router.replace('/login');}}><LogOut size={15}/> Sign out</Button></header>
  <ErrorMessage message={error}/>
  <section className="ws-card ws-overview">
   <span className="ws-step-label">COMPANY WORKSPACE</span>
   <h1>{profile?.organization.name||'Opening company workspace'}</h1>
   <p className="ws-intro">Your company's main page. Add prospects, opportunities, contracts and invoices whenever your team is ready. None of these are required to finish setup.</p>
   <div className="ws-summary-grid">
    <div><small>Prospects</small><strong>{summary?.accounts??'—'}</strong></div>
    <div><small>Opportunities</small><strong>{summary?.opportunities??'—'}</strong></div>
    <div><small>Contracts</small><strong>{summary?.contracts??'—'}</strong></div>
    <div><small>Invoices</small><strong>{summary?.invoices??'—'}</strong></div>
   </div>
   <div className="ws-home-actions">
    <Link className="ws-home-tile" href={'/workspaces/'+id+'/accounts'}><Target size={22}/><span><strong>Prospects & accounts</strong><small>Optional — add your first prospective customer later</small></span><ArrowRight size={18}/></Link>
    <Link className="ws-home-tile" href={'/workspaces/'+id+'/business'}><FileText size={22}/><span><strong>Business & finance</strong><small>Opportunities, contracts, invoices and reporting</small></span><ArrowRight size={18}/></Link>
    <Link className="ws-home-tile" href={'/workspaces?manage='+encodeURIComponent(id)}><Settings2 size={22}/><span><strong>Company settings</strong><small>Manage optional business details and preferences</small></span><ArrowRight size={18}/></Link>
    <Link className="ws-home-tile" href={'/workspaces?manage='+encodeURIComponent(id)}><UsersRound size={22}/><span><strong>Team & invitations</strong><small>Invite or manage workspace members</small></span><ArrowRight size={18}/></Link>
   </div>
   {!profile?.tenantCrmEnabled&&<p className="auth-preview-note">Commercial features are disabled on this deployment. You can still manage company settings and invitations.</p>}
  </section>
 </div></main>;
}
