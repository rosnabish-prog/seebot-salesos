'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import {useParams} from 'next/navigation';
import {ShieldCheck,FileSignature,Eye,LockKeyhole,CheckCircle2,Eraser,Download} from 'lucide-react';
import {BrandSelect,Button,ErrorMessage,Field} from '@/components/ui';

const API=process.env.NEXT_PUBLIC_API_URL||'';
const CLIENT_ID=process.env.NEXT_PUBLIC_SIGNING_GOOGLE_CLIENT_ID||'';
type GoogleResponse={credential:string};
type Access={status:string;signedDocumentAvailable:boolean;envelopeId:string;documentName:string;documentSha256:string;recipientName:string;recipientEmail:string;expiresAt:string;consentText:string;consentVersion:string};

async function signingApi(path:string,payload:Record<string,unknown>,pdf=false){
 const response=await fetch(API+'/api/signing/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok){let error:any;try{error=await response.json()}catch{}throw Error(typeof error?.message==='string'?error.message:'Request was not accepted. Please contact the sender.');}
 return pdf?response.blob():response.json();
}
export default function SignDocument(){
 const params=useParams(),token=String(params.token||'');
 const target=useRef<HTMLDivElement>(null),googleCredential=useRef('');
 const canvasRef=useRef<HTMLCanvasElement>(null),drawingRef=useRef(false);
 const [ready,setReady]=useState(false),[access,setAccess]=useState<Access|null>(null),[pdfUrl,setPdfUrl]=useState(''),[error,setError]=useState('');
 const [signatureMethod,setSignatureMethod]=useState<'TYPE'|'DRAW'|'UPLOAD'>('TYPE'),[signatureImage,setSignatureImage]=useState('');
 const [name,setName]=useState(''),[authority,setAuthority]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[completed,setCompleted]=useState(false);

 const authenticate=useCallback(async({credential}:GoogleResponse)=>{
  googleCredential.current=credential;setBusy(true);setError('');
  try{
   const payload={token,googleIdToken:credential},info=await signingApi('access',payload) as Access;setAccess(info);setName(info.recipientName);
   const blob=await signingApi('document',payload,true) as Blob,next=URL.createObjectURL(blob);setPdfUrl(old=>{if(old)URL.revokeObjectURL(old);return next});
  }catch(e){setError(e instanceof Error?e.message:'Unable to verify signer identity.');googleCredential.current='';}finally{setBusy(false)}
 },[token]);
 useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl)},[pdfUrl]);
 useEffect(()=>{if(!ready||!target.current||!CLIENT_ID||!window.google)return;window.google.accounts.id.initialize({client_id:CLIENT_ID,callback:authenticate});target.current.replaceChildren();window.google.accounts.id.renderButton(target.current,{theme:'outline',size:'large',text:'signin_with',width:310});},[ready,authenticate]);

 async function downloadExecuted(){setBusy(true);setError('');try{const blob=await signingApi('executed-document',{token,googleIdToken:googleCredential.current},true) as Blob,url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='signed-agreement.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){setError(e instanceof Error?e.message:'Unable to download signed agreement.')}finally{setBusy(false)}}
 function draw(ev:React.PointerEvent<HTMLCanvasElement>){
  const canvas=canvasRef.current;if(!canvas)return;const rect=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d');if(!ctx)return;
  const x=(ev.clientX-rect.left)*canvas.width/rect.width,y=(ev.clientY-rect.top)*canvas.height/rect.height;
  if(ev.type==='pointerdown'){drawingRef.current=true;canvas.setPointerCapture(ev.pointerId);ctx.beginPath();ctx.moveTo(x,y);}
  if(ev.type==='pointermove'&&drawingRef.current){ctx.strokeStyle='#111827';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineTo(x,y);ctx.stroke();}
  if(ev.type==='pointerup'||ev.type==='pointercancel'){drawingRef.current=false;setSignatureImage(canvas.toDataURL('image/png'));}
 }
 async function sign(){if(!access||!googleCredential.current)return;setBusy(true);setError('');try{await signingApi('complete',{token,googleIdToken:googleCredential.current,typedName:name,documentSha256:access.documentSha256,signatureMethod,signatureImage:signatureMethod==='TYPE'?undefined:signatureImage,consentVersion:access.consentVersion,consent,authority});setCompleted(true);setAccess({...access,status:'SIGNED',signedDocumentAvailable:true});setPdfUrl('');}catch(e){setError(e instanceof Error?e.message:'Unable to record signature.')}finally{setBusy(false)}}
 function clearDrawing(){const canvas=canvasRef.current;if(canvas)canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);setSignatureImage('')}

 return <main className="signing-public">
  <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={()=>setReady(true)}/>
  <section className="signing-card">
   <header className="signing-header"><span className="signing-emblem"><FileSignature size={23}/></span><div><small>SECURE AGREEMENT</small><h1>Review & Sign Agreement</h1><p>Private signing invitation · Seebot SalesOS</p></div></header>
   <ErrorMessage message={error}/>
   {(completed||access?.status==='SIGNED')?<div className="signing-complete"><span><CheckCircle2 size={31}/></span><h2>Your signature was recorded.</h2><p>The executed document remains available to the verified signer for the permitted retrieval period.</p><Button disabled={busy||!googleCredential.current} loading={busy} onClick={()=>void downloadExecuted()}><Download size={15}/>Download signed PDF</Button></div>
   :!access?<div className="signing-auth"><div className="soft-callout"><LockKeyhole size={18}/><span><strong>Recipient identity required</strong><p>This agreement can only be opened by the exact Google account invited by the sender.</p></span></div><p className="muted small-text">Signing in here does not create a SalesOS account. Access and signature events are recorded as contract evidence.</p>{!CLIENT_ID?<div className="error-banner">The signer portal is not configured. Contact the document sender.</div>:<div className="google-signing-target" ref={target}/>} {busy&&<p className="muted small-text">Verifying recipient identity…</p>}</div>
   :<div className="signing-workspace">
     <div className="signing-verified"><ShieldCheck size={17}/><span>Verified recipient <strong>{access.recipientEmail}</strong></span><BadgeLike>{new Date(access.expiresAt).toLocaleDateString()}</BadgeLike></div>
     <div className="signing-document-meta"><strong>{access.documentName}</strong><span>SHA-256 {access.documentSha256.slice(0,20)}…</span></div>
     <div className="soft-callout"><Eye size={17}/><span>Review the complete PDF before signing. SalesOS records document access, but an access event is not proof that every page was read.</span></div>
     {pdfUrl&&<iframe title="Contract PDF for review" src={pdfUrl+'#toolbar=1'} className="signing-pdf"/>}
     <div className="signing-form">
      <Field label="Your full legal name"><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></Field>
      <Field label="Signature method"><BrandSelect value={signatureMethod} onValueChange={value=>{setSignatureMethod(value as 'TYPE'|'DRAW'|'UPLOAD');setSignatureImage('')}} ariaLabel="Signature method"><option value="TYPE">Type full name</option><option value="DRAW">Draw signature</option><option value="UPLOAD">Upload signature image</option></BrandSelect></Field>
      {signatureMethod==='DRAW'&&<div className="signature-draw"><canvas ref={canvasRef} width={500} height={160} onPointerDown={draw} onPointerMove={draw} onPointerUp={draw} onPointerCancel={draw}/><Button type="button" variant="secondary" onClick={clearDrawing}><Eraser size={14}/>Clear drawing</Button></div>}
      {signatureMethod==='UPLOAD'&&<Field label="Signature PNG (250 KB maximum)"><input type="file" accept="image/png" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>250000){setError('PNG must be under 250 KB.');return;}const reader=new FileReader();reader.onload=()=>setSignatureImage(String(reader.result||''));reader.readAsDataURL(file);}}/></Field>}
      <label className="checkbox-line signing-consent"><input type="checkbox" checked={authority} onChange={e=>setAuthority(e.target.checked)}/><span>I confirm I am authorized to sign on behalf of the named party.</span></label>
      <label className="checkbox-line signing-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{access.consentText}</span></label>
      <Button className="full-width signing-submit" disabled={busy||!consent||!authority||name.trim().length<3||(signatureMethod!=='TYPE'&&!signatureImage)} loading={busy} onClick={()=>void sign()}>Confirm & Electronically Sign</Button>
      <p className="muted small-text">The executed PDF contains a visible signature attestation and SalesOS retains a separate audit record. This is an electronic signature, not a qualified digital certificate.</p>
     </div>
    </div>}
  </section>
 </main>;
}
function BadgeLike({children}:{children:React.ReactNode}){return <span className="signing-date-badge">{children}</span>}
