'use client';
import {useEffect} from 'react';
import {useParams,useRouter} from 'next/navigation';
import {request} from '@/lib/api';
/** Preserve existing bookmarks without opening the duplicate AI workspace. */
export default function IntelligenceAccountRedirect(){
  const params=useParams(),router=useRouter(),accountId=String(params.id);
  useEffect(()=>{let active=true;request<{opportunities:{id:string;status:string}[]}>(`/accounts/${accountId}`)
    .then(account=>{if(active){const opportunity=account.opportunities.find(o=>o.status==='OPEN')||account.opportunities[0];router.replace(opportunity?`/opportunities/${opportunity.id}`:'/prospects');}})
    .catch(()=>{if(active)router.replace('/prospects')});return()=>{active=false};
  },[accountId,router]);
  return <div className="panel" role="status">Opening the integrated Opportunity Workspace…</div>;
}
