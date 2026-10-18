'use client';
import {useEffect,useState,FormEvent} from 'react';
import {post,request} from '@/lib/api';
import {Panel,Field,Button,Badge,BrandSelect,ErrorMessage,SuccessMessage} from '@/components/ui';

type Invitation={id:string;invitedEmail:string;invitedName:string;role:string;status:string;expiresAt:string;deliveredAt:string|null};
export function InvitationsPanel(){
  const [items,setItems]=useState<Invitation[]>([]),[form,setForm]=useState({name:'',email:'',role:'SALES_REP'}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
  const reload=()=>request<Invitation[]>('/employee-invitations').then(setItems).catch(e=>setError(e.message));
  useEffect(()=>{void reload()},[]);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setInfo('');try{
    const result=await post<{delivery:string;deliveryMessageId:string}>('/employee-invitations',form);
    setInfo(result.delivery==='SENT'?'Invitation sent successfully.':`Invitation saved but not emailed. Check Gmail connection and send the pending message ${result.deliveryMessageId} after configuration.`);
    setForm({name:'',email:'',role:'SALES_REP'});await reload();
  }catch(e){setError(e instanceof Error?e.message:'Failed to invite employee.');}finally{setBusy(false);}}
  return <Panel title="Google-verified Employee Invitations">
    <p className="muted small-text">Each employee receives a restricted invitation for their exact Google address; they do not need a temporary password. External customer-company signups remain disabled pending tenant-isolation testing.</p>
    <form className="stack-16" onSubmit={submit}>
      <div className="field-grid"><Field label="Employee name"><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Google-linked work email"><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field></div>
      <Field label="Access role"><BrandSelect value={form.role} onValueChange={v=>setForm({...form,role:v})}>{['SALES_REP','SALES_MANAGER','TECHNICAL_REVIEWER','DIRECTOR','CEO'].map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</BrandSelect></Field>
      <Button loading={busy} type="submit">Create and Email Invitation</Button>
    </form>
    <ErrorMessage message={error}/><SuccessMessage text={info}/>
    {items.map(i=><div key={i.id} className="record-row"><div><strong>{i.invitedName}</strong><p>{i.invitedEmail} · {i.role.replaceAll('_',' ')}</p><small>Expires {new Date(i.expiresAt).toLocaleDateString()} · {i.deliveredAt?'Delivered via Gmail':'Email not delivered'}</small></div><Badge>{i.status}</Badge></div>)}
  </Panel>;
}
