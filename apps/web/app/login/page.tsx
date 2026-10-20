'use client';
import {useState,useEffect,useCallback,FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {LockKeyhole,Mail,ArrowRight,ShieldCheck,KeyRound} from 'lucide-react';
import Image from 'next/image';
import {GoogleLoginButton} from '@/components/google-login-button';
import {Button,ErrorMessage} from '@/components/ui';
import {request,post} from '@/lib/api';
import {useAuth,executive,LoginResult,User} from '@/context/auth';
type LoginStep='credentials'|'setup'|'verify'|'recovery';
type Enrollment={secret:string;uri:string;issuer:string;account:string};
export default function Login(){
 const router=useRouter(),{user,login,loading,acceptLogin,logout}=useAuth();
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
 const[step,setStep]=useState<LoginStep>('credentials'),[enrollment,setEnrollment]=useState<Enrollment|null>(null),[codes,setCodes]=useState<string[]>([]),[enrolledUser,setEnrolledUser]=useState<User|null>(null);
 const[pending,setPending]=useState(false),[error,setError]=useState('');
 const onChallenge=useCallback((setup:boolean)=>{setStep(setup?'setup':'verify');setError('');setCode('');},[]);
 const onGoogleError=useCallback((message:string)=>setError(message),[]);
 useEffect(()=>{if(!loading&&user&&step!=='recovery')router.replace(executive(user.role)?'/executive':'/dashboard');},[loading,user,router,step]);
 useEffect(()=>{if(loading||user)return;let active=true;request<LoginResult>('/auth/mfa/status').then(r=>{if(active&&r.mfaRequired)onChallenge(Boolean(r.setupRequired))}).catch(()=>{});return()=>{active=false}},[loading,user,onChallenge]);
 useEffect(()=>{if(step!=='setup'||enrollment)return;let active=true;post<Enrollment>('/auth/mfa/setup',{}).then(v=>{if(active)setEnrollment(v)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[step,enrollment]);
 function navigate(u:User){acceptLogin(u);router.replace(executive(u.role)?'/executive':'/dashboard');}
 async function submit(e:FormEvent){
   e.preventDefault();setPending(true);setError('');
   try{
     const r=await login(email,password);
     if(r.mfaRequired)onChallenge(Boolean(r.setupRequired));
     else if(r.user)navigate(r.user);
     else throw Error('Invalid sign-in response.');
   }catch(e:any){setError(e.message)}finally{setPending(false)}
 }
 async function submitCode(e:FormEvent){
   e.preventDefault();setPending(true);setError('');
   try{
     const isSetup=step==='setup';
     const r=await post<LoginResult>(isSetup?'/auth/mfa/confirm':'/auth/mfa/verify',{code:code.trim()});
     if(!r.user)throw Error('The verification response was incomplete.');
     if(isSetup){
       setEnrolledUser(r.user);setCodes(r.recoveryCodes||[]);setStep('recovery');setCode('');
     }else navigate(r.user);
   }catch(e:any){setError(e.message)}finally{setPending(false)}
 }
 async function restart(){await logout();setStep('credentials');setEnrollment(null);setCode('');setCodes([]);setPassword('');setError('');}
 return <main className="login-scene"><section className="login-brand"><div className="login-brand-content"><div className="brand-large"><Image src="/seebot-logo.png" width={1174} height={328} alt="Seebot" priority className="official-wordmark"/></div><div className="intro-bar"/><h1>Every opportunity.<br/>One clear path forward.</h1><p>Research smarter. Track every conversation. Move qualified opportunities from first contact to signed contracts.</p><div className="login-pills"><span>Research</span><span>Engage</span><span>Win</span></div></div><div className="login-brand-footer">SEEBOT SALES OPERATIONS</div></section>
 <section className="login-card-wrap"><div className="login-card">
  <span className="login-caption"><ShieldCheck size={16}/> PRIVATE TEAM WORKSPACE</span>
  {step==='credentials'&&<><h2>Welcome back</h2><p>Sign in using your Seebot employee credentials.</p>
    <form onSubmit={submit} className="stack-18">
      <label className="field"><span className="field-label">Work email</span><div className="input-icon"><Mail size={18}/><input type="email" placeholder="name@seebot.ai" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></div></label>
      <label className="field"><span className="field-label">Password</span><div className="input-icon"><LockKeyhole size={18}/><input type="password" placeholder="Your password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div></label>
      <ErrorMessage message={error}/>
      <Button type="submit" loading={pending} className="full-width">Sign in <ArrowRight size={17}/></Button>
    </form><GoogleLoginButton onError={onGoogleError} onChallenge={onChallenge}/>
    <div className="login-footnote">Accounts are provisioned by a Seebot administrator. Contact your administrator if you need access.</div>
  </>}
  {step==='setup'&&<><h2>Protect your account</h2><p>Two-factor authentication is required. Add this account to an authenticator app that supports six-digit time-based codes.</p>
    {enrollment?<><label className="field"><span className="field-label">Authenticator setup key</span><code style={{fontSize:17,overflowWrap:'anywhere',padding:12,background:'#f5f6f8',borderRadius:8,userSelect:'all'}}>{enrollment.secret}</code></label>
    <p className="muted small-text">Account: {enrollment.account} · Issuer: {enrollment.issuer}. Keep this key private. It is shown only during setup.</p></>:<p role="status">Preparing your authenticator setup…</p>}
    <form onSubmit={submitCode} className="stack-18"><label className="field"><span className="field-label">Six-digit verification code</span><input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" placeholder="000000" required/></label><ErrorMessage message={error}/><Button type="submit" loading={pending} className="full-width" disabled={!enrollment}>Verify and enable MFA</Button></form>
  </>}
  {step==='verify'&&<><h2>Verify it's you</h2><p>Enter the six-digit code from your authenticator app. You can also use one unused recovery code.</p><form className="stack-18" onSubmit={submitCode}><label className="field"><span className="field-label">Authenticator or recovery code</span><div className="input-icon"><KeyRound size={18}/><input value={code} onChange={e=>setCode(e.target.value)} autoComplete="one-time-code" placeholder="6-digit code or recovery code" required/></div></label><ErrorMessage message={error}/><Button type="submit" className="full-width" loading={pending}>Verify and sign in <ArrowRight size={17}/></Button></form></>}
  {step==='recovery'&&<><h2>Save your recovery codes</h2><p>These eight one-time recovery codes provide emergency access if your authenticator is unavailable. Store them securely; they will not be shown again.</p>
    <div style={{display:'grid',gridTemplateColumns:'1fr',gap:7,marginBottom:16}}>{codes.map(c=><code key={c} style={{background:'#f5f6f8',padding:'7px 9px',borderRadius:6,fontSize:12,letterSpacing:'.3px'}}>{c}</code>)}</div>
    <Button type="button" variant="secondary" className="full-width" onClick={()=>{void navigator.clipboard.writeText(codes.join('\n')).catch(()=>setError('Copy unavailable. Save each recovery code manually.'));}}>Copy recovery codes</Button>
    <ErrorMessage message={error}/><Button type="button" className="full-width" onClick={()=>{if(enrolledUser)navigate(enrolledUser)}}>I have saved my recovery codes</Button>
  </>}
  {step!=='credentials'&&step!=='recovery'&&<button type="button" className="btn btn-ghost full-width" style={{marginTop:16}} onClick={()=>void restart()}>Use another account</button>}
 </div></section></main>;
}
