'use client';
import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {UserPlus,Mail,LockKeyhole} from 'lucide-react';
import {Button,ErrorMessage} from '@/components/ui';
import {request,post} from '@/lib/api';
import {useAuth} from '@/context/auth';
import {GoogleLoginButton} from '@/components/google-login-button';

type Capabilities={emailSignupEnabled:boolean;developerSignup:boolean;passwordResetEnabled:boolean;googleConfigured:boolean;emailVerificationRequired?:boolean};
export default function SignUp(){
 const router=useRouter(),{user,refresh}=useAuth(),[cap,setCap]=useState<Capabilities|null>(null),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{void request<Capabilities>('/auth/capabilities').then(setCap).catch(()=>setError('Cannot connect to the authentication service.'));},[]);
 useEffect(()=>{if(user)router.replace('/entry');},[user,router]);
 async function submit(e:FormEvent){
  e.preventDefault();setError('');setMessage('');setPending(true);
  try{
   const result=await post<{user?:{id:string};verificationRequired?:boolean;notice?:string}>('/auth/register',{name,email,password});
   if(result.user){await refresh();router.replace('/entry');return;}
   setMessage(result.notice||'Check your email to verify your account before signing in.');setPassword('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to create account.');}
  finally{setPending(false);}
 }
 return <main className="login-scene">
  <section className="login-brand"><div className="login-brand-content"><div className="brand-large"><Image src="/seebot-logo.png" width={1174} height={328} alt="Seebot" priority className="official-wordmark"/></div><div className="intro-bar"/><h1>One workspace.<br/>Your team's next chapter.</h1><p>Set up a company workspace, invite teammates and manage your sales operations in one place.</p></div><div className="login-brand-footer">SEEBOT SALES OPERATIONS</div></section>
  <section className="login-card-wrap"><div className="login-card">
   <span className="login-caption"><UserPlus size={16}/> CREATE YOUR ACCOUNT</span>
   <h2>Get started with SalesOS</h2><p>Use your company email to register. Personal email providers are not eligible to create a workspace.</p>
   {cap?.developerSignup&&<p className="auth-preview-note">Private development preview: verify your work email using the test inbox on private port 8025. This is a simulated email delivery, not company ownership verification. Do not use real customer information.</p>}
   {cap&& !cap.emailSignupEnabled&&<p className="auth-preview-note">Email registration is not enabled on this deployment. Ask for a workspace invitation or use a configured Google account.</p>}
   {message?<div role="status" className="soft-callout"><p>{message}</p><Link href="/login" className="auth-text-link">Return to sign in</Link></div>:
   <form className="stack-18" onSubmit={submit}>
    <label className="field"><span className="field-label">Your name</span><input type="text" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} required maxLength={160} placeholder="Full name"/></label>
    <label className="field"><span className="field-label">Work email</span><div className="input-icon"><Mail size={18}/><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@company.com"/></div></label>
    <label className="field"><span className="field-label">Create password</span><div className="input-icon"><LockKeyhole size={18}/><input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="At least 12 characters"/></div></label>
    <ErrorMessage message={error}/>
    <Button type="submit" loading={pending} disabled={cap===null||!cap.emailSignupEnabled} className="full-width">Create account</Button>
   </form>}
   <GoogleLoginButton onError={setError} mode="signup"/>
   <div className="login-footnote">Already have an account? <Link href="/login" className="auth-text-link"><strong>Sign in</strong></Link></div>
  </div></section>
 </main>;
}
