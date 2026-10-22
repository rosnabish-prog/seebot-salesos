'use client';
import {useEffect,useState} from 'react';
import {post,request,fmtDate} from '@/lib/api';
import {Button,ErrorMessage} from '@/components/ui';
import {FileSignature,ShieldCheck,AlertTriangle} from 'lucide-react';
type Document={id:string;fileName:string;kind:string};
type Contact={name:string;email:string|null};
type AuditEvent={sequence:number;type:string;occurredAt:string;actorEmail:string|null;ipAddress:string|null};
type Envelope={id:string;documentId:string;recipientName:string;recipientEmail:string;status:string;createdAt:string;expiresAt:string;signedAt:string|null;signedDocumentId:string|null;audit:AuditEvent[]};
export default function SigningAdmin({contractId,documents,contacts}:{contractId:string;documents:Document[];contacts:Contact[]}){
 const [envelopes,setEnvelopes]=useState<Envelope[]>([]),[email,setEmail]=useState(''),[name,setName]=useState(''),[documentId,setDocumentId]=useState(''),[draftId,setDraftId]=useState(''),[delivery,setDelivery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>request<Envelope[]>(`/contracts/${contractId}/signing`).then(setEnvelopes).catch(e=>setError(e.message));
 useEffect(()=>{void load()},[contractId]);
 const drafts=documents.filter(x=>x.kind==='DRAFT');
 async function create(){setBusy(true);setError('');setDelivery('');try{
  const draft=await post<{id:string}>(`/contracts/${contractId}/signing/drafts`,{documentId,recipientName:name,recipientEmail:email,daysValid:7});setDraftId(draft.id);await load();
 }catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function activate(){setBusy(true);setError('');try{
  const result=await post<{delivery:{status:string;messageId:string};notice:string}>(`/contracts/${contractId}/signing/${draftId}/activate`,{});setDelivery(result.notice);setDraftId('');await load();
 }catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function downloadEvidence(envelopeId:string){
  setError('');setBusy(true);
  try{
   const host=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000';
   const response=await fetch(`${host}/api/contracts/${contractId}/signing/${envelopeId}/evidence-receipt`,{credentials:'include'});
   if(!response.ok)throw Error('Evidence receipt is unavailable or has not passed verification.');
   const blob=new Blob([await response.text()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=`signing-evidence-${envelopeId}.json`;a.click();
   window.setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function revoke(id:string){setBusy(true);setError('');try{await post(`/contracts/${contractId}/signing/${id}/revoke`,{});setDelivery('');await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <section style={{borderTop:'1px solid #e5e7eb',paddingTop:20,marginTop:14,display:'grid',gap:12}}>
   <h3 style={{display:'flex',gap:8,alignItems:'center',margin:0}}><FileSignature color="#FF7A3D" size={19}/> Restricted Google Sign-in</h3>
   <p className="muted small-text">External signing requires a verified Google account matching the exact recipient email. Signing links are private and expire; opening a document does not count as signing. Live signing is disabled until Google OAuth and the audit service are configured.</p>
   <ErrorMessage message={error}/>
   {drafts.length>0&&<div style={{display:'grid',gap:8}}>
     <label className="field"><span className="field-label">Draft PDF</span><select value={documentId} onChange={e=>setDocumentId(e.target.value)} required><option value="">Select draft to sign</option>{drafts.map(d=><option value={d.id} key={d.id}>{d.fileName}</option>)}</select></label>
     <label className="field"><span className="field-label">Recipient email</span><input type="email" required value={email} onChange={e=>{setEmail(e.target.value);const contact=contacts.find(c=>c.email?.toLowerCase()===e.target.value.trim().toLowerCase());if(contact)setName(contact.name)}} placeholder="authorized.signer@client.com"/></label>
     <label className="field"><span className="field-label">Recipient full name</span><input required value={name} onChange={e=>setName(e.target.value)}/></label>
     <Button type="button" variant="secondary" disabled={busy||!documentId||!email||!name} onClick={create}>Prepare Signing Invitation</Button>
   </div>}
   {!drafts.length&&<p className="muted small-text">Upload a contract PDF marked as Draft before creating an invitation.</p>}
   {draftId&&<div className="soft-callout"><ShieldCheck size={18}/>Invitation draft is ready. Activating generates and sends the restricted invitation using the connected Gmail account when live sending is enabled.<Button type="button" disabled={busy} onClick={activate}>Activate Link</Button></div>}
   {delivery&&<div className="soft-callout"><AlertTriangle size={16}/>{delivery}</div>}
   {envelopes.map(e=><div key={e.id} style={{padding:12,border:'1px solid #e5e7eb',borderRadius:10}}><div><strong>{e.recipientName}</strong> · {e.recipientEmail} · <strong>{e.status}</strong></div><p className="muted small-text">Expires {fmtDate(e.expiresAt)} {e.signedAt?`· Signed ${fmtDate(e.signedAt)}`:''}</p>
     {e.audit.map(a=><div key={a.sequence} className="invoice-child-row"><small>#{a.sequence} · {new Date(a.occurredAt).toLocaleString()} · {a.type}{a.ipAddress?` · Recorded IP: ${a.ipAddress}`:''}</small></div>)}
     {e.status==='SIGNED'&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void downloadEvidence(e.id)}>Download verified signing evidence</Button>}
     {['DRAFT','INVITED'].includes(e.status)&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>revoke(e.id)}>Revoke invitation</Button>}
   </div>)}
 </section>;
}
