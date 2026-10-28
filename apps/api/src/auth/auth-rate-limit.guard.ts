import {CanActivate,ExecutionContext,Injectable} from '@nestjs/common';
import {AuthRateLimitService} from './auth-rate-limit.service';

@Injectable()
export class AuthRateLimitGuard implements CanActivate{
 constructor(private limits:AuthRateLimitService){}
 async canActivate(context:ExecutionContext){
  const req=context.switchToHttp().getRequest(),res=context.switchToHttp().getResponse();
  if(req.method!=='POST')return true;
  const path=String(req.path||'');
  if(!/^\/api\/(auth\/|workspace-invitations\/accept|employee-invitations\/accept|signing\/)/.test(path))return true;
  const ip=String(req.ip||req.socket?.remoteAddress||'unknown');
  try{
   await this.limits.consume('auth-ip',ip,150,15*60_000);
   if(/\/auth\/(login|register|forgot-password)$/.test(path)){
    const email=String(req.body?.email||'').trim().toLowerCase().slice(0,254);
    await this.limits.consume('auth-identity:'+path,email,12,15*60_000);
   }
   const challenge=String(req.body?.challengeId||'').slice(0,150);
   if(challenge)await this.limits.consume('auth-challenge:'+path,challenge,10,10*60_000);
  }catch(error:any){
   const response=error?.getResponse?.();if(response?.retryAfter)res.setHeader('Retry-After',String(response.retryAfter));
   throw error;
  }
  return true;
 }
}
