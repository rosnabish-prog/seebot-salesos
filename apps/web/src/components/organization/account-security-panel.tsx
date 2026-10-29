'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Button,ErrorMessage,Field,Panel} from '@/components/ui';
import {post,request} from '@/lib/api';

type Factor={enabled:boolean;configured:boolean;enabledAt:string|null;recoverySession:boolean};
type Enrollment={enrollmentId:string;secret:string;qrCode:string;expiresAt:string};
export function AuthenticatorPanel(){
 const [factor,setFactor]=useState<Factor|null>(null),[stage,setStage]=useState<'idle'|'email'|'scan'|'disable'>('idle'),[challenge,setChallenge]=useState(''),[code,setCode]=useState(''),[totp,setTotp]=useState(''),[enrollment,setEnrollment]=useState<Enrollment|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setFactor(await request<Factor>('/auth/mfa/authenticator'));}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 async function run(action:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Unable to update authenticator.');}finally{setBusy(false);}}
 async function start(){await run(async()=>{const r=await post<{challengeId:string}>('/auth/mfa/authenticator/'+(factor?.enabled?'disable/start':'start'),{});setChallenge(r.challengeId);setCode('');setTotp('');setStage(factor?.enabled?'disable':'email');});}
 async function enroll(){await run(async()=>{setEnrollment(await post<Enrollment>('/auth/mfa/authenticator/enroll',{challengeId:challenge,code}));setCode('');setStage('scan');});}
 async function confirm(){await run(async()=>{await post('/auth/mfa/authenticator/confirm',{enrollmentId:enrollment?.enrollmentId,code:totp});setEnrollment(null);setStage('idle');setTotp('');await load();window.dispatchEvent(new Event('salesos-account-security-changed'));setNotice('Authenticator enabled. Other sessions were signed out. Save recovery codes for a lost device.');});}
 async function disable(){await run(async()=>{await post('/auth/mfa/authenticator/disable',{challengeId:challenge,emailCode:code,totpCode:totp});setStage('idle');setCode('');setTotp('');await load();window.dispatchEvent(new Event('salesos-account-security-changed'));setNotice('Authenticator removed. Email verification remains required on every sign-in. Other sessions were signed out.');});}
 const numeric=(v:string)=>v.replace(/\D/g,'').slice(0,6);
 return <Panel title="Authenticator app"><ErrorMessage message={error}/>{notice&&<p role="status">{notice}</p>}
  <p>{factor?.enabled?'Your authenticator is required on every sign-in. Saved recovery codes are available if you lose the device.':'Add an authenticator app for sign-in codes. This setting belongs to your account across all organizations.'}</p>
  <p>Sign in within the last five minutes before changing this setting. Changing it signs out your other sessions.</p>
  {factor&&!factor.configured&&<p>Authenticator setup is unavailable. Contact your administrator.</p>}
  {stage==='idle'&&factor&&<Button type="button" variant={factor.enabled?'secondary':'primary'} loading={busy} disabled={!factor.configured} onClick={()=>void start()}>{factor.enabled?'Remove authenticator':'Set up authenticator'}</Button>}
  {stage==='email'&&<div className="stack-16"><p>Enter the setup verification code sent to your company email.</p><Field label="Authenticator setup email code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(numeric(e.target.value))}/></Field><Button disabled={code.length!==6} loading={busy} onClick={()=>void enroll()}>Verify email & continue</Button></div>}
  {stage==='scan'&&enrollment&&<div className="stack-16"><p>Scan this code in your authenticator app, or enter the setup key manually. Setup expires in ten minutes. Keep the key private.</p><img src={enrollment.qrCode} width={280} height={280} alt="Authenticator setup QR code"/><Field label="Authenticator setup key"><input readOnly value={enrollment.secret} autoComplete="off"/></Field><Field label="New authenticator code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={e=>setTotp(numeric(e.target.value))}/></Field><Button disabled={totp.length!==6} loading={busy} onClick={()=>void confirm()}>Confirm authenticator</Button></div>}
  {stage==='disable'&&<div className="stack-16"><p>Enter the removal code sent to your company email.{factor?.recoverySession?' Your recent recovery-code sign-in permits removal of a lost authenticator.':' Also enter a new authenticator code. If verification fails, start the removal process again.'}</p><Field label="Authenticator removal email code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(numeric(e.target.value))}/></Field>{!factor?.recoverySession&&<Field label="Current authenticator code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totp} onChange={e=>setTotp(numeric(e.target.value))}/></Field>}<Button disabled={code.length!==6||!factor?.recoverySession&&totp.length!==6} loading={busy} onClick={()=>void disable()}>Verify & remove authenticator</Button></div>}
  {stage!=='idle'&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>{setEnrollment(null);setChallenge('');setCode('');setTotp('');setStage('idle');setError('');}}>Cancel</Button>}
 </Panel>;
}

type Session={id:string;userAgent:string;current:boolean;mfaMethod:string;authAt:string;lastSeenAt:string;expiresAt:string};
export function SessionsPanel(){
 const router=useRouter();const [sessions,setSessions]=useState<Session[]>([]),[total,setTotal]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const r=await request<{sessions:Session[];total:number}>('/auth/sessions');setSessions(r.sessions);setTotal(r.total);}
 useEffect(()=>{const refresh=()=>{void load().catch(e=>setError(e.message));};refresh();window.addEventListener('salesos-account-security-changed',refresh);return()=>window.removeEventListener('salesos-account-security-changed',refresh);},[]);
 async function revoke(id?:string){setBusy(true);setError('');setNotice('');try{
  if(id){const r=await request<{current:boolean}>('/auth/sessions/'+encodeURIComponent(id),{method:'DELETE'});if(r.current){router.replace('/login');return;}}
  else await post('/auth/sessions/revoke-others',{});
  await load();setNotice(id?'Session signed out.':'Other devices signed out.');
 }catch(e){setError(e instanceof Error?e.message:'Unable to revoke session.');}finally{setBusy(false);}}
 return <Panel title="Your active sessions"><p>These sessions can access your account across all organizations, subject to each organization’s permissions. Browser details are reported by the device. Sign in within the last five minutes before revoking sessions.</p><ErrorMessage message={error}/>{notice&&<p role="status">{notice}</p>}
  <div className="stack-16">{sessions.map(session=><div key={session.id} className="ws-member-row" style={{gap:16,flexWrap:'wrap'}}><span style={{minWidth:0,overflowWrap:'anywhere'}}><strong>{session.current?'This session':'Other session'}</strong><small>{session.userAgent}</small><small>Signed in {new Date(session.authAt).toLocaleString()} · Last active {new Date(session.lastSeenAt).toLocaleString()} · {session.mfaMethod}</small></span>{!session.current&&<Button type="button" variant="secondary" loading={busy} onClick={()=>void revoke(session.id)}>Sign out session</Button>}</div>)}</div>
  {total>sessions.length&&<p>Showing the latest {sessions.length} of {total} sessions. Signing out other devices revokes every other session.</p>}
  <Button type="button" variant="secondary" loading={busy} onClick={()=>void revoke()}>Sign out other devices</Button><Button type="button" variant="ghost" onClick={()=>void load().catch(e=>setError(e.message))}>Refresh sessions</Button>
 </Panel>;
}
