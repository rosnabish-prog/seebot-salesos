import {BadRequestException,Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,requireManager} from '../common/auth.guard';
const defaults=['Executive Summary','Delivery Performance','Commercial Overview','Client Feedback','Risks & Issues','Decisions & Next Actions'];
@UseGuards(AuthGuard) @Controller('report-templates')
export class ReportTemplatesController {
 constructor(private db:PrismaService){}
 private async org(){const org=await this.db.organization.findUnique({where:{slug:'seebot'}});if(!org)throw new BadRequestException('Bootstrap workspace first.');return org;}
 @Get()async list(@Req()req:AuthRequest){const org=await this.org();return this.db.reportTemplate.findMany({where:{organizationId:org.id,active:true},orderBy:{createdAt:'desc'}});}
 @Post()async create(@Req()req:AuthRequest,@Body()body:any){requireManager(req.user);const org=await this.org(),name=String(body?.name||'').trim();if(name.length<3||name.length>150||!['MBR','QBR'].includes(body?.type))throw new BadRequestException('Template name and type required.');const sections=body.sections===undefined?defaults:body.sections;if(!Array.isArray(sections)||sections.length<2||sections.length>30||sections.some((x:any)=>typeof x!=='string'||x.length>100))throw new BadRequestException('Sections must be a list of 2–30 headings.');return this.db.reportTemplate.create({data:{organizationId:org.id,name,type:body.type,sections}});}
}
