import {CallHandler,ExecutionContext,Injectable,NestInterceptor,UnauthorizedException} from '@nestjs/common';
import {WorkspaceAccessService} from './workspace-access.service';

/** Defense in depth after identity guards: stale tabs and new routes cannot choose a foreign tenant. */
@Injectable()
export class WorkspaceBoundaryInterceptor implements NestInterceptor{
 constructor(private access:WorkspaceAccessService){}
 async intercept(context:ExecutionContext,next:CallHandler){
  const req=context.switchToHttp().getRequest();
  const route=String(req.route?.path||'');
  const orgId=req.params?.orgId||req.params?.organizationId||(/\bworkspaces\/:id(?:\/|$)/.test(route)&&!route.endsWith('/select')?req.params?.id:null);
  if(orgId){
   if(!req.user)throw new UnauthorizedException('Workspace authentication required.');
   await this.access.require(req,orgId);
  }
  return next.handle();
 }
}
