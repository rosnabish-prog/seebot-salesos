import {Body,Controller,Delete,ForbiddenException,Get,Param,Patch,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {IdentityGuard} from './identity.guard';
import {TenantScopeService,type ScopedRequest} from './tenant-scope.service';
import {defaultPipelineConfig,parsePipelineConfig,validatePipelineConfig} from './pipeline-config';

@UseGuards(IdentityGuard)
@Controller('workspace-pipeline')
export class PipelineSettingsController{
 constructor(private db:PrismaService,private scope:TenantScopeService){}
 private async admin(req:ScopedRequest,orgId:string){
  const member=await this.scope.membership(req,orgId,true);
  if(!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('Workspace administrator required.');
  return member;
 }
 @Get(':orgId') async get(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.scope.membership(req,orgId);
  const settings=await this.db.workspaceSettings.findUnique({where:{organizationId:orgId},select:{pipelineConfig:true}});
  return parsePipelineConfig(settings?.pipelineConfig);
 }
 @Patch(':orgId') async update(@Req()req:ScopedRequest,@Param('orgId')orgId:string,@Body()body:unknown){
  await this.admin(req,orgId);
  const config=validatePipelineConfig(body);
  await this.db.workspaceSettings.upsert({where:{organizationId:orgId},create:{organizationId:orgId,pipelineConfig:config as any},update:{pipelineConfig:config as any}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'PIPELINE_CONFIGURATION_UPDATED',entityType:'ORGANIZATION',entityId:orgId,detail:{version:config.version,stages:config.stages.map(s=>({id:s.id,label:s.label,fields:s.fields.length}))}}});
  return config;
 }
 @Delete(':orgId') async reset(@Req()req:ScopedRequest,@Param('orgId')orgId:string){
  await this.admin(req,orgId);
  const config=defaultPipelineConfig();
  await this.db.workspaceSettings.upsert({where:{organizationId:orgId},create:{organizationId:orgId,pipelineConfig:config as any},update:{pipelineConfig:config as any}});
  await this.db.auditEvent.create({data:{actorId:req.user.id,action:'PIPELINE_CONFIGURATION_RESET',entityType:'ORGANIZATION',entityId:orgId,detail:{version:1}}});
  return config;
 }
}
