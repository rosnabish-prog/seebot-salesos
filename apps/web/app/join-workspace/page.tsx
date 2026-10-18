'use client';
import {useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {post} from '@/lib/api';
import {useAuth} from '@/context/auth';
import {Button,ErrorMessage} from '@/components/ui';

export default function JoinWorkspace(){
 const router=useRouter(),{user,loading,refresh,logout}=useAuth();
 const [token,setToken]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [googleLoaded,setGoogleLoaded]=useState(false),mount=useRef<HTMLDivElement>(null);
 const clientId=process.env.NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID||'';
 useEffect(()=>{setToken(new URLSearchParams(window.location.search).get('token')||'');setReady(true);},[]);
 async function enter(endpoint:string,body:unknown){
  setBusy(true);setError('');
  try{
   await post(endpoint,body);await refresh();
   router.replace('/entry');
  }catch(e){setError(e instanceof Error?e.message:'Could not accept the invitation.');}
  finally{setBusy(false);}
 }
 useEffect(()=>{
  if(!ready||!token||!googleLoaded||!clientId||user||!window.google||!mount.current)return;
  let active=true;
  window.google.accounts.id.initialize({client_id:clientId,callback:response=>{
   if(response.credential&&active)void enter('/workspace-invitations/accept-google',{token,googleCredential:response.credential});
  }});
  mount.current.innerHTML='';
  window.google.accounts.id.renderButton(mount.current,{type:'standard',size:'large',theme:'outline',width:300});
  return()=>{active=false;};
 },[ready,token,googleLoaded,clientId,user]);
 return <main className="login-scene"><section className="login-card-wrap" style={{width:'100%',minHeight:'100vh'}}>
  <div className="login-card">
   <h2>Join your team's workspace</h2>
   <p>Invitations are valid for seven days, can be used once, and must be accepted using the invited email address.</p>
   {!ready||loading?<p role="status">Checking your sign-in…</p>:!token?<ErrorMessage message="Invitation token missing. Request a new invitation from your administrator."/>:
   user?<div className="stack-16">
    <p>Signed in as <strong>{user.email}</strong></p>
    <Button disabled={busy} loading={busy} onClick={()=>void enter('/workspace-invitations/accept-existing',{token})}>Accept invitation</Button>
    <Button type="button" variant="secondary" disabled={busy} onClick={async()=>{await logout();setError('');}}>Use a different account</Button>
   </div>:
   <div className="stack-16"><p>Sign in with Google using the address where your team sent the invitation.</p>
    {clientId?<><Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={()=>setGoogleLoaded(true)}/><div ref={mount} aria-label="Google invitation sign-in"/></>:<p>Google account acceptance is not configured. Ask your administrator to enable Google sign-in for new team members.</p>}
    <Link href="/login">Already have a SalesOS account? Sign in, then reopen this invitation link.</Link>
   </div>}
   <ErrorMessage message={error}/>
  </div></section></main>;
}
