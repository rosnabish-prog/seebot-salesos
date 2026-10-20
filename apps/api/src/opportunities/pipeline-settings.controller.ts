import {BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,Patch,Req,UseGuards} from '@nestjs/common';
import {AuthGuard,AuthRequest} from '../common/auth.guard';
import {PrismaService} from '../prisma/prisma.service';
import {STAGES,STAGE_FIELDS} from '@seebot/shared';
import {EMPTY_PIPELINE_CONFIG,safePipelineConfig,validatePipelineConfig} from './pipeline-config';

@UseGuards(AuthGuard) @Controller('pipeline-settings')
export class PipelineSettingsController{
 constructor(private db:PrismaService){}
 @Get()async get(@Req()req:AuthRequest){
   const organizationId=req.user.organizationId!;
   const settings=await this.db.workspaceSettings.findUnique({where:{organizationId},select:{pipelineConfig:true,pipelineVersion:true}});
   return {stages:STAGES,baseFields:STAGE_FIELDS,config:settings?safePipelineConfig(settings.pipelineConfig):EMPTY_PIPELINE_CONFIG,version:settings?.pipelineVersion||1,canEdit:req.user.role==='SUPER_ADMIN'};
 }
 @Patch()async update(@Req()req:AuthRequest,@Body()body:any){
   if(req.user.role!=='SUPER_ADMIN')throw new ForbiddenException('Only the workspace administrator may edit sales stage settings.');
   let config;try{config=validatePipelineConfig(body?.config);}catch(e){throw new BadRequestException(e instanceof Error?e.message:'Invalid pipeline configuration.');}
   if(!Number.isInteger(body?.version)||body.version<1)throw new BadRequestException('Current configuration version required.');
   const organizationId=req.user.organizationId!;
   return this.db.$transaction(async tx=>{
     const current=await tx.workspaceSettings.findUnique({where:{organizationId}});
     if(current&&current.pipelineVersion!==body.version)throw new ConflictException('Pipeline settings were changed by another administrator. Reload first.');
     if(!current&&body.version!==1)throw new ConflictException('Reload pipeline settings.');
     if(current){
       const changed=await tx.workspaceSettings.updateMany({where:{organizationId,pipelineVersion:body.version},data:{pipelineConfig:config,pipelineVersion:{increment:1}}});
       if(changed.count!==1)throw new ConflictException('Pipeline settings were updated concurrently.');
     }else await tx.workspaceSettings.create({data:{organizationId,pipelineConfig:config,pipelineVersion:2}});
     await tx.auditEvent.create({data:{actorId:req.user.id,action:'PIPELINE_CONFIGURATION_UPDATED',entityType:'ORGANIZATION',entityId:organizationId,detail:{version:body.version+1,customFieldCount:Object.values(config.extraFields).reduce((sum,list)=>sum+(list?.length||0),0)}}});
     return {config,version:body.version+1,notice:'Pipeline field settings saved. Mandatory system gates remain enforced.'};
   },{isolationLevel:'Serializable'});
 }
}
