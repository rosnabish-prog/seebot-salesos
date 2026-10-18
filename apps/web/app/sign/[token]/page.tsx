'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Script from 'next/script';
import {useParams} from 'next/navigation';
import {ShieldCheck,FileSignature,AlertTriangle,Eye,LockKeyhole,CheckCircle2} from 'lucide-react';
const API=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000';
const CLIENT_ID=process.env.NEXT_PUBLIC_SIGNING_GOOGLE_CLIENT_ID||'';
type GoogleResponse={credential:string};
type Access={status:string;signedDocumentAvailable:boolean;envelopeId:string;documentName:string;documentSha256:string;recipientName:string;recipientEmail:string;expiresAt:string;consentText:string;consentVersion:string};
async function signingApi(path:string,payload:Record<string,unknown>,pdf=false){
  const response=await fetch(`${API}/api/signing/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok){let error:any;try{error=await response.json()}catch{};throw Error(typeof error?.message==='string'?error.message:'Request was not accepted. Please contact the sender.');}
  return pdf?response.blob():response.json();
}
export default function SignDocument(){
  const params=useParams(), token=String(params.token||'');
  const target=useRef<HTMLDivElement>(null), googleCredential=useRef('');
  const [ready,setReady]=useState(false),[access,setAccess]=useState<Access|null>(null),[pdfUrl,setPdfUrl]=useState(''),[error,setError]=useState('');
  const canvasRef=useRef<HTMLCanvasElement>(null);const drawingRef=useRef(false);
  const [signatureMethod,setSignatureMethod]=useState<'TYPE'|'DRAW'|'UPLOAD'>('TYPE'),[signatureImage,setSignatureImage]=useState('');
  const [name,setName]=useState(''),[authority,setAuthority]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[completed,setCompleted]=useState(false);
  const authenticate=useCallback(async ({credential}:GoogleResponse)=>{
    googleCredential.current=credential;setBusy(true);setError('');
    try{const payload={token,googleIdToken:credential};const info=await signingApi('access',payload) as Access;setAccess(info);setName(info.recipientName);
      const blob=await signingApi('document',payload,true) as Blob;const next=URL.createObjectURL(blob);setPdfUrl(old=>{if(old)URL.revokeObjectURL(old);return next});
    }catch(e:any){setError(e.message);googleCredential.current='';}finally{setBusy(false)}
  },[token]);
  useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl)},[pdfUrl]);
  useEffect(()=>{if(!ready||!target.current||!CLIENT_ID||!window.google)return;
    window.google.accounts.id.initialize({client_id:CLIENT_ID,callback:authenticate});
    target.current.replaceChildren();window.google.accounts.id.renderButton(target.current,{theme:'outline',size:'large',text:'signin_with',width:300});
  },[ready,authenticate]);
  async function downloadExecuted(){setBusy(true);setError('');try{const blob=await signingApi('executed-document',{token,googleIdToken:googleCredential.current},true) as Blob;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='signed-agreement.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  function draw(ev:React.PointerEvent<HTMLCanvasElement>){
    const canvas=canvasRef.current;if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d');if(!ctx)return;
    const x=(ev.clientX-rect.left)*canvas.width/rect.width,y=(ev.clientY-rect.top)*canvas.height/rect.height;
    if(ev.type==='pointerdown'){drawingRef.current=true;canvas.setPointerCapture(ev.pointerId);ctx.beginPath();ctx.moveTo(x,y);}
    if(ev.type==='pointermove'&&drawingRef.current){ctx.strokeStyle='#111827';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineTo(x,y);ctx.stroke();}
    if(ev.type==='pointerup'||ev.type==='pointercancel'){drawingRef.current=false;setSignatureImage(canvas.toDataURL('image/png'));}
  }
  async function sign(){if(!access||!googleCredential.current)return;setBusy(true);setError('');try{
    await signingApi('complete',{token,googleIdToken:googleCredential.current,typedName:name,documentSha256:access.documentSha256,signatureMethod,signatureImage:signatureMethod==='TYPE'?undefined:signatureImage,consentVersion:access.consentVersion,consent,authority});
    setCompleted(true);setAccess({...access,status:'SIGNED',signedDocumentAvailable:true});setPdfUrl('');
  }catch(e:any){setError(e.message)}finally{setBusy(false)}}
  return <main style={{minHeight:'100vh',background:'#FAFAFB',padding:'32px 16px'}}>
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={()=>setReady(true)}/>
    <div style={{maxWidth:850,margin:'0 auto',background:'#FFF',border:'1px solid #e5e7eb',borderRadius:20,padding:28}}>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:20}}><FileSignature color="#FF7A3D"/><div><h1 style={{fontSize:25,margin:0}}>Review & Sign Agreement</h1><p style={{margin:'4px 0 0',color:'#667085'}}>Private signing invitation · Seebot SalesOS</p></div></div>
      {error&&<div role="alert" style={{padding:14,borderRadius:10,background:'#FFF0EE',color:'#991B1B',marginBottom:18}}><AlertTriangle size={16} style={{verticalAlign:'middle'}}/> {error}</div>}
      {(completed||access?.status==='SIGNED')?<div style={{padding:32,textAlign:'center'}}><CheckCircle2 color="#188B4B" size={48}/><h2>Your signature was recorded.</h2><p>The executed document is available to the verified signer for 30 days after signing.</p><button disabled={busy||!googleCredential.current} onClick={downloadExecuted} style={{border:0,borderRadius:8,background:'#FF7A3D',padding:12,color:'#fff',fontWeight:700}}>Download signed PDF</button></div>:!access?<section style={{padding:'12px 0 24px'}}>
        <p><LockKeyhole size={17} style={{verticalAlign:'middle'}}/> This document can only be accessed by the exact Google account invited by the sender.</p>
        <p style={{fontSize:14,color:'#667085'}}>Signing in does not create a SalesOS user account. We will record access and signature events for contract evidence.</p>
        {!CLIENT_ID?<p role="alert">The signer portal has not been configured. Ask the document sender for assistance.</p>:<div ref={target} style={{marginTop:26}}/>}
        {busy&&<p>Verifying access…</p>}
      </section>:<section>
        <p><ShieldCheck size={16} color="#188B4B" style={{verticalAlign:'middle'}}/> Verified recipient: <strong>{access.recipientEmail}</strong></p>
        <p style={{fontSize:14,color:'#667085'}}>Document: {access.documentName} · Expires: {new Date(access.expiresAt).toLocaleString()}</p>
        <div style={{background:'#F5F5F6',padding:12,borderRadius:10,marginBottom:18}}><Eye size={17} style={{verticalAlign:'middle'}}/> Review the entire document before you sign. An open/view event is recorded, but is not proof that each page was read.</div>
        {pdfUrl&&<iframe title="Contract PDF for review" src={pdfUrl+'#toolbar=1'} style={{height:'55vh',minHeight:350,width:'100%',border:'1px solid #d0d5dd',borderRadius:10}}/>}
        <div style={{marginTop:22,display:'grid',gap:14}}><label style={{display:'grid',gap:6,fontWeight:600}}>Your full legal name<input style={{padding:12,border:'1px solid #cbd5e1',borderRadius:8}} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
          <label style={{display:'grid',gap:6}}>Signature method
           <select value={signatureMethod} onChange={e=>{setSignatureMethod(e.target.value as any);setSignatureImage('')}} style={{padding:10,border:'1px solid #cbd5e1',borderRadius:8}}>
            <option value="TYPE">Type full name</option><option value="DRAW">Draw signature</option><option value="UPLOAD">Upload signature image</option>
           </select>
          </label>
          {signatureMethod==='DRAW'&&<div><canvas ref={canvasRef} width={500} height={160} onPointerDown={draw} onPointerMove={draw} onPointerUp={draw} onPointerCancel={draw} style={{touchAction:'none',border:'1px solid #cbd5e1',width:'100%',height:160,borderRadius:8}}/><button type="button" onClick={()=>{const canvas=canvasRef.current;canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);setSignatureImage('')}}>Clear drawing</button></div>}
          {signatureMethod==='UPLOAD'&&<label>Signature PNG (250 KB max)<input type="file" accept="image/png" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>250000){setError('PNG must be under 250 KB.');return;}const reader=new FileReader();reader.onload=()=>setSignatureImage(String(reader.result||''));reader.readAsDataURL(file);}}/></label>}
          <label style={{display:'flex',alignItems:'start',gap:9}}><input type="checkbox" checked={authority} onChange={e=>setAuthority(e.target.checked)}/>I confirm I am authorized to sign on behalf of the named party.</label>
          <label style={{display:'flex',alignItems:'start',gap:9}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{access.consentText}</label>
          <button type="button" disabled={busy||!consent||!authority||name.trim().length<3||(signatureMethod!=='TYPE'&&!signatureImage)} onClick={sign} style={{background:'#FF7A3D',color:'#fff',border:0,padding:14,borderRadius:9,fontWeight:700,cursor:'pointer',opacity:busy?0.5:1}}>{busy?'Recording signature…':'Confirm & Electronically Sign'}</button>
          <p style={{fontSize:12,color:'#667085'}}>Signing creates a visible PDF attestation page and a separate signing audit record. This is an electronic signature, not a qualified digital certificate.</p>
        </div>
      </section>}
    </div>
  </main>;
}
