'use client';
import {FormEvent,useEffect,useState} from 'react';
import Image from 'next/image';
import {useRouter} from 'next/navigation';
import {KeyRound,ShieldCheck} from 'lucide-react';
import {Button,ErrorMessage} from '@/components/ui';
import {post} from '@/lib/api';
import {useAuth} from '@/context/auth';
export default function TwoFactor(){
 const router=useRouter(),{verifyMfa}=useAuth();
 const [challengeId,setChallengeId]=useState(''),[maskedEmail,setMaskedEmail]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[resending,setResending]=useState(false),[resent,setResent]=useState('');
 useEffect(()=>{try{const raw=sessionStorage.getItem('salesos_mfa');if(!raw){router.replace('/login');return;}const saved=JSON.parse(raw);setChallengeId(String(saved.challengeId||''));setMaskedEmail(String(saved.maskedEmail||''));}catch{router.replace('/login');}},[router]);
 async function resend(){
  if(!challengeId)return;setResending(true);setError('');setResent('');
  try{const next=await post<{challengeId:string;maskedEmail:string}>('/auth/mfa/resend',{challengeId});setChallengeId(next.challengeId);setMaskedEmail(next.maskedEmail);sessionStorage.setItem('salesos_mfa',JSON.stringify({challengeId:next.challengeId,maskedEmail:next.maskedEmail}));setResent('A new verification code was sent.');}
  catch(e){setError(e instanceof Error?e.message:'Could not resend verification code.');}finally{setResending(false)}
 }
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await verifyMfa(challengeId,code);sessionStorage.removeItem('salesos_mfa');router.replace('/entry');}catch(e){setError(e instanceof Error?e.message:'Verification failed.');}finally{setBusy(false);}}
 return <main className="login-scene"><section className="login-brand"><div className="login-brand-content"><div className="brand-large"><Image src="/seebot-logo.png" width={1174} height={328} alt="Seebot" priority className="official-wordmark"/></div><div className="intro-bar"/><h1>One more check.<br/>Then you're in.</h1><p>SalesOS requires two-factor verification on every new sign-in. Sessions expire automatically after seven days.</p></div><div className="login-brand-footer">SEEBOT SALES OPERATIONS</div></section>
 <section className="login-card-wrap"><div className="login-card"><span className="login-caption"><ShieldCheck size={16}/> TWO-FACTOR VERIFICATION</span><h2>Enter your verification code</h2><p>We sent a 6-digit code to {maskedEmail||'your company email'}. It expires in 10 minutes.</p>
 <form className="stack-18" onSubmit={submit}><label className="field"><span className="field-label">Verification code</span><div className="input-icon"><KeyRound size={18}/><input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" required/></div></label><ErrorMessage message={error}/>{resent&&<div className="success-banner" role="status">{resent}</div>}<Button className="full-width" type="submit" loading={busy} disabled={code.length!==6}>Verify & continue</Button><Button variant="secondary" className="full-width" type="button" loading={resending} onClick={()=>void resend()}>Resend code</Button><Button variant="ghost" className="full-width" type="button" onClick={()=>{sessionStorage.removeItem('salesos_mfa');router.replace('/login')}}>Back to sign in</Button></form>
 <p className="login-footnote">For security, codes are single-use and a verified session lasts no longer than seven days.</p></div></section></main>;
}
