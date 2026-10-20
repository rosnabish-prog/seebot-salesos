import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { mayAccessLegacySeebotWorkspace } from '../workspace/workspace-policy';
export interface AuthUser { id: string; email: string; name: string; role: UserRole; organizationId?:string; }
export type AuthRequest = Request & { user: AuthUser };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.salesos_session;
    if (!token) throw new UnauthorizedException('Please sign in.');
    let payload: {sub:string;pv?:number;wid?:string;purpose?:string;mfa?:boolean;exp?:number};
    try { payload = await this.jwt.verifyAsync(token); } catch { throw new UnauthorizedException('Session expired.'); }
    if(payload.purpose!=='session'||payload.mfa!==true)throw new UnauthorizedException('Complete two-factor verification to continue.');
    const user = await this.db.user.findUnique({ where: { id: payload.sub }, select: { id:true,email:true,name:true,role:true,active:true,passwordVersion:true } });
    if (!user || !user.active) throw new UnauthorizedException('Account disabled.');
    if (payload.pv !== user.passwordVersion) throw new UnauthorizedException('Session needs renewal. Please sign in again.');
    // Existing CRM controllers use global IDs. Never allow a non-Seebot workspace
    // to reach those routes until every legacy query is tenant-scoped.
    const seebot=await this.db.organization.findUnique({where:{slug:'seebot'},select:{id:true}});
    if(!seebot)throw new ForbiddenException('Run the Seebot organization bootstrap first.');
    const membership=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:seebot.id,userId:user.id}},select:{status:true}});
    if(payload.wid && payload.wid!==seebot.id)throw new ForbiddenException('This workspace cannot use the legacy CRM until organization isolation is completed.');
    if(!mayAccessLegacySeebotWorkspace('seebot',membership?.status||'NONE'))throw new ForbiddenException('Not authorized for the Seebot workspace.');
    req.user = { id:user.id,email:user.email,name:user.name,role:user.role,organizationId:seebot.id };
    return true;
  }
}
export function allowManageAll(user: AuthUser) { return ['SUPER_ADMIN','CEO','DIRECTOR','SALES_MANAGER'].includes(user.role); }
export function requireManager(user: AuthUser) {
  if (!['SUPER_ADMIN','SALES_MANAGER'].includes(user.role)) throw new ForbiddenException('Manager approval required.');
}
export function ensureOwner(user: AuthUser, ownerId: string) {
  if (!allowManageAll(user) && user.id !== ownerId) throw new ForbiddenException('This record is not assigned to you.');
}
export function ensureCanEdit(user: AuthUser, ownerId: string) {
  if (['CEO','DIRECTOR','TECHNICAL_REVIEWER'].includes(user.role)) throw new ForbiddenException('Your role has read-only opportunity access.');
  ensureOwner(user,ownerId);
}
