import {CanActivate,ExecutionContext,Injectable,UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthRequest} from '../common/auth.guard';
import {SESSION_MAX_AGE_MS} from '../auth/session';
/** Identity-only guard. Full sessions require MFA; workspace context is a separate signed cookie. */
@Injectable()
export class IdentityGuard implements CanActivate{
 constructor(private jwt:JwtService,private db:PrismaService){}
 async canActivate(ctx:ExecutionContext){
  const req=ctx.switchToHttp().getRequest<AuthRequest>();
  const token=req.cookies?.salesos_session;
  if(!token)throw new UnauthorizedException('Sign in required.');
  let payload:any;
  try{payload=await this.jwt.verifyAsync(token);}catch{throw new UnauthorizedException('Session expired. Please sign in again.');}
  if(payload?.mfa!==true)throw new UnauthorizedException('Two-factor verification required.');
  if(typeof payload?.authAt!=='number'||Date.now()-payload.authAt>SESSION_MAX_AGE_MS)throw new UnauthorizedException('Your seven-day session has ended. Please sign in and verify again.');
  const user=await this.db.user.findUnique({where:{id:payload.sub},select:{id:true,email:true,name:true,role:true,active:true,passwordVersion:true}});
  if(!user?.active||payload.pv!==user.passwordVersion)throw new UnauthorizedException('Session invalid. Please sign in again.');
  req.user={id:user.id,email:user.email,name:user.name,role:user.role};
  let selected:string|null=payload.wid||null; // backward compatibility with older sessions
  const workspaceToken=req.cookies?.salesos_workspace;
  if(workspaceToken){
   try{const w:any=await this.jwt.verifyAsync(workspaceToken);if(w?.kind==='workspace'&&w?.sub===user.id&&typeof w?.wid==='string')selected=w.wid;else selected=null;}
   catch{selected=null;}
  }
  (req as any).selectedWorkspace=selected;
  return true;
 }
}
