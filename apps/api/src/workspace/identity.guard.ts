import {CanActivate,ExecutionContext,Injectable,UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthRequest} from '../common/auth.guard';
/** Identity-only JWT guard for workspace profile operations. Never use for legacy CRM records. */
@Injectable()
export class IdentityGuard implements CanActivate{
 constructor(private jwt:JwtService,private db:PrismaService){}
 async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest<AuthRequest>();const token=req.cookies?.salesos_session;if(!token)throw new UnauthorizedException('Sign in required.');let payload:any;try{payload=await this.jwt.verifyAsync(token);}catch{throw new UnauthorizedException('Session expired.');}const user=await this.db.user.findUnique({where:{id:payload.sub},select:{id:true,email:true,name:true,role:true,active:true,passwordVersion:true}});if(payload.purpose!=='session'||payload.mfa!==true)throw new UnauthorizedException('Complete two-factor verification.');if(!user?.active||payload.pv!==user.passwordVersion)throw new UnauthorizedException('Session invalid.');req.user={id:user.id,email:user.email,name:user.name,role:user.role};(req as any).selectedWorkspace=payload.wid||null;(req as any).sessionExpiresAt=payload.exp;return true;}
}
