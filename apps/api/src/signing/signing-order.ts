/** The first uncompleted required signer is the only signer authorized to proceed. */
export interface SigningParty {id:string;email?:string;role:string;status:string;signingOrder:number;createdAt:Date}
export function nextRequiredSigner(parties:SigningParty[]){return parties.filter(x=>x.role==='SIGNER'||x.role==='APPROVER').sort((a,b)=>a.signingOrder-b.signingOrder||a.createdAt.getTime()-b.createdAt.getTime()||a.id.localeCompare(b.id)).find(x=>x.status!=='SIGNED')||null;}
export function fullyExecuted(parties:SigningParty[]){return parties.some(x=>x.role==='SIGNER'||x.role==='APPROVER')&&!nextRequiredSigner(parties);}
