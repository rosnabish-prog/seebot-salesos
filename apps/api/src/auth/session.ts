import type {Response} from 'express';
export const SESSION_MAX_AGE_MS=7*24*60*60*1000;
export const WORKSPACE_MAX_AGE_MS=SESSION_MAX_AGE_MS;
export function setSessionCookie(res:Response,token:string){
 res.cookie('salesos_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:SESSION_MAX_AGE_MS,path:'/'});
}
export function setWorkspaceCookie(res:Response,token:string){
 res.cookie('salesos_workspace',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:WORKSPACE_MAX_AGE_MS,path:'/'});
}
export function clearAuthCookies(res:Response){
 const options={path:'/' as const,sameSite:'strict' as const,secure:process.env.NODE_ENV==='production'};
 res.clearCookie('salesos_session',options);res.clearCookie('salesos_workspace',options);
}
