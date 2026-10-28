import {ForbiddenException,Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthRequest} from '../common/auth.guard';

export type WorkspacePermission='read'|'sales'|'finance'|'admin'|'mail';
export const WORKSPACE_PERMISSIONS:Record<WorkspacePermission,readonly string[]>={
 read:['OWNER','ADMIN','MEMBER','FINANCE','VIEWER'],
 sales:['OWNER','ADMIN','MEMBER'],
 finance:['OWNER','ADMIN','FINANCE'],
 admin:['OWNER','ADMIN'],
 mail:['OWNER','ADMIN','MEMBER','FINANCE']
};
export function assertWorkspacePermission(role:string,permission:WorkspacePermission){
 if(!WORKSPACE_PERMISSIONS[permission].includes(role))throw new ForbiddenException('Your workspace role cannot perform this action.');
}
/** Platform roles never confer access to an independent organization. */
@Injectable()
export class WorkspaceAccessService{
 constructor(private db:PrismaService){}
 async require(req:AuthRequest&{selectedWorkspace?:string|null},organizationId:string,permission:WorkspacePermission='read'){
  if(req.selectedWorkspace!==organizationId)throw new ForbiddenException('Select this workspace first.');
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId,userId:req.user.id}},include:{organization:true}});
  if(!member||member.status!=='ACTIVE'||!['SETUP','ACTIVE'].includes(member.organization.status))throw new ForbiddenException('Active workspace membership required.');
  assertWorkspacePermission(member.role,permission);
  return member;
 }
}
