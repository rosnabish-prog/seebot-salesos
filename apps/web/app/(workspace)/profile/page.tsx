'use client';
import {AuthenticatorPanel,SessionsPanel} from '@/components/organization/account-security-panel';
import {RecoveryCodesPanel} from '@/components/organization/recovery-codes-panel';
import { GmailConnectionPanel } from '@/components/integrations/gmail-connection-panel';
 
import {useState,FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {ShieldCheck,UserRound,KeyRound} from 'lucide-react';
import {useAuth} from '@/context/auth';
import {patch} from '@/lib/api';
import {PageTop,Panel,Field,Button,ErrorMessage} from '@/components/ui';
export default function Profile(){const{user,logout}=useAuth(),router=useRouter();const[currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await patch('/auth/password',{currentPassword,newPassword});setCurrentPassword('');setNewPassword('');await logout();router.replace('/login');}catch(e:any){setError(e.message)}finally{setBusy(false)}}
return <><PageTop kicker="ACCOUNT SECURITY" title="My Profile" description="Your Seebot account and sign-in settings."/><div className="profile-grid"><Panel title="Account Details"><div className="profile-detail"><UserRound size={21}/><div><strong>{user?.name}</strong><span>{user?.email}</span></div></div><div className="profile-detail"><ShieldCheck size={21}/><div><strong>Access role</strong><span>{user?.role.replaceAll('_',' ')}</span></div></div></Panel><Panel title="Change Password"><p className="muted small-text">Use a unique password of at least 12 characters. Your existing sessions will need to sign in again.</p><form className="stack-16" onSubmit={save}><Field label="Current password"><input autoComplete="current-password" type="password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></Field><Field label="New password (12+ characters)"><input autoComplete="new-password" type="password" required minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></Field><ErrorMessage message={error}/><Button loading={busy} type="submit"><KeyRound size={17}/>Update Password</Button></form></Panel></div><AuthenticatorPanel/><RecoveryCodesPanel/><SessionsPanel/><GmailConnectionPanel/></>;
}
