'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useAuth,executive} from '@/context/auth';
import {post,request} from '@/lib/api';
type Workspace={status:string;id:string;crmEnabled:boolean;tenantCrmEnabled:boolean};
type Selection={crmEnabled:boolean;tenantCrmEnabled:boolean};
export default function WorkspaceEntry(){
 const router=useRouter(),{user,loading}=useAuth(),[error,setError]=useState('');
 useEffect(()=>{
  if(loading)return;
  if(!user){router.replace('/login');return;}
  let cancelled=false;
  (async()=>{
   try{
    const list=await request<Workspace[]>('/workspaces');
    if(cancelled)return;
    if(!list.length){router.replace('/workspaces?new=1');return;}
    if(list.length>1||list[0].status==='SUSPENDED'){router.replace('/workspaces');return;}
    const workspace=list[0];
    const selected=await post<Selection>(`/workspaces/${workspace.id}/select`,{});
    if(cancelled)return;
    if(selected.crmEnabled)router.replace(executive(user.role)?'/executive':'/dashboard');
    else if(selected.tenantCrmEnabled)router.replace(`/workspaces/${workspace.id}`);
    else router.replace(`/workspaces?manage=${encodeURIComponent(workspace.id)}`);
   }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Could not load workspaces.');}
  })();
  return()=>{cancelled=true;};
 },[loading,user,router]);
 return <main className="login-scene"><section className="login-card-wrap" style={{width:'100%',minHeight:'100vh'}}><div className="login-card"><h2>Opening your workspace</h2><p role="status">{error||'Verifying your account and team memberships…'}</p>{error&&<button type="button" className="btn btn-secondary" onClick={()=>router.replace('/workspaces')}>Open workspace list</button>}</div></section></main>;
}
