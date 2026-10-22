'use client';
import { createContext,useContext,useEffect,useState,useCallback,ReactNode } from 'react';
import { request,post } from '../lib/api';
export type User={id:string;name:string;email:string;role:string};
export type MfaChallenge={mfaRequired:true;challengeId:string;method:'EMAIL';maskedEmail:string;testCode?:string};
interface AuthContextValue {
 user:User|null;loading:boolean;
 login:(email:string,password:string)=>Promise<MfaChallenge>;
 verifyMfa:(challengeId:string,code:string)=>Promise<User>;
 logout:()=>Promise<void>;refresh:()=>Promise<void>
}
const AuthContext=createContext<AuthContextValue|null>(null);
export function AuthProvider({children}:{children:ReactNode}){
 const[user,setUser]=useState<User|null>(null);const[loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{try{setUser(await request<User>('/auth/me'));}catch{setUser(null);}finally{setLoading(false);}},[]);
 useEffect(()=>{void refresh();},[refresh]);
 const login=async(email:string,password:string)=>post<MfaChallenge>('/auth/login',{email,password});
 const verifyMfa=async(challengeId:string,code:string)=>{const {user}=await post<{user:User}>('/auth/mfa/verify',{challengeId,code});setUser(user);return user;};
 const logout=async()=>{try{await post('/auth/logout',{});}finally{setUser(null);}};
 return <AuthContext.Provider value={{user,loading,login,verifyMfa,logout,refresh}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw Error('AuthProvider missing');return v;}
export const mayEdit=(role?:string)=>['SUPER_ADMIN','SALES_MANAGER','SALES_REP'].includes(role||'');
export const executive=(role?:string)=>['CEO','DIRECTOR','SUPER_ADMIN'].includes(role||'');
