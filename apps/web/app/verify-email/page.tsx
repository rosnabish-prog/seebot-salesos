'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
import {post} from '@/lib/api';
import {useAuth,MfaChallenge} from '@/context/auth';
export default function VerifyEmail(){
 const router=useRouter(),[message,setMessage]=useState('Verifying your email…'),[failed,setFailed]=useState(false);
 useEffect(()=>{
  const token=new URLSearchParams(window.location.search).get('token');
  if(!token){setMessage('The verification link is missing its token.');setFailed(true);return;}
  let active=true;
  void post<MfaChallenge>('/auth/verify-signup',{token}).then(challenge=>{
    if(!active)return;
    sessionStorage.setItem('salesos_mfa',JSON.stringify({challengeId:challenge.challengeId,maskedEmail:challenge.maskedEmail,...(challenge.testCode?{testCode:challenge.testCode}:{})}));
    router.replace('/two-factor');
  })
    .catch(err=>{if(active){setMessage(err instanceof Error?err.message:'Verification failed.');setFailed(true);}});
  return()=>{active=false;};
 },[router,refresh]);
 return <main className="login-scene"><section className="login-card-wrap" style={{width:'100%',minHeight:'100vh'}}><div className="login-card"><h2>Email verification</h2><p role="status">{message}</p>{failed&&<Link className="auth-text-link" href="/signup">Return to sign up</Link>}</div></section></main>;
}
