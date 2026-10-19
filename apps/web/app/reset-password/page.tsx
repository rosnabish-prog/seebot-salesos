'use client';
import {FormEvent,useEffect,useState} from 'react';
import Link from 'next/link';
import {post} from '@/lib/api';
import {Button,ErrorMessage} from '@/components/ui';
export default function ResetPassword(){
 const [token,setToken]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false);
 useEffect(()=>{setToken(new URLSearchParams(window.location.search).get('token')||'');},[]);
 async function submit(e:FormEvent){e.preventDefault();setError('');if(password!==confirm){setError('Passwords do not match.');return;}
  setBusy(true);try{await post('/auth/reset-password',{token,password});setSuccess(true);setPassword('');setConfirm('');}catch(e){setError(e instanceof Error?e.message:'Unable to reset password.');}finally{setBusy(false);}
 }
 return <main className="login-scene"><section className="login-card-wrap" style={{width:'100%',minHeight:'100vh'}}><div className="login-card"><h2>Choose a new password</h2><p>Use a password of at least 12 characters. Reset links expire after 30 minutes and work only once.</p>
 {success?<div role="status" className="soft-callout">Your password was changed. Existing sessions have been invalidated. <Link className="auth-text-link" href="/login">Sign in</Link></div>:
 <form className="stack-18" onSubmit={submit}><label className="field"><span className="field-label">New password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
 <label className="field"><span className="field-label">Confirm password</span><input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label><ErrorMessage message={error}/><Button disabled={!token} type="submit" loading={busy}>Reset password</Button></form>}
 <p className="login-footnote"><Link className="auth-text-link" href="/login">Back to sign in</Link></p></div></section></main>;
}
