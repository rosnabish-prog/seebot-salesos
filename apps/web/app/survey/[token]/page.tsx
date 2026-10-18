'use client';
import { useParams } from 'next/navigation';
import { useEffect,useState,FormEvent } from 'react';
import { post,request } from '@/lib/api';
type Invitation={company:string;title:string;question:string;type:'NPS'|'CSAT';status:string;isDemo:boolean};
export default function ExternalSurvey(){
 const token=String(useParams().token||'');const [info,setInfo]=useState<Invitation|null>(null),[score,setScore]=useState<number|null>(null),[feedback,setFeedback]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false);
 useEffect(()=>{request<Invitation>(`/surveys/${encodeURIComponent(token)}`).then(setInfo).catch(e=>setError(e.message))},[token]);
 async function submit(e:FormEvent){e.preventDefault();if(score===null)return;setBusy(true);setError('');try{await post(`/surveys/${encodeURIComponent(token)}/respond`,{score,feedback});setSent(true)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <main style={{minHeight:'100dvh',background:'#F7F8FA',display:'grid',placeItems:'center',padding:20,fontFamily:'Afacad, sans-serif'}}><section style={{width:'min(100%,560px)',padding:30,borderRadius:18,background:'white',boxShadow:'0 6px 32px #0000000b'}}>
 <p style={{color:'#D65A20',fontWeight:700}}>Client feedback</p>{sent?<><h1>Thank you for your feedback.</h1><p>Your response has been recorded.</p></>:error?<p role="alert">{error}</p>:info?<><h1>{info.title}</h1><p>Requested by {info.company}{info.isDemo?' · DEMO ONLY':''}</p>{info.status==='ANSWERED'?<p>This survey has already been completed.</p>:<form onSubmit={submit}><p style={{fontSize:20}}>{info.question}</p><div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'16px 0'}}>{Array.from({length:info.type==='NPS'?11:6},(_,i)=><button key={i} type="button" aria-pressed={score===i} onClick={()=>setScore(i)} style={{border:'1px solid #DBE0E5',borderRadius:9,padding:'9px 13px',background:score===i?'#FF7A3D':'#fff',color:score===i?'#fff':'#222',cursor:'pointer'}}>{i}</button>)}</div><label>Additional feedback (optional)<textarea rows={4} maxLength={4000} value={feedback} onChange={e=>setFeedback(e.target.value)} style={{display:'block',width:'100%',padding:12,marginTop:8,border:'1px solid #DADDE2',borderRadius:8}}/></label><button type="submit" disabled={busy||score===null} style={{background:'#FF7A3D',border:0,padding:'12px 20px',color:'#fff',borderRadius:9,marginTop:14,cursor:'pointer'}}>{busy?'Submitting…':'Submit feedback'}</button></form>}</>:<p>Loading survey…</p>}
 </section></main>;
}
