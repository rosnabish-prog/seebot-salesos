'use client';
import {GoogleLoginButton} from '@/components/google-login-button';

import {useState,useEffect,FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {LockKeyhole,Mail,ArrowRight,ShieldCheck} from 'lucide-react';
import Image from 'next/image';
import {Button,ErrorMessage} from '@/components/ui';
import Link from 'next/link';
import {useAuth} from '@/context/auth';
export default function Login(){const router=useRouter(),{user,login,loading}=useAuth(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!loading&&user)router.replace('/entry');},[loading,user,router]);
 async function submit(e:FormEvent){e.preventDefault();setPending(true);setError('');try{await login(email,password);router.replace('/entry');}catch(e:any){setError(e.message)}finally{setPending(false)}}
 return <main className="login-scene"><section className="login-brand"><div className="login-brand-content"><div className="brand-large"><Image src="/seebot-logo.png" width={1174} height={328} alt="Seebot" priority className="official-wordmark"/></div><div className="intro-bar"/><h1>Every opportunity.<br/>One clear path forward.</h1><p>Research smarter. Track every conversation. Move qualified opportunities from first contact to signed contracts.</p><div className="login-pills"><span>Research</span><span>Engage</span><span>Win</span></div></div><div className="login-brand-footer">SEEBOT SALES OPERATIONS</div></section><section className="login-card-wrap"><div className="login-card"><span className="login-caption"><ShieldCheck size={16}/> SECURE TEAM WORKSPACES</span><h2>Welcome back</h2><p>Sign in to access your team's SalesOS workspace.</p><form onSubmit={submit} className="stack-18"><label className="field"><span className="field-label">Work email</span><div className="input-icon"><Mail size={18}/><input type="email" placeholder="name@company.com" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></div></label><label className="field"><span className="field-label">Password</span><div className="input-icon"><LockKeyhole size={18}/><input type="password" placeholder="Your password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div></label><div style={{textAlign:'right',marginTop:-6}}><Link href="/forgot-password" className="auth-text-link">Forgot password?</Link></div><ErrorMessage message={error}/><Button type="submit" loading={pending} className="full-width">Sign in <ArrowRight size={17}/></Button></form><GoogleLoginButton onError={setError}/><div className="login-footnote">New to SalesOS? <Link href="/signup" className="auth-text-link"><strong>Create an account</strong></Link></div></div></section></main>
}
