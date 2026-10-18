import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard, AuthRequest } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { INDUSTRIES } from '@seebot/shared';
@UseGuards(AuthGuard) @Controller('industries')
export class IndustriesController {
 constructor(private db: PrismaService) {}
 @Get() async list() {
  const rows=await this.db.industry.findMany({orderBy:{name:'asc'}});
  if(rows.length) return rows;
  return INDUSTRIES.map((name,i)=>({id:`default-${i}`,name,active:true}));
 }
 @Post() async add(@Req()req:AuthRequest,@Body()body:{name:string}){
  if(req.user.role!=='SUPER_ADMIN')throw new ForbiddenException('Administrator access required');
  const name=String(body.name||'').trim();
  if(name.length<2||name.length>80)throw new BadRequestException('Industry name must be between 2 and 80 characters');
  const existing=await this.db.industry.findFirst({where:{name:{equals:name,mode:'insensitive'}}});
  if(existing)throw new BadRequestException('Industry already exists');
  return this.db.industry.create({data:{name}});
 }
 @Patch(':id') async edit(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{name?:string;active?:boolean}){
  if(req.user.role!=='SUPER_ADMIN')throw new ForbiddenException('Administrator access required');
  const record=await this.db.industry.findUnique({where:{id}});
  if(!record)throw new BadRequestException('Industry not found');
  const name=body.name===undefined?record.name:String(body.name).trim();
  if(name.length<2||name.length>80)throw new BadRequestException('Invalid industry name');
  if(body.active!==undefined&&typeof body.active!=='boolean')throw new BadRequestException('active must be boolean');
  return this.db.industry.update({where:{id},data:{name,active:body.active??record.active}});
 }
}
