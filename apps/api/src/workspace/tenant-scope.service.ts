import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {WorkspaceAccessService,type WorkspacePermission} from './workspace-access.service';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthRequest} from '../common/auth.guard';
export type ScopedRequest=AuthRequest & {selectedWorkspace?:string|null};
/** Every tenant route MUST resolve ownership from the membership and persisted record, never from a caller-provided ownerId. */
@Injectable()
export class TenantScopeService{
 constructor(private db:PrismaService,private access:WorkspaceAccessService=new WorkspaceAccessService(db)){}
 preview(){return process.env.NODE_ENV!=='production'&&process.env.TENANT_SCOPED_CRM_PREVIEW==='true';}
 enabled(){return this.preview()||(process.env.NODE_ENV==='production'&&process.env.TENANT_SCOPED_CRM_PRODUCTION_ENABLED==='true');}
 async membership(req:ScopedRequest,organizationId:string,write:boolean|WorkspacePermission=false){
  if(!this.enabled())throw new ForbiddenException('Tenant CRM is disabled for this deployment.');
  return this.access.require(req,organizationId,typeof write==='string'?write:write?'sales':'read');
 }
 async account(organizationId:string,accountId:string){
  const a=await this.db.account.findFirst({where:{id:accountId,organizationId}});
  if(!a)throw new NotFoundException('Account unavailable in this workspace.');return a;
 }
 async opportunity(organizationId:string,id:string){
  const o=await this.db.opportunity.findFirst({where:{id,account:{organizationId}},include:{account:true}});
  if(!o)throw new NotFoundException('Opportunity unavailable in this workspace.');return o;
 }
 async contract(organizationId:string,id:string){
  const c=await this.db.contract.findFirst({where:{id,opportunity:{account:{organizationId}}},include:{opportunity:{include:{account:true}}}});
  if(!c)throw new NotFoundException('Contract unavailable in this workspace.');return c;
 }
 async invoice(organizationId:string,id:string){
  const i=await this.db.invoice.findFirst({where:{id,account:{organizationId}},include:{account:true}});
  if(!i)throw new NotFoundException('Invoice unavailable in this workspace.');return i;
 }
 assertFictional(domain:string){if(this.preview()&&!domain.endsWith('.example')&&!domain.endsWith('.invalid'))throw new BadRequestException('Preview workspaces support fictional customers only.');}
}
