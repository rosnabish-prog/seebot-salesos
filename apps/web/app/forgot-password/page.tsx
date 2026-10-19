'use client';
import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {Mail,KeyRound} from 'lucide-react';
import {Button,ErrorMessage} from '@/components/ui';
import {request,post} from '@/lib/api';

export default function ForgotPassword(){
 const [enabled,setEnabled]=useState<boolean|null>(null),[mailbox,setMailbox]=useState(false),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{void request<{passwordResetEnabled:boolean;previewMailbox?:boolean}>('/auth/capabilities').then(x=>{setEnabled(x.passwordResetEnabled);setMailbox(Boolean(x.previewMailbox));}).catch(()=>setError('Authentication service is unavailable.'));},[]);
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try{const r=await post<{notice:string}>('/auth/forgot-password',{email});setMessage(r.notice);}
  catch(e){setError(e instanceof Error?e.message:'Password recovery could not be started.');}finally{setBusy(false);}
 }
 return <main className="login-scene"><section className="login-brand"><div className="login-brand-content"><Image src="/seebot-logo.png" width={1174} height={328} alt="Seebot" className="official-wordmark"/><div className="intro-bar"/><h1>Get back to work.</h1><p>Recover your SalesOS account without affecting company workspace data.</p></div></section>
  <section className="login-card-wrap"><div className="login-card"><span className="login-caption"><KeyRound size={16}/> ACCOUNT RECOVERY</span><h2>Forgot your password?</h2>
   <p>Enter the email associated with your account. We will send a one-time password reset link when email delivery is configured.</p>
   {enabled===false&&<p className="auth-preview-note">Password recovery email is not configured on this private Codespace yet. Contact your workspace administrator to reset your password securely.</p>}
   {mailbox&&<p className="auth-preview-note">Private Codespaces test: open port 8025 in the Ports tab to read the reset email in Mailpit. Keep port 8025 Private.</p>}
   {message?<div role="status" className="soft-callout">{message}</div>:<form onSubmit={submit} className="stack-18">
    <label className="field"><span className="field-label">Email address</span><div className="input-icon"><Mail size={18}/><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required/></div></label>
    <ErrorMessage message={error}/>
    <Button type="submit" className="full-width" loading={busy} disabled={enabled!==true}>Send reset link</Button>
   </form>}
   <p className="login-footnote"><Link href="/login" className="auth-text-link">Return to sign in</Link></p>
  </div></section></main>;
}
