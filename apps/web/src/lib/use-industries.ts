 'use client';
import {useEffect,useState} from 'react';
import {request} from '@/lib/api';
export type Industry={id:string;name:string;active:boolean};
const fallback=['Sports Computer Vision','Autonomous Systems','Industrial AI','AI / NLP','Aerial Imagery','Insurance','Other'];
export function useIndustries(){
 const [industries,setIndustries]=useState<Industry[]>(fallback.map((name,i)=>({id:`fallback-${i}`,name,active:true})));
 const [loading,setLoading]=useState(true);
 const reload=()=>request<Industry[]>('/industries').then(setIndustries).finally(()=>setLoading(false));
 useEffect(()=>{void reload().catch(()=>setLoading(false));},[]);
 return {industries,loading,reload};
}
