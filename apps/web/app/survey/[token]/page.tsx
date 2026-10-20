'use client';
import {useParams} from 'next/navigation';
import {useEffect,useState,FormEvent} from 'react';
import {post,request} from '@/lib/api';
type Question={id:string;label:string;kind:'RATING_5'|'TEXT'|'SINGLE_CHOICE'|'MULTIPLE_CHOICE';required:boolean;options?:string[]};
type Invitation={company:string;title:string;question:string;type:'NPS'|'CSAT';status:string;isDemo:boolean;questions:Question[]};
type Answer=string|number|string[];
export default function ExternalSurvey(){
 const token=String(useParams().token||''),[info,setInfo]=useState<Invitation|null>(null),[score,setScore]=useState<number|null>(null),[feedback,setFeedback]=useState(''),[answers,setAnswers]=useState<Record<string,Answer>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false);
 useEffect(()=>{request<Invitation>(`/surveys/${encodeURIComponent(token)}`).then(setInfo).catch(e=>setError(e.message))},[token]);
 const update=(id:string,value:Answer)=>setAnswers(p=>({...p,[id]:value}));
 async function submit(e:FormEvent){e.preventDefault();if(score===null)return;setBusy(true);setError('');try{await post(`/surveys/${encodeURIComponent(token)}/respond`,{score,feedback,answers});setSent(true)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <main style={{minHeight:'100dvh',background:'#F7F8FA',display:'grid',placeItems:'center',padding:20,fontFamily:'Afacad, sans-serif'}}><section style={{width:'min(100%,620px)',padding:30,borderRadius:18,background:'white',boxShadow:'0 6px 32px #0000000b'}}>
 <p style={{color:'#B84B1B',fontWeight:700}}>Client feedback</p>
 {sent?<><h1>Thank you for your feedback.</h1><p>Your response has been recorded.</p></>:error&&!info?<p role="alert">{error}</p>:info?<><h1>{info.title}</h1><p>Requested by {info.company}{info.isDemo?' · DEMO ONLY':''}</p>
 {info.status==='ANSWERED'?<p>This survey has already been completed.</p>:<form onSubmit={submit}>
  <p style={{fontSize:20}}>{info.question}</p><div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'16px 0'}}>{Array.from({length:info.type==='NPS'?11:6},(_,i)=><button key={i} type="button" aria-pressed={score===i} onClick={()=>setScore(i)} style={{border:'1px solid #DBE0E5',borderRadius:9,padding:'9px 13px',background:score===i?'#B84B1B':'#fff',color:score===i?'#fff':'#222',cursor:'pointer'}}>{i}</button>)}</div>
  {(info.questions||[]).map(q=><fieldset key={q.id} style={{border:0,padding:'16px 0',margin:0,borderTop:'1px solid #E8EBEE'}}><legend style={{fontWeight:700,padding:'10px 0'}}>{q.label}{q.required?' *':''}</legend>
   {q.kind==='RATING_5'&&<div style={{display:'flex',gap:7}}>{[1,2,3,4,5].map(n=><button type="button" key={n} aria-pressed={answers[q.id]===n} onClick={()=>update(q.id,n)} style={{border:'1px solid #DBE0E5',borderRadius:8,padding:'9px 15px',background:answers[q.id]===n?'#B84B1B':'white',color:answers[q.id]===n?'white':'#232933'}}>{n}</button>)}</div>}
   {q.kind==='TEXT'&&<textarea rows={3} maxLength={2000} required={q.required} value={typeof answers[q.id]==='string'?answers[q.id] as string:''} onChange={e=>update(q.id,e.target.value)} style={{display:'block',width:'100%',border:'1px solid #DADDE2',borderRadius:8,padding:10}}/>}
   {q.kind==='SINGLE_CHOICE'&&<select required={q.required} value={typeof answers[q.id]==='string'?answers[q.id] as string:''} onChange={e=>update(q.id,e.target.value)} style={{width:'100%',border:'1px solid #DADDE2',borderRadius:8,padding:10}}><option value="">Choose an option</option>{q.options?.map(x=><option key={x} value={x}>{x}</option>)}</select>}
   {q.kind==='MULTIPLE_CHOICE'&&<div style={{display:'grid',gap:9}}>{q.options?.map(x=><label key={x} style={{display:'flex',gap:9,alignItems:'center'}}><input type="checkbox" checked={Array.isArray(answers[q.id])&&(answers[q.id] as string[]).includes(x)} onChange={e=>{const prev=Array.isArray(answers[q.id])?answers[q.id] as string[]:[];update(q.id,e.target.checked?[...prev,x]:prev.filter(a=>a!==x));}}/>{x}</label>)}</div>}
  </fieldset>)}
  <label>Additional feedback (optional)<textarea rows={4} maxLength={4000} value={feedback} onChange={e=>setFeedback(e.target.value)} style={{display:'block',width:'100%',padding:12,marginTop:8,border:'1px solid #DADDE2',borderRadius:8}}/></label>
  {error&&<p role="alert" style={{color:'#B91C1C'}}>{error}</p>}
  <button type="submit" disabled={busy||score===null} style={{background:'#B84B1B',border:0,padding:'12px 20px',color:'#fff',borderRadius:9,marginTop:14,cursor:'pointer'}}>{busy?'Submitting…':'Submit feedback'}</button>
 </form>}</>:<p role="status">Loading survey…</p>}
 </section></main>;
}
