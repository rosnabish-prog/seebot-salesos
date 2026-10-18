const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export class ApiError extends Error { constructor(public status:number, message:string){super(message);} }
export async function request<T=any>(path:string,init:RequestInit={}):Promise<T>{
  let response:Response;
  try{response=await fetch(`${API}/api${path}`,{...init,credentials:'include',headers:{...(init.body?{'Content-Type':'application/json'}:{}),...init.headers},cache:'no-store'});}catch{throw new ApiError(0,'Cannot connect to SalesOS API. Check that the API is running.');}
  if(!response.ok){let payload:any;try{payload=await response.json();}catch{};
    const msg=Array.isArray(payload?.message)?payload.message.join(', '):typeof payload?.message==='string'?payload.message:payload?.message?.message ||`Request failed (${response.status})`;
    throw new ApiError(response.status,msg);
  }
  if(response.status===204)return undefined as T;
  return response.json();
}
export function post<T=any>(path:string,data:unknown){return request<T>(path,{method:'POST',body:JSON.stringify(data)});}
export function patch<T=any>(path:string,data:unknown){return request<T>(path,{method:'PATCH',body:JSON.stringify(data)});}
export const fmtDate=(value?:string|null)=>value?new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Not set';
export const fmtShort=(value?:string|null)=>value?new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—';
export function ageDays(value:string){return Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86400000));}
export function currency(value:number|string|null|undefined,code='USD'){if(value==null)return 'Not set';return new Intl.NumberFormat('en-US',{style:'currency',currency:code,maximumFractionDigits:2}).format(Number(value));}
