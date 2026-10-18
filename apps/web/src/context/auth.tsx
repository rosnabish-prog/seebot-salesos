'use client';
import { createContext,useContext,useEffect,useState,useCallback,ReactNode } from 'react';
import { request,post } from '../lib/api';
export type User={id:string;name:string;email:string;role:string};
interface AuthContextValue { user:User|null;loading:boolean;login:(email:string,password:string)=>Promise<User>;logout:()=>Promise<void>;refresh:()=>Promise<void> }
const AuthContext=createContext<AuthContextValue|null>(null);
export function AuthProvider({children}:{children:ReactNode}){
  const[user,setUser]=useState<User|null>(null);const[loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{try{setUser(await request<User>('/auth/me'));}catch{setUser(null);}finally{setLoading(false);}},[]);
  useEffect(()=>{void refresh();},[]);
  const login=async(email:string,password:string)=>{const {user}=await post<{user:User}>('/auth/login',{email,password});setUser(user);return user;};
  const logout=async()=>{try{await post('/auth/logout',{});}finally{setUser(null);}};
  return <AuthContext.Provider value={{user,loading,login,logout,refresh}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw Error('AuthProvider missing');return v;}
export const mayEdit=(role?:string)=>['SUPER_ADMIN','SALES_MANAGER','SALES_REP'].includes(role||'');
export const executive=(role?:string)=>['CEO','DIRECTOR','SUPER_ADMIN'].includes(role||'');
