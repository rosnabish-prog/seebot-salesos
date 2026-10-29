'use client';
import {useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import {useRouter} from 'next/navigation';
import {post} from '@/lib/api';
import type {MfaChallenge} from '@/context/auth';

export default function AcceptInvitation(){
  const router=useRouter(),[token,setToken]=useState(''),mount=useRef<HTMLDivElement>(null),[loaded,setLoaded]=useState(false),[message,setMessage]=useState('Sign in with the Google account that received the invitation.');
  const clientId=process.env.NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID||'';
  useEffect(()=>{setToken(new URLSearchParams(window.location.search).get('token')||'');},[]);
  useEffect(()=>{
    if(!loaded||!clientId||!token||!window.google||!mount.current)return;
    window.google.accounts.id.initialize({client_id:clientId,callback:async response=>{
      if(!response.credential){setMessage('Google sign-in did not return a credential.');return;}
      setMessage('Confirming your invitation…');
      try{const challenge=await post<MfaChallenge>('/employee-invitations/accept',{invitationToken:token,googleCredential:response.credential});sessionStorage.setItem('salesos_mfa',JSON.stringify(challenge));router.replace('/two-factor');}
      catch(e){setMessage(e instanceof Error?e.message:'Invitation could not be accepted.');}
    }});
    mount.current.innerHTML='';window.google.accounts.id.renderButton(mount.current,{type:'standard',size:'large',theme:'outline',width:280});
  },[loaded,clientId,token,router]);
  return <main className="login-scene"><section className="login-card-wrap" style={{width:'100%',minHeight:'100vh'}}><div className="login-card"><h2>Accept SalesOS Invitation</h2><p>{!token?'Missing or invalid invitation link.':message}</p>{clientId&&token?<><Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={()=>setLoaded(true)}/><div ref={mount}/></>:<p>Google sign-in has not been configured or the invitation link is missing.</p>}</div></section></main>;
}
