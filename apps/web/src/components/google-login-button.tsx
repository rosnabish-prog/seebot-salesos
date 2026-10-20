'use client';
import {useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import {post} from '../lib/api';
import {useAuth,executive,LoginResult} from '../context/auth';
import {useRouter} from 'next/navigation';
/** Google authentication is only the first factor; mailbox access is separate. */
export function GoogleLoginButton({onError,onChallenge}:{onError:(message:string)=>void;onChallenge:(setupRequired:boolean)=>void}){
 const clientId=process.env.NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID;
 const mount=useRef<HTMLDivElement>(null),{acceptLogin}=useAuth(),router=useRouter();
 const[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
   if(!loaded||!clientId||!mount.current||!window.google)return;
   let current=true;
   window.google.accounts.id.initialize({client_id:clientId,callback:async response=>{
     if(!response.credential||!current)return;
     setBusy(true);
     try{
       const result=await post<LoginResult>('/auth/google',{credential:response.credential});
       if(result.mfaRequired){onChallenge(Boolean(result.setupRequired));}
       else if(result.user){acceptLogin(result.user);router.replace(executive(result.user.role)?'/executive':'/dashboard');}
       else throw Error('Login response was incomplete.');
     }catch(err){onError(err instanceof Error?err.message:'Google sign-in failed.');}
     finally{if(current)setBusy(false);}
   }});
   mount.current.innerHTML='';
   window.google.accounts.id.renderButton(mount.current,{type:'standard',theme:'outline',size:'large',text:'signin_with',shape:'rectangular',width:300});
   return()=>{current=false;};
 },[loaded,clientId,onError,onChallenge,acceptLogin,router]);
 if(!clientId)return null;
 return <div className="google-workforce-login" aria-busy={busy}>
  <div className="google-divider">or sign in with Google</div>
  <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={()=>setLoaded(true)}/>
  <div ref={mount} aria-label="Google sign-in"/>
  {busy&&<small>Verifying Google account…</small>}
 </div>;
}
