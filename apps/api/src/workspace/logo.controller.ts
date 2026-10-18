import {BadRequestException,Controller,ForbiddenException,Get,Param,Post,Req,Res,StreamableFile,UploadedFile,UseGuards,UseInterceptors} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import type {Response} from 'express';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthRequest} from '../common/auth.guard';
import {IdentityGuard} from './identity.guard';
const folder=process.env.ORGANIZATION_LOGO_STORAGE_DIR||path.resolve(process.cwd(),'private-organization-logos');
@UseGuards(IdentityGuard)@Controller('workspaces')
export class WorkspaceLogoController{
 constructor(private db:PrismaService){}
 private async member(req:AuthRequest,id:string,edit=false){const membership=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:id,userId:req.user.id}}});if(membership?.status!=='ACTIVE'||edit&&!['OWNER','ADMIN'].includes(membership.role))throw new ForbiddenException('Workspace membership required.');return membership;}
 @Post(':id/logo')@UseInterceptors(FileInterceptor('file',{limits:{fileSize:2*1024*1024}}))async upload(@Req()req:AuthRequest,@Param('id')id:string,@UploadedFile()file:any){await this.member(req,id,true);
  if(!file?.buffer||file.buffer.length<16)throw new BadRequestException('PNG or JPEG logo required.');
  const png=file.buffer.subarray(0,8).toString('hex')==='89504e470d0a1a0a',jpeg=file.buffer[0]===0xff&&file.buffer[1]===0xd8&&file.buffer[2]===0xff;
  if(!png&&!jpeg)throw new BadRequestException('Only PNG and JPEG logos are accepted.');
  const storageKey=randomUUID()+(png?'.png':'.jpg'),hash=createHash('sha256').update(file.buffer).digest('hex');await mkdir(folder,{recursive:true,mode:0o700});await writeFile(path.join(folder,storageKey),file.buffer,{flag:'wx',mode:0o600});
  await this.db.organization.update({where:{id},data:{logoStorageKey:storageKey,logoSha256:hash,logoUrl:null}});
  return {uploaded:true,sha256:hash,privateLogoEndpoint:`/api/workspaces/${id}/logo`};
 }
 @Get(':id/logo')async download(@Req()req:AuthRequest,@Param('id')id:string,@Res({passthrough:true})res:Response){await this.member(req,id);const org=await this.db.organization.findUnique({where:{id},select:{logoStorageKey:true,logoSha256:true}});if(!org?.logoStorageKey||!org.logoSha256)throw new BadRequestException('Logo not uploaded.');const bytes=await readFile(path.join(folder,path.basename(org.logoStorageKey)));if(createHash('sha256').update(bytes).digest('hex')!==org.logoSha256)throw new ForbiddenException('Logo integrity check failed.');res.setHeader('Content-Type',org.logoStorageKey.endsWith('.png')?'image/png':'image/jpeg');res.setHeader('Cache-Control','private, no-store');return new StreamableFile(bytes);}
}
