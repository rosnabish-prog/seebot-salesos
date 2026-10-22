'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { post } from '../lib/api';
import { useRouter } from 'next/navigation';

/** Google Identity Services, distinct from Gmail inbox authorization. */
export function GoogleLoginButton({onError,mode='login'}:{onError:(message:string)=>void;mode?:'login'|'signup'}){
  const clientId=process.env.NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID;
  const mount=useRef<HTMLDivElement>(null),router=useRouter();
  const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!loaded||!clientId||!mount.current||!window.google)return;
    let current=true;
    window.google.accounts.id.initialize({client_id:clientId,callback:async response=>{
      if(!response.credential||!current)return;
      setBusy(true);
      try{
        const challenge=await post<{challengeId:string;maskedEmail:string;testCode?:string}>('/auth/google',{credential:response.credential});
        sessionStorage.setItem('salesos_mfa',JSON.stringify({challengeId:challenge.challengeId,maskedEmail:challenge.maskedEmail,...(challenge.testCode?{testCode:challenge.testCode}:{})}));
        router.replace('/two-factor');
      }catch(err){onError(err instanceof Error?err.message:'Google sign-in failed.');}
      finally{if(current)setBusy(false);}
    }});
    mount.current.innerHTML='';
    window.google.accounts.id.renderButton(mount.current,{type:'standard',theme:'outline',size:'large',text:mode==='signup'?'signup_with':'signin_with',shape:'rectangular',width:300});
    return ()=>{current=false;};
  },[loaded,clientId,onError,router,mode]);
  if(!clientId)return <div className="google-workforce-login"><div className="google-divider">or continue with Google</div><button className="btn btn-secondary full-width" type="button" disabled aria-label="Continue with Google (configuration required)">Continue with Google</button><p className="google-config-note">Google sign-in will appear when the administrator configures Google OAuth for this application.</p></div>;
  return <div className="google-workforce-login" aria-busy={busy}>
    <div className="google-divider">or sign in with Google</div>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={()=>setLoaded(true)}/>
    <div ref={mount} aria-label="Google sign-in"/>
    {busy&&<small>Verifying Google account…</small>}
  </div>;
}
